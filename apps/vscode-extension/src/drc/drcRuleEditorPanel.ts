import * as vscode from 'vscode';
import { createNonce } from '../utils/nonce';
import { asRecord, asString, hasType } from '../utils/webviewMessages';
import type { McpClient } from '../mcp/mcpClient';

export class DrcRuleEditorPanel {
  private static currentPanel: DrcRuleEditorPanel | undefined;

  static async createOrShow(
    context: vscode.ExtensionContext,
    mcpClient: McpClient
  ): Promise<void> {
    const state = await mcpClient.testConnection();
    if (!state.connected) {
      const choice = await vscode.window.showWarningMessage(
        'DRC rule editing requires a connected kicad-mcp-pro server.',
        'Setup MCP'
      );
      if (choice === 'Setup MCP') {
        await vscode.commands.executeCommand('kicadstudio.setupMcpIntegration');
      }
      return;
    }

    if (DrcRuleEditorPanel.currentPanel) {
      DrcRuleEditorPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'kicadstudio.drcRuleEditor',
      'KiCad DRC Rule Editor',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    DrcRuleEditorPanel.currentPanel = new DrcRuleEditorPanel(
      panel,
      context,
      mcpClient
    );
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly mcpClient: McpClient
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
      await this.mcpClient.callTool('drc_rule_upsert', {
        name,
        condition: asString(payload['condition']) ?? '',
        constraint: asString(payload['constraint']) ?? ''
      });
      return;
    }

    await this.mcpClient.callTool('drc_rule_delete', { name });
  }

  private renderHtml(_context: vscode.ExtensionContext): string {
    const nonce = createNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    body { margin: 0; padding: 18px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    form { display: grid; gap: 12px; max-width: 720px; }
    label { display: grid; gap: 6px; font-weight: 600; }
    input, textarea { width: 100%; box-sizing: border-box; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 8px; font: inherit; }
    textarea { min-height: 92px; resize: vertical; }
    .actions { display: flex; gap: 8px; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 8px 12px; font: inherit; cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  </style>
</head>
<body>
  <h1>KiCad DRC Rule Editor</h1>
  <form id="rule-form">
    <label>Name<input id="name" autocomplete="off" required></label>
    <label>Condition<textarea id="condition"></textarea></label>
    <label>Constraint<textarea id="constraint"></textarea></label>
    <div class="actions">
      <button type="submit">Save Rule</button>
      <button class="secondary" id="delete-rule" type="button">Delete Rule</button>
    </div>
  </form>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const readPayload = () => ({
      name: document.getElementById('name').value,
      condition: document.getElementById('condition').value,
      constraint: document.getElementById('constraint').value
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
</html>`;
  }
}
