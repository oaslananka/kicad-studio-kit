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
  <title>KiCad Studio Settings</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background);
      --panel: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      --side: var(--vscode-sideBar-background, var(--vscode-editor-background));
      --border: var(--vscode-panel-border, rgba(128,128,128,.35));
      --text: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder, #007acc);
      --danger: var(--vscode-errorForeground, #ef4444);
      --input: var(--vscode-input-background, var(--panel));
      color-scheme: light dark;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font: 13px/1.5 var(--vscode-font-family, "Segoe UI", sans-serif);
    }
    button, input, select {
      font: inherit;
      color: var(--text);
    }
    button {
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--side);
      padding: 6px 10px;
      cursor: pointer;
    }
    button:hover { border-color: var(--accent); }
    input, select {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--input);
      padding: 7px 9px;
      outline: none;
    }
    input:focus, select:focus { border-color: var(--accent); }
    :where(button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])):focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 16px;
      line-height: 1.25;
    }
    main {
      max-width: 980px;
      padding: 18px;
      display: grid;
      gap: 16px;
    }
    section {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      overflow: hidden;
    }
    .section-head {
      padding: 11px 13px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }
    h2 {
      margin: 0;
      font-size: 13px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(220px, 1fr));
      gap: 12px;
      padding: 13px;
    }
    .field {
      display: grid;
      gap: 5px;
      align-content: start;
    }
    .field.full { grid-column: 1 / -1; }
    label {
      font-weight: 600;
      font-size: 12px;
    }
    .hint, .status {
      color: var(--muted);
      font-size: 11px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
    .primary {
      background: var(--vscode-button-background, var(--accent));
      color: var(--vscode-button-foreground, #fff);
      border-color: var(--vscode-button-background, var(--accent));
    }
    .checkbox {
      display: flex;
      gap: 8px;
      align-items: center;
      min-height: 32px;
    }
    .checkbox input { width: auto; }
    #toast {
      min-height: 18px;
      color: var(--muted);
      font-size: 12px;
      text-align: right;
    }
    @media (max-width: 720px) {
      header { align-items: flex-start; flex-direction: column; }
      main { padding: 12px; }
      .grid { grid-template-columns: 1fr; }
      #toast { text-align: left; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>KiCad Studio Settings</h1>
      <div class="status" id="summary"></div>
    </div>
    <div id="toast" role="status" aria-live="polite"></div>
  </header>
  <main>
    <section>
      <div class="section-head">
        <h2>KiCad CLI</h2>
        <button id="detect-cli" type="button">Detect kicad-cli</button>
      </div>
      <div class="grid">
        <div class="field full">
          <label for="kicadstudio.kicadCliPath">kicad-cli path</label>
          <input id="kicadstudio.kicadCliPath" data-setting="kicadstudio.kicadCliPath" type="text" placeholder="Auto-detect">
          <div id="cli-status" class="hint"></div>
        </div>
        <div class="field full">
          <label for="kicadstudio.kicadPath">KiCad application path</label>
          <input id="kicadstudio.kicadPath" data-setting="kicadstudio.kicadPath" type="text" placeholder="Auto-detect">
        </div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>AI</h2>
        <div class="row">
          <button id="test-ai-key" type="button">Test connection</button>
          <button id="set-ai-key" type="button">Set API key</button>
          <button id="clear-ai-key" class="danger" type="button">Clear API key</button>
        </div>
      </div>
      <div class="grid">
        <div class="field">
          <label for="kicadstudio.ai.provider">Provider</label>
          <select id="kicadstudio.ai.provider" data-setting="kicadstudio.ai.provider">
            <option value="none">Disabled</option>
            <option value="claude">Claude</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="copilot">GitHub Copilot</option>
            <option value="gemini">Gemini</option>
            <option value="local">Local OpenAI-compatible</option>
          </select>
        </div>
        <div class="field">
          <label for="kicadstudio.ai.model">Model</label>
          <input id="kicadstudio.ai.model" data-setting="kicadstudio.ai.model" type="text" placeholder="Provider default">
        </div>
        <div class="field">
          <label for="kicadstudio.ai.localEndpoint">Local endpoint</label>
          <input id="kicadstudio.ai.localEndpoint" data-setting="kicadstudio.ai.localEndpoint" type="text" placeholder="http://127.0.0.1:11434/v1">
        </div>
        <div class="field">
          <label for="kicadstudio.ai.openaiApiMode">OpenAI API mode</label>
          <select id="kicadstudio.ai.openaiApiMode" data-setting="kicadstudio.ai.openaiApiMode">
            <option value="responses">Responses</option>
            <option value="chat-completions">Chat Completions</option>
          </select>
        </div>
        <div class="field">
          <label for="kicadstudio.ai.language">Response language</label>
          <select id="kicadstudio.ai.language" data-setting="kicadstudio.ai.language">
            <option value="en">English</option>
            <option value="tr">Turkish</option>
            <option value="de">German</option>
            <option value="zh-CN">Chinese (Simplified)</option>
            <option value="ja">Japanese</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
            <option value="ko">Korean</option>
            <option value="pt-BR">Portuguese (Brazil)</option>
          </select>
        </div>
        <label class="checkbox">
          <input id="kicadstudio.ai.allowTools" data-setting="kicadstudio.ai.allowTools" type="checkbox">
          Allow language model tools
        </label>
        <div class="field">
          <span class="hint" id="ai-key-status"></span>
        </div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>MCP</h2>
        <button id="open-mcp-docs" type="button">Open integration docs</button>
      </div>
      <div class="grid">
        <div class="field">
          <label for="kicadstudio.mcp.endpoint">Endpoint</label>
          <input id="kicadstudio.mcp.endpoint" data-setting="kicadstudio.mcp.endpoint" type="text">
        </div>
        <div class="field">
          <label for="kicadstudio.mcp.profile">Profile</label>
          <select id="kicadstudio.mcp.profile" data-setting="kicadstudio.mcp.profile">
            <option value="full">full</option>
            <option value="minimal">minimal</option>
            <option value="schematic_only">schematic_only</option>
            <option value="pcb_only">pcb_only</option>
            <option value="manufacturing">manufacturing</option>
            <option value="high_speed">high_speed</option>
            <option value="power">power</option>
            <option value="simulation">simulation</option>
            <option value="analysis">analysis</option>
            <option value="agent_full">agent_full</option>
          </select>
        </div>
        <div class="field">
          <label for="kicadstudio.mcp.timeout">Timeout (seconds)</label>
          <input id="kicadstudio.mcp.timeout" data-setting="kicadstudio.mcp.timeout" type="number" min="1" max="120">
        </div>
        <label class="checkbox">
          <input id="kicadstudio.mcp.autoDetect" data-setting="kicadstudio.mcp.autoDetect" type="checkbox">
          Auto-detect kicad-mcp-pro
        </label>
        <label class="checkbox">
          <input id="kicadstudio.mcp.pushContext" data-setting="kicadstudio.mcp.pushContext" type="checkbox">
          Push active KiCad context
        </label>
        <label class="checkbox">
          <input id="kicadstudio.mcp.allowLegacySse" data-setting="kicadstudio.mcp.allowLegacySse" type="checkbox">
          Allow legacy SSE fallback
        </label>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>Viewer</h2>
      </div>
      <div class="grid">
        <div class="field">
          <label for="kicadstudio.viewer.theme">Viewer theme</label>
          <select id="kicadstudio.viewer.theme" data-setting="kicadstudio.viewer.theme">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="kicad">KiCad</option>
          </select>
        </div>
        <div class="field">
          <label for="kicadstudio.viewer.largeFileThresholdBytes">Large file threshold bytes</label>
          <input id="kicadstudio.viewer.largeFileThresholdBytes" data-setting="kicadstudio.viewer.largeFileThresholdBytes" type="number" min="1">
        </div>
        <label class="checkbox">
          <input id="kicadstudio.viewer.autoRefresh" data-setting="kicadstudio.viewer.autoRefresh" type="checkbox">
          Auto-refresh viewers on save
        </label>
        <label class="checkbox">
          <input id="kicadstudio.viewer.syncThemeWithVscode" data-setting="kicadstudio.viewer.syncThemeWithVscode" type="checkbox">
          Sync viewer with VS Code theme
        </label>
        <label class="checkbox">
          <input id="kicadstudio.viewer.enableLayerPanel" data-setting="kicadstudio.viewer.enableLayerPanel" type="checkbox">
          Enable PCB layer panel
        </label>
        <label class="checkbox">
          <input id="kicadstudio.viewer.enableSnapshotExport" data-setting="kicadstudio.viewer.enableSnapshotExport" type="checkbox">
          Enable viewer snapshot export
        </label>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>Secrets</h2>
        <button id="clear-all-secrets" class="danger" type="button">Clear all stored secrets</button>
      </div>
      <div class="grid">
        <div class="field">
          <label>Octopart/Nexar key</label>
          <div id="octopart-key-status" class="hint"></div>
        </div>
      </div>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${stateJson};
    const settings = new Map(Object.entries(state.settings || {}));

    function byId(id) {
      return document.getElementById(id);
    }
    function setToast(message) {
      byId('toast').textContent = message || '';
    }
    function valueFor(input) {
      if (input.type === 'checkbox') {
        return input.checked;
      }
      if (input.type === 'number') {
        const parsed = Number(input.value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      return input.value;
    }
    function applyState(next) {
      if (next && typeof next === 'object') {
        Object.assign(state, next);
      }
      for (const input of document.querySelectorAll('[data-setting]')) {
        const key = input.dataset.setting;
        const value = settings.has(key) ? settings.get(key) : state.settings?.[key];
        if (input.type === 'checkbox') {
          input.checked = !!value;
        } else if (typeof value !== 'undefined') {
          input.value = String(value);
        }
      }
      byId('ai-key-status').textContent = state.aiKeyStored ? 'AI API key is stored in SecretStorage.' : 'No AI API key is stored.';
      byId('octopart-key-status').textContent = state.octopartKeyStored ? 'Octopart/Nexar key is stored in SecretStorage.' : 'No Octopart/Nexar key is stored.';
      const cli = state.cli;
      byId('cli-status').textContent = cli ? cli.versionLabel + ' at ' + cli.path + ' (' + cli.source + ')' : 'No kicad-cli detection result yet.';
      byId('summary').textContent = (state.aiKeyStored ? 'AI key stored' : 'AI key missing') + ' - ' + (cli ? cli.versionLabel : 'CLI not detected');
    }
    function postSetting(input) {
      const key = input.dataset.setting;
      const value = valueFor(input);
      settings.set(key, value);
      vscode.postMessage({ type: 'updateSetting', key, value });
    }

    for (const input of document.querySelectorAll('[data-setting]')) {
      input.addEventListener('change', () => postSetting(input));
      if (input.tagName === 'INPUT' && input.type !== 'checkbox') {
        input.addEventListener('blur', () => postSetting(input));
      }
    }
    byId('set-ai-key').addEventListener('click', () => vscode.postMessage({ type: 'setAiKey' }));
    byId('clear-ai-key').addEventListener('click', () => vscode.postMessage({ type: 'clearAiKey' }));
    byId('test-ai-key').addEventListener('click', () => vscode.postMessage({ type: 'testAiKey' }));
    byId('detect-cli').addEventListener('click', () => vscode.postMessage({ type: 'detectCli' }));
    byId('clear-all-secrets').addEventListener('click', () => vscode.postMessage({ type: 'clearAllSecrets' }));
    byId('open-mcp-docs').addEventListener('click', () => vscode.postMessage({ type: 'openExternalLink', href: ${mcpIntegrationDocsUrlJson} }));

    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'state') {
        if (message.state?.settings) {
          for (const entry of Object.entries(message.state.settings)) {
            settings.set(entry[0], entry[1]);
          }
        }
        applyState(message.state);
      } else if (message.type === 'status') {
        setToast(message.text || '');
      }
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
