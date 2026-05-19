import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type {
  KiCadVariant,
  KiCadVariantComponent,
  VariantOverride
} from '../types';
import { findFirstWorkspaceFile } from '../utils/pathUtils';
import type { McpClient } from '../mcp/mcpClient';
import { createNonce } from '../utils/nonce';

interface VariantDocument {
  activeVariant?: string | undefined;
  variants?: Array<Record<string, unknown>> | undefined;
  design_variants?: Array<Record<string, unknown>> | undefined;
  [key: string]: unknown;
}

class VariantTreeItem extends vscode.TreeItem {
  constructor(
    public readonly variant: KiCadVariant,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(variant.name, collapsibleState);
    this.description = variant.isDefault
      ? 'default'
      : `${variant.componentOverrides.length} overrides`;
    this.contextValue = variant.isDefault ? 'variant-default' : 'variant';
    this.iconPath = new vscode.ThemeIcon(
      variant.isDefault ? 'star-full' : 'symbol-namespace'
    );
    this.command = {
      command: COMMANDS.setActiveVariant,
      title: 'Set Active Variant',
      arguments: [variant]
    };
  }
}

export class VariantProvider implements vscode.TreeDataProvider<
  KiCadVariant | VariantOverride
> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    KiCadVariant | VariantOverride | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private variants: KiCadVariant[] = [];
  private projectFile: string | undefined;

  constructor(private readonly mcpClient?: McpClient | undefined) {}

  refresh(): void {
    void this.loadVariants().then(() =>
      this.onDidChangeTreeDataEmitter.fire(undefined)
    );
  }

  getTreeItem(element: KiCadVariant | VariantOverride): vscode.TreeItem {
    if ('componentOverrides' in element) {
      return new VariantTreeItem(
        element,
        element.componentOverrides.length
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None
      );
    }

    const item = new vscode.TreeItem(
      element.reference,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = [
      element.enabled ? 'enabled' : 'disabled',
      element.valueOverride ? `value=${element.valueOverride}` : '',
      element.footprintOverride ? `footprint=${element.footprintOverride}` : ''
    ]
      .filter(Boolean)
      .join(' · ');
    item.contextValue = 'variant-override';
    item.iconPath = new vscode.ThemeIcon(
      element.enabled ? 'check' : 'circle-slash'
    );
    return item;
  }

  async getChildren(
    element?: KiCadVariant | VariantOverride
  ): Promise<Array<KiCadVariant | VariantOverride>> {
    if (element && 'componentOverrides' in element) {
      return element.componentOverrides;
    }
    if (element) {
      return [];
    }

    await this.loadVariants();
    return this.variants;
  }

  async getActiveVariantName(): Promise<string | undefined> {
    await this.loadVariants();
    return this.variants.find((variant) => variant.isDefault)?.name;
  }

  async listVariants(): Promise<KiCadVariant[]> {
    await this.loadVariants();
    return [...this.variants];
  }

  async getVariantByName(name: string): Promise<KiCadVariant | undefined> {
    await this.loadVariants();
    return this.variants.find((variant) => variant.name === name);
  }

  async createVariant(): Promise<void> {
    const projectFile = await this.ensureProjectFile();
    if (!projectFile) {
      return;
    }

    const name = await vscode.window.showInputBox({
      title: 'New KiCad variant',
      placeHolder: 'Assembly-A'
    });
    if (!name?.trim()) {
      return;
    }

    const document = readVariantDocument(projectFile);
    const variants = normalizeVariants(document);
    variants.push({
      name: name.trim(),
      isDefault: false,
      componentOverrides: []
    });
    document['variants'] = serializeVariants(variants);
    fs.writeFileSync(
      projectFile,
      `${JSON.stringify(document, null, 2)}\n`,
      'utf8'
    );
    this.refresh();
  }

  async setActive(variant: KiCadVariant): Promise<void> {
    const projectFile = await this.ensureProjectFile();
    if (!projectFile) {
      return;
    }

    const document = readVariantDocument(projectFile);
    const variants = normalizeVariants(document).map((item) => ({
      ...item,
      isDefault: item.name === variant.name
    }));
    document['activeVariant'] = variant.name;
    document['variants'] = serializeVariants(variants);
    fs.writeFileSync(
      projectFile,
      `${JSON.stringify(document, null, 2)}\n`,
      'utf8'
    );
    await this.syncActiveVariantToMcp(variant.name);
    this.refresh();
  }

  async diffBom(): Promise<void> {
    await this.loadVariants();
    if (this.variants.length < 2) {
      void vscode.window.showInformationMessage(
        'At least two variants are required to compare BOM differences.'
      );
      return;
    }

    const left = await vscode.window.showQuickPick(
      this.variants.map((variant) => variant.name),
      { title: 'Compare BOMs: first variant' }
    );
    if (!left) {
      return;
    }
    const right = await vscode.window.showQuickPick(
      this.variants
        .filter((variant) => variant.name !== left)
        .map((variant) => variant.name),
      { title: 'Compare BOMs: second variant' }
    );
    if (!right) {
      return;
    }

    const leftVariant = this.variants.find((variant) => variant.name === left);
    const rightVariant = this.variants.find(
      (variant) => variant.name === right
    );
    if (!leftVariant || !rightVariant) {
      return;
    }

    const changes = diffVariants(leftVariant, rightVariant);
    this.openBomDiffWebview(leftVariant, rightVariant, changes);
  }

  private async loadVariants(): Promise<void> {
    const projectFile = await this.ensureProjectFile();
    if (!projectFile) {
      this.variants = [];
      return;
    }

    const document = readVariantDocument(projectFile);
    this.variants = normalizeVariants(document);
  }

  private async ensureProjectFile(): Promise<string | undefined> {
    if (this.projectFile && fs.existsSync(this.projectFile)) {
      return this.projectFile;
    }
    this.projectFile = await findFirstWorkspaceFile('**/*.kicad_pro');
    return this.projectFile;
  }

  private async syncActiveVariantToMcp(name: string): Promise<void> {
    if (!this.mcpClient) {
      return;
    }
    try {
      const state = await this.mcpClient.testConnection();
      if (state.connected) {
        await this.mcpClient.callTool('variant_set_active', { name });
      }
    } catch {
      // Variant switching should remain local when MCP is unavailable.
    }
  }

  private openBomDiffWebview(
    left: KiCadVariant,
    right: KiCadVariant,
    changes: string[]
  ): void {
    const panel = vscode.window.createWebviewPanel(
      'kicadstudio.variantBomDiff',
      `BOM Diff: ${left.name} -> ${right.name}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
        localResourceRoots: []
      }
    );
    panel.webview.html = renderBomDiffHtml(left, right, changes);
  }
}

function readVariantDocument(projectFile: string): VariantDocument {
  try {
    return JSON.parse(fs.readFileSync(projectFile, 'utf8')) as VariantDocument;
  } catch {
    return {};
  }
}

function normalizeVariants(document: VariantDocument): KiCadVariant[] {
  const rawVariants = Array.isArray(document['variants'])
    ? document['variants']
    : Array.isArray(document['design_variants'])
      ? document['design_variants']
      : [];
  const activeVariant =
    typeof document['activeVariant'] === 'string'
      ? document['activeVariant']
      : undefined;

  const variants = rawVariants
    .map((value) => normalizeVariant(value, activeVariant))
    .filter((value): value is KiCadVariant => Boolean(value));

  if (!variants.length) {
    return [
      {
        name: activeVariant ?? 'Default',
        isDefault: true,
        componentOverrides: [],
        components: []
      }
    ];
  }

  if (!variants.some((variant) => variant.isDefault)) {
    const [firstVariant] = variants;
    if (firstVariant) {
      variants[0] = {
        ...firstVariant,
        isDefault: true
      };
    }
  }

  return variants;
}

function normalizeVariant(
  value: unknown,
  activeVariant: string | undefined
): KiCadVariant | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'] : undefined;
  if (!name) {
    return undefined;
  }

  const overridesSource = Array.isArray(record['componentOverrides'])
    ? record['componentOverrides']
    : Array.isArray(record['overrides'])
      ? record['overrides']
      : [];
  const componentsSource = Array.isArray(record['components'])
    ? record['components']
    : [];

  return {
    name,
    isDefault:
      record['isDefault'] === true ||
      record['default'] === true ||
      (activeVariant ? activeVariant === name : false),
    componentOverrides: overridesSource
      .map((item) => normalizeOverride(item))
      .filter((item): item is VariantOverride => Boolean(item)),
    components: componentsSource
      .map((item) => normalizeComponent(item))
      .filter((item): item is KiCadVariantComponent => Boolean(item))
  };
}

function normalizeOverride(value: unknown): VariantOverride | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const reference =
    typeof record['reference'] === 'string' ? record['reference'] : undefined;
  if (!reference) {
    return undefined;
  }
  const normalized: VariantOverride = {
    reference,
    enabled: record['enabled'] !== false
  };
  if (typeof record['valueOverride'] === 'string') {
    normalized.valueOverride = record['valueOverride'];
  } else if (typeof record['value'] === 'string') {
    normalized.valueOverride = record['value'];
  }
  if (typeof record['footprintOverride'] === 'string') {
    normalized.footprintOverride = record['footprintOverride'];
  } else if (typeof record['footprint'] === 'string') {
    normalized.footprintOverride = record['footprint'];
  }
  return normalized;
}

function normalizeComponent(value: unknown): KiCadVariantComponent | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const reference =
    typeof record['reference'] === 'string'
      ? record['reference']
      : typeof record['ref'] === 'string'
        ? record['ref']
        : undefined;
  if (!reference) {
    return undefined;
  }

  const component: KiCadVariantComponent = {
    reference,
    included: record['included'] !== false && record['dnp'] !== true
  };
  if (typeof record['value'] === 'string') {
    component.value = record['value'];
  }
  if (typeof record['footprint'] === 'string') {
    component.footprint = record['footprint'];
  }
  return component;
}

function serializeVariants(
  variants: KiCadVariant[]
): Array<Record<string, unknown>> {
  return variants.map((variant) => ({
    name: variant.name,
    isDefault: variant.isDefault,
    componentOverrides: variant.componentOverrides.map((override) => ({
      reference: override.reference,
      enabled: override.enabled,
      ...(override.valueOverride
        ? { valueOverride: override.valueOverride }
        : {}),
      ...(override.footprintOverride
        ? { footprintOverride: override.footprintOverride }
        : {})
    })),
    components: variant.components?.map((component) => ({
      reference: component.reference,
      included: component.included,
      ...(component.value ? { value: component.value } : {}),
      ...(component.footprint ? { footprint: component.footprint } : {})
    }))
  }));
}

function diffVariants(left: KiCadVariant, right: KiCadVariant): string[] {
  const overrideChanges = diffOverrides(
    left.componentOverrides,
    right.componentOverrides
  );
  const componentChanges = diffComponents(
    left.components ?? [],
    right.components ?? []
  );
  return [...overrideChanges, ...componentChanges];
}

function diffOverrides(
  left: VariantOverride[],
  right: VariantOverride[]
): string[] {
  const changes: string[] = [];
  const index = new Map<string, VariantOverride>();
  for (const item of left) {
    index.set(item.reference, item);
  }
  for (const item of right) {
    const previous = index.get(item.reference);
    if (!previous) {
      changes.push(`Added in target: ${item.reference}`);
      continue;
    }
    if (previous.enabled !== item.enabled) {
      changes.push(
        `${item.reference}: enabled ${previous.enabled} -> ${item.enabled}`
      );
    }
    if (previous.valueOverride !== item.valueOverride) {
      changes.push(
        `${item.reference}: value ${previous.valueOverride ?? 'base'} -> ${item.valueOverride ?? 'base'}`
      );
    }
    if (previous.footprintOverride !== item.footprintOverride) {
      changes.push(
        `${item.reference}: footprint ${previous.footprintOverride ?? 'base'} -> ${item.footprintOverride ?? 'base'}`
      );
    }
    index.delete(item.reference);
  }
  for (const remaining of index.values()) {
    changes.push(`Removed in target: ${remaining.reference}`);
  }
  return changes;
}

function diffComponents(
  left: KiCadVariantComponent[],
  right: KiCadVariantComponent[]
): string[] {
  const changes: string[] = [];
  const index = new Map<string, KiCadVariantComponent>();
  for (const item of left) {
    index.set(item.reference, item);
  }
  for (const item of right) {
    const previous = index.get(item.reference);
    if (!previous) {
      changes.push(`Added component in target: ${item.reference}`);
      continue;
    }
    if (previous.included !== item.included) {
      changes.push(
        `${item.reference}: included ${previous.included} -> ${item.included}`
      );
    }
    if (previous.value !== item.value) {
      changes.push(
        `${item.reference}: value ${previous.value ?? 'base'} -> ${item.value ?? 'base'}`
      );
    }
    if (previous.footprint !== item.footprint) {
      changes.push(
        `${item.reference}: footprint ${previous.footprint ?? 'base'} -> ${item.footprint ?? 'base'}`
      );
    }
    index.delete(item.reference);
  }
  for (const remaining of index.values()) {
    changes.push(`Removed component in target: ${remaining.reference}`);
  }
  return changes;
}

function renderBomDiffHtml(
  left: KiCadVariant,
  right: KiCadVariant,
  changes: string[]
): string {
  const nonce = createNonce();
  const rows = changes.length
    ? changes.map((change) => `<li>${escapeHtml(change)}</li>`).join('')
    : '<li>No component-level BOM differences were found.</li>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BOM Diff</title>
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 12px; }
    .meta { color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
    ul { padding-left: 20px; }
    li { margin: 6px 0; line-height: 1.4; }
  </style>
</head>
<body>
  <h1>Variant BOM Diff</h1>
  <div class="meta">${escapeHtml(left.name)} -> ${escapeHtml(right.name)}</div>
  <ul>${rows}</ul>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
