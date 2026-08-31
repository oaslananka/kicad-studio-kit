import * as vscode from 'vscode';
import { DOCUMENTATION_URLS } from '../documentation/documentationUrls';
import { createNonce } from '../utils/nonce';
import { injectWebviewLocalization } from '../webviewI18n';

export interface SettingsViewState {
  settings: Record<string, unknown>;
  aiKeyStored: boolean;
  octopartKeyStored: boolean;
  cli?: {
    path: string;
    versionLabel: string;
    source: string;
  };
  ai?: {
    provider: string;
    configured: boolean;
    healthy?: boolean | undefined;
  };
  mcp?: {
    available: boolean;
    connected: boolean;
    kind: string;
    compat?: 'ok' | 'warn' | 'incompatible' | undefined;
    version?: string | undefined;
    profile?: string | undefined;
  };
}

export interface SettingsHtmlOptions {
  webview: vscode.Webview;
  state: SettingsViewState;
}

export function buildSettingsHtml(options: SettingsHtmlOptions): string {
  const nonce = createNonce();
  const stateJson = JSON.stringify(options.state).replace(/</g, '\\u003c');
  const mcpIntegrationDocsUrlJson = JSON.stringify(
    DOCUMENTATION_URLS.mcpIntegration
  );

  return injectWebviewLocalization(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.webview.cspSource} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>KiCad Studio Health</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background);
      --panel: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      --border: var(--vscode-panel-border, rgba(128,128,128,.35));
      --text: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder, #007acc);
      --danger: var(--vscode-errorForeground, #ef4444);
      color-scheme: light dark;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font: 13px/1.5 var(--vscode-font-family, "Segoe UI", sans-serif); }
    button { font: inherit; color: var(--text); border: 1px solid var(--border); border-radius: 6px; background: var(--panel); padding: 6px 10px; cursor: pointer; }
    button:hover { border-color: var(--accent); }
    :where(button, [href], [tabindex]:not([tabindex="-1"])):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    header { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: var(--panel); }
    h1 { margin: 0; font-size: 16px; line-height: 1.25; }
    main { max-width: 980px; padding: 18px; display: grid; gap: 16px; }
    .health-grid { display: grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap: 12px; }
    .card, section { border: 1px solid var(--border); border-radius: 8px; background: var(--panel); padding: 13px; }
    .card h2, section h2 { margin: 0 0 6px; font-size: 13px; }
    .health-label { font-weight: 600; }
    .detail, .status { color: var(--muted); font-size: 11px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
    #toast { min-height: 18px; color: var(--muted); font-size: 12px; text-align: right; }
    @media (max-width: 760px) { header { align-items: flex-start; flex-direction: column; } main { padding: 12px; } .health-grid { grid-template-columns: 1fr; } #toast { text-align: left; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>KiCad Studio Capability Health</h1>
      <div class="status">Runtime evidence and remediation. Ordinary configuration lives in native VS Code Settings.</div>
    </div>
    <div id="toast" role="status" aria-live="polite"></div>
  </header>
  <main>
    <div class="health-grid" aria-label="Capability health">
      <article class="card" id="cli-health"><h2>KiCad CLI</h2><div class="health-label" id="cli-health-label"></div><div class="detail" id="cli-health-detail"></div><div class="actions"><button id="detect-cli" type="button">Refresh detection</button></div></article>
      <article class="card" id="ai-health"><h2>AI</h2><div class="health-label" id="ai-health-label"></div><div class="detail" id="ai-health-detail"></div><div class="actions"><button id="test-ai-key" type="button">Test connection</button><button id="set-ai-key" type="button">Set API key</button><button id="clear-ai-key" class="danger" type="button">Clear API key</button></div></article>
      <article class="card" id="mcp-health"><h2>MCP</h2><div class="health-label" id="mcp-health-label"></div><div class="detail" id="mcp-health-detail"></div><div class="actions"><button id="open-mcp-docs" type="button">Integration docs</button></div></article>
    </div>
    <section aria-labelledby="configuration-heading">
      <h2 id="configuration-heading">Configuration</h2>
      <div class="detail">Path, provider, model, MCP, viewer, and other scalar options use the native Settings editor so scope, search, sync, and policy behavior stay consistent with VS Code.</div>
      <div class="actions"><button id="open-native-settings" type="button">Open VS Code Settings</button></div>
    </section>
    <section aria-labelledby="secrets-heading">
      <h2 id="secrets-heading">Secrets</h2>
      <div class="detail" id="octopart-key-status"></div>
      <div class="actions"><button id="clear-all-secrets" class="danger" type="button">Clear all stored secrets</button></div>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${stateJson};
    function byId(id) { return document.getElementById(id); }
    function setToast(message) { byId('toast').textContent = message || ''; }
    function applyState(next) {
      if (next && typeof next === 'object') Object.assign(state, next);
      const cli = state.cli;
      byId('cli-health-label').textContent = cli ? cli.versionLabel : 'Not detected';
      byId('cli-health-detail').textContent = cli ? cli.path + ' (' + cli.source + ')' : 'Run detection or configure the CLI path in VS Code Settings.';
      const ai = state.ai || {};
      const aiStatus = ai.healthy === true ? 'Healthy' : ai.healthy === false ? 'Connection failed' : ai.configured ? 'Configured, not tested' : 'Not configured';
      byId('ai-health-label').textContent = aiStatus;
      byId('ai-health-detail').textContent = (ai.provider && ai.provider !== 'none' ? 'Provider: ' + ai.provider + '. ' : '') + (state.aiKeyStored ? 'SecretStorage credential present.' : 'No SecretStorage credential present.');
      const mcp = state.mcp || {};
      byId('mcp-health-label').textContent = mcp.connected ? 'Connected' : mcp.available ? 'Available, disconnected' : 'Unavailable';
      byId('mcp-health-detail').textContent = [mcp.version ? 'Version ' + mcp.version : '', mcp.profile ? 'profile ' + mcp.profile : '', mcp.compat ? 'compatibility ' + mcp.compat : '', mcp.kind || ''].filter(Boolean).join(' · ') || 'Configure or start kicad-mcp-pro to enable MCP capabilities.';
      byId('octopart-key-status').textContent = state.octopartKeyStored ? 'Octopart/Nexar credential is stored in SecretStorage.' : 'No Octopart/Nexar credential is stored.';
    }
    byId('open-native-settings').addEventListener('click', () => vscode.postMessage({ type: 'openNativeSettings' }));
    byId('set-ai-key').addEventListener('click', () => vscode.postMessage({ type: 'setAiKey' }));
    byId('clear-ai-key').addEventListener('click', () => vscode.postMessage({ type: 'clearAiKey' }));
    byId('test-ai-key').addEventListener('click', () => vscode.postMessage({ type: 'testAiKey' }));
    byId('detect-cli').addEventListener('click', () => vscode.postMessage({ type: 'detectCli' }));
    byId('clear-all-secrets').addEventListener('click', () => vscode.postMessage({ type: 'clearAllSecrets' }));
    byId('open-mcp-docs').addEventListener('click', () => vscode.postMessage({ type: 'openExternalLink', href: ${mcpIntegrationDocsUrlJson} }));
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'state') applyState(message.state);
      else if (message.type === 'status') setToast(message.text || '');
    });
    applyState(state);
    vscode.postMessage({ type: 'ready' });
    vscode.postMessage({ type: 'requestApiKeyStatus' });
  </script>
</body>
</html>`,
    nonce
  );
}
