import * as path from 'node:path';
import * as vscode from 'vscode';

import type {
  McpConnectionState,
  QualityGateResult,
  QualityGateStatus,
  QualityGateViolation
} from '../types';
import type { QualityGateMcpAdapter } from '../mcp/mcpToolAdapter';
import type { McpStateStore } from '../state/stateStores';
import { localize } from '../i18n';

type QualityGateElement =
  | {
      kind: 'gate';
      gate: QualityGateResult;
    }
  | {
      kind: 'violation';
      gate: QualityGateResult;
      violation: QualityGateViolation;
    };

const DEFAULT_GATES: QualityGateResult[] = [
  pendingGate('schematic', 'Schematic'),
  pendingGate('connectivity', 'Connectivity'),
  pendingGate('placement', 'Placement'),
  pendingGate('transfer', 'PCB Transfer'),
  pendingGate('manufacturing', 'Manufacturing')
];

export class QualityGateProvider implements vscode.TreeDataProvider<QualityGateElement> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    QualityGateElement | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private gates: QualityGateResult[] = [];
  private drcTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly mcpAdapter: QualityGateMcpAdapter,
    private readonly mcpState?: Pick<McpStateStore, 'getState'> | undefined
  ) {
    this.gates = this.readCachedGates() ?? DEFAULT_GATES;
  }

  getTreeItem(element: QualityGateElement): vscode.TreeItem {
    if (element.kind === 'violation') {
      const item = new vscode.TreeItem(
        element.violation.message,
        vscode.TreeItemCollapsibleState.None
      );
      item.iconPath = new vscode.ThemeIcon('debug-breakpoint-log');
      item.tooltip = element.violation.hint ?? element.violation.message;
      if (element.violation.path && element.violation.line) {
        item.command = {
          command: 'vscode.open',
          title: 'Open Location',
          arguments: [
            vscode.Uri.file(element.violation.path),
            {
              selection: new vscode.Range(
                Math.max(0, element.violation.line - 1),
                0,
                Math.max(0, element.violation.line - 1),
                0
              )
            }
          ]
        };
      }
      return item;
    }

    const gate = element.gate;
    const item = new vscode.TreeItem(
      gate.label,
      gate.violations.length
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );
    item.description = descriptionForGate(gate);
    item.tooltip = tooltipForGate(gate);
    item.contextValue = `qualityGate-${gate.status.toLowerCase()}`;
    item.iconPath = new vscode.ThemeIcon(iconForStatus(gate.status));

    // Intentionally removed item.command here to separate click action
    // from standard treeview expansion. We rely on package.json inline commands
    // "Run This Quality Gate" and "Open Documentation" to expose the actions.
    // This avoids mixing documentation links with executable gate actions on click.

    return item;
  }

  getChildren(element?: QualityGateElement): QualityGateElement[] {
    if (!element) {
      const state = this.mcpState?.getState();
      const gates =
        state && !supportsHttpQualityGates(state)
          ? blockedGates(this.gates, state)
          : this.gates;
      return orderGates(gates).map((gate) => ({ kind: 'gate', gate }));
    }
    if (element.kind === 'gate') {
      return element.gate.violations.map((violation) => ({
        kind: 'violation',
        gate: element.gate,
        violation
      }));
    }
    return [];
  }

  refresh(): void {
    this.gates = this.readCachedGates() ?? this.gates;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async runAll(): Promise<void> {
    if (this.blockUnavailableRunAction()) {
      return;
    }

    try {
      const [project, placement, transfer, manufacturing] = await Promise.all([
        this.mcpAdapter.runProjectQualityGate(),
        this.mcpAdapter.runPlacementQualityGate(),
        this.mcpAdapter.runTransferQualityGate(),
        this.mcpAdapter.runManufacturingQualityGate()
      ]);
      this.gates = markRunTime(
        mergeGates([...project, placement, transfer, manufacturing])
      );
      await this.persist();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('stdio')) {
        void vscode.window.showInformationMessage(
          'Quality Gates are not available when kicad-mcp-pro is connected via VS Code stdio. ' +
            'Start kicad-mcp-pro with the HTTP transport (port 27185) to enable this feature.'
        );
        return;
      }
      throw err;
    }
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async runGate(gate: QualityGateResult): Promise<void> {
    if (this.blockUnavailableRunAction()) {
      return;
    }

    const next = gate.id.includes('placement')
      ? await this.mcpAdapter.runPlacementQualityGate()
      : gate.id.includes('transfer')
        ? await this.mcpAdapter.runTransferQualityGate()
        : gate.id.includes('manufacturing')
          ? await this.mcpAdapter.runManufacturingQualityGate()
          : ((await this.mcpAdapter.runProjectQualityGate())[0] ?? gate);
    this.gates = markRunTime(
      mergeGates(this.gates.map((item) => (item.id === gate.id ? next : item)))
    );
    await this.persist();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  scheduleDrcRefresh(): void {
    if (this.drcTimer) {
      clearTimeout(this.drcTimer);
    }
    this.drcTimer = setTimeout(() => {
      this.drcTimer = undefined;
      void Promise.all([
        this.mcpAdapter.runPlacementQualityGate(),
        this.mcpAdapter.runTransferQualityGate()
      ])
        .then(async ([placement, transfer]) => {
          this.gates = markRunTime(
            mergeGates(
              this.gates.map((gate) =>
                gate.id === placement.id
                  ? placement
                  : gate.id === transfer.id
                    ? transfer
                    : gate
              )
            )
          );
          await this.persist();
          this.onDidChangeTreeDataEmitter.fire(undefined);
        })
        .catch(() => undefined);
    }, 1500);
  }

  async showRaw(gate: QualityGateResult): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      content: gate.raw ?? JSON.stringify(gate, null, 2),
      language: 'markdown'
    });
    await vscode.window.showTextDocument(document);
  }

  async openDocs(gate?: QualityGateResult): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(qualityGateDocsUrl(gate)));
  }

  private async persist(): Promise<void> {
    await this.context.workspaceState.update(this.cacheKey(), this.gates);
  }

  private readCachedGates(): QualityGateResult[] | undefined {
    return this.context.workspaceState.get<QualityGateResult[]>(
      this.cacheKey()
    );
  }

  private cacheKey(): string {
    const root =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'workspace';
    return `kicadstudio.qualityGate.${path.basename(root)}`;
  }

  private blockUnavailableRunAction(): boolean {
    const state = this.mcpState?.getState();
    if (!state || supportsHttpQualityGates(state)) {
      return false;
    }

    void vscode.window.showInformationMessage(qualityGateBlockMessage(state));
    return true;
  }
}

