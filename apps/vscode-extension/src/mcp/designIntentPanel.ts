import * as vscode from 'vscode';
import { asRecord, hasType } from '../utils/webviewMessages';
import { McpClient } from './mcpClient';
import { createNonce } from '../utils/nonce';

export class DesignIntentPanel {
  private static currentPanel: vscode.WebviewPanel | undefined;

  static createOrShow(
    context: vscode.ExtensionContext,
    mcpClient: McpClient
  ): void {
    if (DesignIntentPanel.currentPanel) {
      DesignIntentPanel.currentPanel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'kicadstudio.designIntent',
      'KiCad Design Intent',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: []
      }
    );

    DesignIntentPanel.currentPanel = panel;
    panel.onDidDispose(() => {
      if (DesignIntentPanel.currentPanel === panel) {
        DesignIntentPanel.currentPanel = undefined;
      }
    });
    panel.webview.html = this.getFormHtml();
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!hasType(message, ['load', 'save'])) {
        return;
      }

      if (message.type === 'load') {
        const intent = await mcpClient.callTool(
          'project_get_design_intent',
          {}
        );
        await panel.webview.postMessage({
          type: 'loaded',
          data: intent ?? {}
        });
        return;
      }

      if (message.type === 'save') {
        const record = asRecord(message);
        await mcpClient.callTool(
          'project_set_design_intent',
          asRecord(record?.['data']) ?? {}
        );
        void vscode.window.showInformationMessage(
          'Design intent saved. AI can now use your project intent as context.'
        );
      }
    });
  }

  private static getFormHtml(): string {
    const nonce = createNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background);
      --panel: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      --border: var(--vscode-panel-border, var(--vscode-editorWidget-border, rgba(128, 128, 128, 0.35)));
      --text: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 18px;
      font: 13px/1.5 "Segoe UI", system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    h1 { margin-top: 0; font-size: 18px; }
    form {
      display: grid;
      gap: 12px;
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
    }
    textarea, input, select {
      font: inherit;
      color: var(--text);
      background: var(--vscode-input-background, var(--panel));
      border: 1px solid var(--vscode-input-border, var(--border));
      border-radius: 10px;
      padding: 10px 12px;
    }
    textarea {
      min-height: 84px;
      resize: vertical;
    }
    button {
      font: inherit;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 10px;
      padding: 10px 12px;
      font-weight: 600;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground, var(--vscode-button-background));
    }
  </style>
</head>
<body>
  <h1>KiCad Design Intent</h1>
  <form id="intent-form" aria-label="Design intent form">
    <label for="powerTreeRefs">Power tree references
      <textarea id="powerTreeRefs" name="powerTreeRefs" placeholder="U1, U2, L1, FB1"
        aria-describedby="powerTreeRefs-hint"></textarea>
      <small id="powerTreeRefs-hint" style="color:var(--muted);">Comma-separated component references that form the power delivery network.</small>
    </label>
    <label for="connectorRefs">Connector references
      <textarea id="connectorRefs" name="connectorRefs" placeholder="J1, J2"
        aria-describedby="connectorRefs-hint"></textarea>
      <small id="connectorRefs-hint" style="color:var(--muted);">External interface connectors on this board.</small>
    </label>
    <label for="decouplingPairs">Decoupling pairs
      <textarea id="decouplingPairs" name="decouplingPairs" placeholder="U1:C4,C5"
        aria-describedby="decouplingPairs-hint"></textarea>
      <small id="decouplingPairs-hint" style="color:var(--muted);">Format: IC_ref:cap_ref,cap_ref — associates bypass caps with their ICs.</small>
    </label>
    <label for="partitioning">Analog / digital partitioning
      <textarea id="partitioning" name="partitioning" placeholder="ADC and RF sections isolated from motor power"
        aria-describedby="partitioning-hint"></textarea>
      <small id="partitioning-hint" style="color:var(--muted);">Describe the ground plane split and analog/digital boundary rules.</small>
    </label>
    <label for="sensorClusterRefs">Sensor cluster references
      <textarea id="sensorClusterRefs" name="sensorClusterRefs" placeholder="U4, U5, J3"
        aria-describedby="sensorClusterRefs-hint"></textarea>
      <small id="sensorClusterRefs-hint" style="color:var(--muted);">Components that must be placed close together as a functional cluster.</small>
    </label>
    <label for="rfKeepouts">RF keepouts
      <textarea id="rfKeepouts" name="rfKeepouts" placeholder="Antenna edge, matching network clearance"
        aria-describedby="rfKeepouts-hint"></textarea>
      <small id="rfKeepouts-hint" style="color:var(--muted);">Areas where copper pours and vias are restricted to avoid RF interference.</small>
    </label>
    <label for="fabricationProfile">Fabrication profile
      <select id="fabricationProfile" name="fabricationProfile"
        aria-describedby="fabricationProfile-hint">
        <option value="generic">Generic</option>
        <option value="jlcpcb">JLCPCB</option>
        <option value="pcbway">PCBWay</option>
      </select>
      <small id="fabricationProfile-hint" style="color:var(--muted);">Target fab house — affects layer naming and DRC rule defaults.</small>
    </label>
    <label for="notes">Additional notes
      <textarea id="notes" name="notes" placeholder="Sensor clustering, RF keepouts, review constraints..."></textarea>
    </label>
    <button type="submit">Save Design Intent</button>
  </form>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('intent-form');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      vscode.postMessage({ type: 'save', data });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type !== 'loaded' || !message.data) {
        return;
      }
      for (const [key, value] of Object.entries(message.data)) {
        const field = form.elements.namedItem(key);
        if (field && 'value' in field && typeof value === 'string') {
          field.value = value;
        }
      }
    });

    vscode.postMessage({ type: 'load' });
  </script>
</body>
</html>`;
  }
}
