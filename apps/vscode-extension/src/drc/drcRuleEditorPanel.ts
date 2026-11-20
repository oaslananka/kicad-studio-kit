import * as vscode from 'vscode';
import { createNonce } from '../utils/nonce';
import { asRecord, asString, hasType } from '../utils/webviewMessages';
import type { DrcRulesMcpAdapter } from '../mcp/mcpToolAdapter';
import {
  injectWebviewLocalization,
  localizeWebviewMessage
} from '../webviewI18n';

export class DrcRuleEditorPanel {
  private static currentPanel: DrcRuleEditorPanel | undefined;

  static async createOrShow(
    context: vscode.ExtensionContext,
    mcpAdapter: DrcRulesMcpAdapter
  ): Promise<void> {
    let state: Awaited<ReturnType<DrcRulesMcpAdapter['testConnection']>>;
    try {
      state = await mcpAdapter.testConnection();
    } catch (error) {
      await showDrcRuleEditorError(
        'Unable to check MCP connection for DRC rule editing',
        error
      );
      return;
    }
    if (!state.connected) {
      const choice = await vscode.window.showWarningMessage(
        'DRC rule editing requires a connected kicad-mcp-pro server.',
        'Setup MCP'
      );
      if (choice === 'Setup MCP') {
        try {
          await vscode.commands.executeCommand(
            'kicadstudio.setupMcpIntegration'
          );
        } catch (error) {
          await showDrcRuleEditorError('Unable to open MCP setup', error);
        }
      }
      return;
    }

    if (DrcRuleEditorPanel.currentPanel) {
      DrcRuleEditorPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'kicadstudio.drcRuleEditor',
      localizeWebviewMessage('KiCad DRC Rule Editor'),
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    DrcRuleEditorPanel.currentPanel = new DrcRuleEditorPanel(
      panel,
      context,
      mcpAdapter
    );
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly mcpAdapter: DrcRulesMcpAdapter
  ) {
    this.panel.webview.html = this.renderHtml(context);
    this.panel.onDidDispose(() => {
      DrcRuleEditorPanel.currentPanel = undefined;
    });
    this.panel.webview.onDidReceiveMessage((message: unknown) =>
      this.handleMessage(message)
    );
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!hasType(message, ['upsert', 'delete'])) {
      return;
    }
    const payload = asRecord(message.payload) ?? {};
    const name = asString(payload['name'])?.trim();
    if (!name) {
      return;
    }

    if (message.type === 'upsert') {
      const constraintType = asString(payload['constraintType'])?.trim();
      const minValue = asString(payload['minValue'])?.trim();
      const maxValue = asString(payload['maxValue'])?.trim();
      const condition = asString(payload['condition'])?.trim();
      const severity = asString(payload['severity']);
      const units = /^(?:\d+(?:\.\d*)?|\.\d+)(?:mm|mil|in)$/i;

      if (
        !constraintType ||
        !['clearance', 'track_width', 'via_diameter', 'hole_to_hole'].includes(
          constraintType
        ) ||
        !minValue ||
        !units.test(minValue) ||
        (maxValue && !units.test(maxValue)) ||
        (severity !== 'error' && severity !== 'warning')
      ) {
        await vscode.window.showErrorMessage(
          'Choose a supported constraint and enter a minimum value with units (for example, 0.35mm).'
        );
        return;
      }
      try {
        await this.mcpAdapter.upsertDrcRule({
          name,
          constraintType,
          minValue,
          ...(maxValue ? { maxValue } : {}),
          ...(condition ? { condition } : {}),
          severity
        });
        void vscode.window.showInformationMessage(
          `DRC rule "${name}" saved to the connected MCP project.`
        );
      } catch (error) {
        await showDrcRuleEditorError(`Unable to save DRC rule ${name}`, error);
      }
      return;
    }

    const confirmed = await vscode.window.showWarningMessage(
      `Delete DRC rule "${name}" from the connected MCP project?`,
      { modal: true },
      'Delete rule'
    );
    if (confirmed !== 'Delete rule') {
      return;
    }
    try {
      await this.mcpAdapter.deleteDrcRule(name);
      void vscode.window.showInformationMessage(
        `DRC rule "${name}" deleted from the connected MCP project.`
      );
    } catch (error) {
      await showDrcRuleEditorError(`Unable to delete DRC rule ${name}`, error);
    }
  }

  private renderHtml(_context: vscode.ExtensionContext): string {
    return buildDrcRuleEditorHtml();
  }
}

export function buildDrcRuleEditorHtml(): string {
  const nonce = createNonce();
  return injectWebviewLocalization(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>KiCad DRC Rule Editor</title>
  <style nonce="${nonce}">
    body { margin: 0; padding: 18px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    form { display: grid; gap: 12px; max-width: 720px; }
    label { display: grid; gap: 6px; font-weight: 600; }
    input, textarea, select { width: 100%; box-sizing: border-box; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 8px; font: inherit; }
    textarea { min-height: 92px; resize: vertical; }
    .help { opacity: .85; line-height: 1.5; }
    .actions { display: flex; gap: 8px; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 8px 12px; font: inherit; cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    :where(button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])):focus-visible {
      outline: 2px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 2px;
    }
  </style>
</head>
<body>
  <h1>KiCad DRC Rule Editor</h1>
  <p class="help">Rules are saved in the project configured in your connected kicad-mcp-pro server. Verify the MCP project before saving.</p>
  <form id="rule-form">
    <label>Rule name<input id="name" autocomplete="off" required></label>
    <label>Constraint type
      <select id="constraint-type">
        <option value="clearance">Copper clearance</option>
        <option value="track_width">Track width</option>
        <option value="via_diameter">Via diameter</option>
        <option value="hole_to_hole">Hole-to-hole clearance</option>
      </select>
    </label>
    <label>Minimum value (with units)<input id="min-value" placeholder="0.35mm" required></label>
    <label>Maximum value (optional)<input id="max-value" placeholder="0.60mm"></label>
    <label>Condition (optional)<textarea id="condition" placeholder="A.NetClass == 'POWER'"></textarea></label>
    <label>Severity
      <select id="severity">
        <option value="error">Error</option>
        <option value="warning">Warning</option>
      </select>
    </label>
    <div class="actions">
      <button type="submit">Save Rule</button>
      <button class="secondary" id="delete-rule" type="button">Delete Rule</button>
    </div>
  </form>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const readPayload = () => ({
      name: document.getElementById('name').value,
      constraintType: document.getElementById('constraint-type').value,
      minValue: document.getElementById('min-value').value,
      maxValue: document.getElementById('max-value').value,
      condition: document.getElementById('condition').value,
      severity: document.getElementById('severity').value
    });
    document.getElementById('rule-form').addEventListener('submit', (event) => {
      event.preventDefault();
      vscode.postMessage({ type: 'upsert', payload: readPayload() });
    });
    document.getElementById('delete-rule').addEventListener('click', () => {
      vscode.postMessage({ type: 'delete', payload: readPayload() });
    });
  </script>
</body>
</html>`,
    nonce
  );
}

async function showDrcRuleEditorError(
  prefix: string,
  error: unknown
): Promise<void> {
  await vscode.window.showErrorMessage(
    `${prefix}: ${messageFromUnknown(error)}`
  );
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