function pendingGate(id: string, label: string): QualityGateResult {
  return {
    id,
    label,
    status: 'PENDING',
    summary: pendingGateSummary(id),
    details: [],
    violations: []
  };
}

function pendingGateSummary(id: string): string {
  switch (id) {
    case 'schematic':
      return localize('qualityGatePendingSchematic');
    case 'connectivity':
      return localize('qualityGatePendingConnectivity');
    case 'placement':
      return localize('qualityGatePendingPlacement');
    case 'transfer':
      return localize('qualityGatePendingTransfer');
    case 'manufacturing':
      return localize('qualityGatePendingManufacturing');
    default:
      return localize('qualityGatePendingDefault');
  }
}

function blockedGates(
  gates: QualityGateResult[],
  state: McpConnectionState
): QualityGateResult[] {
  const summary = qualityGateBlockMessage(state);
  return gates.map((gate) => ({
    ...gate,
    status: 'BLOCKED',
    summary: state.message ? `${summary} ${state.message}` : summary,
    violations: []
  }));
}

function qualityGateBlockMessage(state: McpConnectionState): string {
  return state.kind === 'VsCodeStdio'
    ? 'HTTP MCP connection required for Quality Gates.'
    : state.kind === 'Incompatible'
      ? 'Compatible kicad-mcp-pro server required.'
      : 'Connect kicad-mcp-pro before running Quality Gates.';
}

function supportsHttpQualityGates(state: McpConnectionState): boolean {
  return state.kind === 'Connected' && state.connected;
}

function descriptionForGate(gate: QualityGateResult): string {
  const runText = gate.lastRun ? ` - ${formatTimestamp(gate.lastRun)}` : '';
  const status =
    gate.status === 'PENDING' ? localize('qualityGateReady') : gate.status;
  return `${status} - ${gate.summary}${runText}`;
}

function tooltipForGate(gate: QualityGateResult): string {
  const lines = [
    `${gate.label}: ${gate.status}`,
    gate.summary,
    'Primary action: Run gate.',
    'Secondary action: Open docs.',
    gate.lastRun
      ? `Last run: ${formatTimestamp(gate.lastRun)}`
      : 'Last run: never',
    gate.violations.length
      ? `${gate.violations.length} violation(s). Expand for details.`
      : 'No violation rows cached for this gate.',
    gate.status === 'PENDING'
      ? localize('qualityGateClickRunWhenReady')
      : localize('qualityGateClickRerun')
  ];
  if (gate.raw) {
    lines.push('', gate.raw);
  }
  return lines.join('\n');
}

function qualityGateDocsUrl(gate: QualityGateResult | undefined): string {
  const base = 'https://oaslananka.github.io/kicad-studio-kit';
  if (!gate || gate.id.includes('manufacturing')) {
    return `${base}/workflows/manufacturing-export/`;
  }
  return `${base}/extension/`;
}

function iconForStatus(status: QualityGateStatus): string {
  switch (status) {
    case 'PASS':
      return 'pass';
    case 'WARN':
      return 'warning';
    case 'FAIL':
    case 'BLOCKED':
      return 'error';
    case 'PENDING':
      return 'play-circle';
  }
}

function orderGates(gates: QualityGateResult[]): QualityGateResult[] {
  const priority: Record<QualityGateStatus, number> = {
    FAIL: 0,
    BLOCKED: 1,
    WARN: 2,
    PENDING: 3,
    PASS: 4
  };
  return [...gates].sort(
    (a, b) =>
      priority[a.status] - priority[b.status] ||
      defaultGateOrder(a.id) - defaultGateOrder(b.id) ||
      a.label.localeCompare(b.label)
  );
}

function defaultGateOrder(id: string): number {
  const index = DEFAULT_GATES.findIndex((gate) => gate.id === id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function markRunTime(gates: QualityGateResult[]): QualityGateResult[] {
  const capturedAt = new Date().toISOString();
  return gates.map((gate) =>
    gate.status === 'PENDING'
      ? gate
      : { ...gate, lastRun: gate.lastRun ?? capturedAt }
  );
}

function mergeGates(gates: QualityGateResult[]): QualityGateResult[] {
  const merged = new Map<string, QualityGateResult>();
  for (const gate of [...DEFAULT_GATES, ...gates]) {
    merged.set(canonicalGateId(gate), { ...gate, id: canonicalGateId(gate) });
  }
  return [...merged.values()];
}

function canonicalGateId(gate: QualityGateResult): string {
  const label = gate.label.toLowerCase();
  if (label.includes('schematic') && label.includes('connectivity')) {
    return 'connectivity';
  }
  if (label.includes('schematic')) {
    return 'schematic';
  }
  if (label.includes('placement')) {
    return 'placement';
  }
  if (label.includes('transfer')) {
    return 'transfer';
  }
  if (label.includes('manufacturing')) {
    return 'manufacturing';
  }
  return gate.id;
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }
  return timestamp.toLocaleString();
}
