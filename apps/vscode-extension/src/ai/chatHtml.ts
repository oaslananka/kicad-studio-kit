import * as vscode from 'vscode';
import { createNonce } from '../utils/nonce';
import { injectWebviewLocalization } from '../webviewI18n';

export interface ChatHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
}

export function buildChatHtml(options: ChatHtmlOptions): string {
  const nonce = createNonce();
  const markdownUri = options.webview
    .asWebviewUri(
      vscode.Uri.joinPath(
        options.extensionUri,
        'media',
        'vendor',
        'chat-markdown.js'
      )
    )
    .toString();

  return injectWebviewLocalization(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.webview.cspSource} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}' ${options.webview.cspSource};">
  <title>KiCad AI Chat</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background);
      --panel: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      --panel2: var(--vscode-sideBar-background, var(--vscode-editor-background));
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
      height: 100vh;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      background: var(--bg);
      color: var(--text);
      font: 13px/1.5 var(--vscode-font-family, "Segoe UI", sans-serif);
    }
    button, select, input, textarea {
      font: inherit;
      color: var(--text);
    }
    button {
      border: 1px solid var(--border);
      background: var(--panel2);
      border-radius: 6px;
      padding: 5px 8px;
      cursor: pointer;
      min-height: 28px;
    }
    button:hover { border-color: var(--accent); }
    button:disabled { cursor: default; opacity: .55; }
    select, input, textarea {
      border: 1px solid var(--border);
      background: var(--input);
      border-radius: 6px;
      outline: none;
    }
    select:focus, input:focus, textarea:focus {
      border-color: var(--accent);
    }
    :where(button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])):focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(140px, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .mark {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: var(--accent);
      color: var(--vscode-button-foreground, #fff);
      font-weight: 700;
    }
    .title {
      display: grid;
      gap: 1px;
      min-width: 0;
    }
    .title strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status {
      color: var(--muted);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      justify-content: flex-end;
    }
    .toolbar select { height: 28px; max-width: 140px; }
    .toolbar input { height: 28px; width: clamp(110px, 18vw, 220px); padding: 4px 8px; }
    .icon { width: 30px; padding: 0; }
    .primary {
      background: var(--vscode-button-background, var(--accent));
      color: var(--vscode-button-foreground, #fff);
      border-color: var(--vscode-button-background, var(--accent));
    }
    .danger {
      color: var(--danger);
      border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
    }
    #messages {
      overflow: auto;
      overflow-anchor: auto;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .quota-banner {
      padding: 7px 12px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--danger) 10%, var(--panel));
      color: var(--text);
      font-size: 12px;
    }
    .quota-banner[hidden] { display: none; }
    .empty {
      align-self: center;
      margin-top: 15vh;
      color: var(--muted);
      text-align: center;
      max-width: 360px;
    }
    .message {
      width: min(760px, 92%);
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      overflow: hidden;
    }
    .message.user {
      align-self: flex-end;
      background: color-mix(in srgb, var(--accent) 10%, var(--panel));
    }
    .message.assistant { align-self: flex-start; }
    .message-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 9px;
      border-bottom: 1px solid var(--border);
      color: var(--muted);
      font-size: 11px;
    }
    .role { font-weight: 700; color: var(--text); }
    .time { margin-left: auto; }
    .body { padding: 10px 12px; }
    .body p { margin: 0 0 8px; }
    .body p:last-child { margin-bottom: 0; }
    .body pre {
      overflow: auto;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
    }
    .body code {
      font-family: var(--vscode-editor-font-family, Consolas, monospace);
      background: var(--bg);
      border-radius: 4px;
      padding: 1px 4px;
    }
    .actions, .tool-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 12px 10px;
    }
    details {
      margin: 0 12px 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
    }
    summary {
      cursor: pointer;
      padding: 7px 9px;
      font-weight: 600;
    }
    .tool-list {
      padding: 0 9px 9px;
      color: var(--muted);
      display: grid;
      gap: 5px;
    }
    .tool-error {
      margin: 0 9px 9px;
      color: var(--danger);
      font-size: 12px;
      white-space: pre-wrap;
    }
    footer {
      display: grid;
      gap: 8px;
      padding: 10px 12px 12px;
      border-top: 1px solid var(--border);
      background: var(--panel);
    }
    .context-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      align-items: center;
    }
    #context-info {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted);
      font-size: 11px;
    }
    .composer {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: end;
    }
    textarea {
      width: 100%;
      resize: vertical;
      min-height: 64px;
      max-height: 170px;
      padding: 8px 10px;
    }
    #extra-context {
      min-height: 42px;
      display: none;
    }
    #extra-context.visible { display: block; }
    #token-estimate {
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }
    .streaming-text {
      white-space: pre-wrap;
      word-break: break-word;
      font: inherit;
      margin: 0;
      border: none;
      background: none;
      padding: 0;
    }
    .typing-indicator {
      color: var(--muted);
      font-style: italic;
    }
    .typing-indicator::after {
      content: '';
      display: inline-block;
      width: 4px;
      height: 13px;
      background: var(--accent);
      margin-left: 3px;
      vertical-align: text-bottom;
      animation: blink 0.9s step-end infinite;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
      }
      .typing-indicator::after { animation: none; }
    }
    @media (max-width: 680px) {
      header { grid-template-columns: 1fr; }
      .toolbar { justify-content: flex-start; }
      .toolbar input { width: min(100%, 220px); }
      .message { width: 100%; }
      .context-row, .composer { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="mark">K</div>
      <div class="title">
        <strong>KiCad AI Chat</strong>
        <span id="status" class="status">Ready</span>
      </div>
    </div>
    <div class="toolbar" aria-label="Chat controls">
      <select id="provider" aria-label="AI provider">
        <option value="none">Disabled</option>
        <option value="claude">Claude</option>
        <option value="openai">OpenAI</option>
        <option value="copilot">Copilot</option>
        <option value="gemini">Gemini</option>
      </select>
      <input id="model" type="text" aria-label="Model" placeholder="Model override">
      <button id="settings" class="icon" type="button" title="Open KiCad Studio settings" aria-label="Open settings">&#9881;</button>
      <button id="export" class="icon" type="button" title="Export chat transcript" aria-label="Export chat">&#8681;</button>
      <button id="clear" class="icon" type="button" title="Clear chat" aria-label="Clear chat">Clear</button>
      <button id="cancel" class="danger" type="button" aria-describedby="cancel-disabled-reason" disabled>Cancel</button>
      <span id="cancel-disabled-reason" class="sr-only">Cancel is disabled until a response is streaming.</span>
    </div>
  </header>
  <div id="quota-banner" class="quota-banner" style="background-color: var(--danger); color: white; padding: 8px; text-align: center;" role="status" hidden>
     <span id="quota-banner-text"></span>
     <button id="quota-banner-retry" style="margin-left: 8px; padding: 2px 6px; background: rgba(0,0,0,0.2); border: none; color: white; cursor: pointer;">
       Retry
     </button>
  </div>
  <main id="messages" aria-live="polite">
    <div id="empty" class="empty">Ask about DRC/ERC issues, component choices, manufacturing risk, or the active KiCad file.</div>
  </main>
  <footer>
    <div class="context-row">
      <div id="context-info"></div>
      <span id="token-estimate">~0 tokens</span>
      <button id="toggle-context" type="button">Attach context</button>
    </div>
    <textarea id="extra-context" rows="2" aria-label="Extra context" placeholder="Additional context for the next turn"></textarea>
    <div class="composer">
      <textarea id="prompt" rows="3" aria-label="Prompt" placeholder="Ask about your KiCad design..."></textarea>
      <button id="send" class="primary" type="button">Send</button>
    </div>
  </footer>
  <script nonce="${nonce}" src="${markdownUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const l10n = globalThis.kicadStudioL10n || { t: (value) => value, apply: () => {} };
    const AUTO_SCROLL_THRESHOLD_PX = 96;
    const MAX_RENDERED_MESSAGES = 240;
    const state = {
      history: [],
      busy: false,
      contextVisible: false,
      scrollPending: false,
      streamPending: false,
      streamQueue: new Map()
    };
    const nodes = {
      messages: document.getElementById('messages'),
      empty: document.getElementById('empty'),
      quotaBanner: document.getElementById('quota-banner'),
      provider: document.getElementById('provider'),
      model: document.getElementById('model'),
      status: document.getElementById('status'),
      prompt: document.getElementById('prompt'),
      extraContext: document.getElementById('extra-context'),
      contextInfo: document.getElementById('context-info'),
      tokenEstimate: document.getElementById('token-estimate'),
      send: document.getElementById('send'),
      cancel: document.getElementById('cancel'),
      toggleContext: document.getElementById('toggle-context'),
      quotaBannerText: document.getElementById('quota-banner-text')
    };

    function text(value) {
      return typeof value === 'string' ? value : '';
    }
    function estimateTokens() {
      const raw = [nodes.prompt.value, nodes.extraContext.value, nodes.contextInfo.textContent || ''].join(' ');
      const count = Math.max(0, Math.ceil(raw.trim().length / 4));
      nodes.tokenEstimate.textContent = '~' + count + ' tokens';
    }
    function postSelection() {
      vscode.postMessage({ type: 'selectionChanged', provider: nodes.provider.value, model: nodes.model.value });
    }
    function sendPrompt() {
      const prompt = nodes.prompt.value.trim();
      if (!prompt) {
        return;
      }
      vscode.postMessage({ type: 'send', prompt, context: nodes.extraContext.value });
      nodes.prompt.value = '';
      estimateTokens();
    }
    function fmtTime(timestamp) {
      const date = new Date(Number(timestamp) || Date.now());
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    function setQuotaBanner(value) {
      const status = text(value);
      const quotaReached = /quota|rate limit|usage limit|limit reached/i.test(status);
      nodes.quotaBanner.hidden = !quotaReached;
      nodes.quotaBannerText.textContent = quotaReached
        ? status || l10n.t('Chat quota reached. Retry after the provider resets quota.')
        : '';
    }
    function setStatus(value) {
      const next = value || l10n.t('Ready');
      nodes.status.textContent = next;
      setQuotaBanner(next);
    }
    function setBusy(busy) {
      state.busy = !!busy;
      nodes.send.disabled = state.busy;
      nodes.cancel.disabled = !state.busy;
      if (state.busy) {
        nodes.cancel.removeAttribute('aria-describedby');
      } else {
        nodes.cancel.setAttribute('aria-describedby', 'cancel-disabled-reason');
      }
      nodes.send.textContent = state.busy ? '…' : l10n.t('Send');
    }
    function clearMessages() {
      for (const item of [...nodes.messages.querySelectorAll('.message')]) {
        item.remove();
      }
    }
    function isNearBottom(el) {
      return el.scrollHeight - el.scrollTop - el.clientHeight < AUTO_SCROLL_THRESHOLD_PX;
    }
    function scheduleScrollToBottom(shouldStick) {
      if (state.scrollPending) {
        return;
      }
      state.scrollPending = true;
      requestAnimationFrame(() => {
        state.scrollPending = false;
        // Re-check: if the user scrolled away between scheduling and the frame,
        // do not steal their scroll position.
        if (shouldStick && !isNearBottom(nodes.messages)) {
          return;
        }
        nodes.messages.scrollTop = nodes.messages.scrollHeight;
      });
    }
    function pruneRenderedMessages() {
      const rendered = [...nodes.messages.querySelectorAll('.message')];
      for (const item of rendered.slice(0, Math.max(0, rendered.length - MAX_RENDERED_MESSAGES))) {
        item.remove();
      }
    }
    function actionButton(label, title, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.addEventListener('click', onClick);
      return button;
    }
    function copyText(value) {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setStatus(l10n.t('Copied message.'));
    }
    function renderBody(body, message, streaming) {
      body.replaceChildren();
      if (message.role === 'assistant') {
        const content = text(message.content);
        if (!content) {
          const typing = document.createElement('span');
          typing.className = 'typing-indicator';
          typing.textContent = l10n.t('Thinking…');
          body.appendChild(typing);
          return;
        }
        if (streaming) {
          // Fast path during streaming: plain text only — skip expensive markdown parse.
          const pre = document.createElement('pre');
          pre.className = 'streaming-text';
          pre.textContent = content;
          body.appendChild(pre);
          return;
        }
        body.innerHTML = window.KiCadChatMarkdown.renderMarkdown(content);
        return;
      }
      const paragraph = document.createElement('p');
      paragraph.textContent = text(message.content);
      body.appendChild(paragraph);
    }
    function renderTools(container, message) {
      const tools = Array.isArray(message.toolCalls) ? message.toolCalls : [];
      if (message.role !== 'assistant' || tools.length === 0) {
        return;
      }
      const details = document.createElement('details');
      details.open = !message.applied;
      const summary = document.createElement('summary');
      summary.textContent = message.applied ? l10n.t('Tool calls handled') : l10n.t('Suggested MCP tool calls');
      details.appendChild(summary);
      const list = document.createElement('div');
      list.className = 'tool-list';
      for (const tool of tools) {
        const row = document.createElement('code');
        row.textContent = tool && typeof tool.name === 'string' ? tool.name : l10n.t('tool');
        list.appendChild(row);
      }
      details.appendChild(list);
      if (message.toolApplyError) {
        const error = document.createElement('div');
        error.className = 'tool-error';
        error.textContent = text(message.toolApplyError);
        details.appendChild(error);
      }
      if (!message.applied) {
        const actions = document.createElement('div');
        actions.className = 'tool-actions';
        actions.append(
          actionButton(l10n.t('Apply'), l10n.t('Apply suggested MCP tool calls'), () => vscode.postMessage({ type: 'applyToolCalls', timestamp: message.timestamp })),
          actionButton(l10n.t('Ignore'), l10n.t('Mark suggested MCP tool calls as handled'), () => vscode.postMessage({ type: 'ignoreToolCalls', timestamp: message.timestamp }))
        );
        details.appendChild(actions);
      }
      container.appendChild(details);
    }
    function renderActions(container, message, body) {
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.append(
        actionButton(l10n.t('Copy'), l10n.t('Copy message'), () => copyText(text(message.content))),
        actionButton(l10n.t('Edit'), l10n.t('Edit this prompt'), () => {
          nodes.prompt.value = text(message.content);
          nodes.prompt.focus();
          estimateTokens();
        }),
        actionButton('+1', l10n.t('Mark helpful'), () => setStatus(l10n.t('Reaction saved.'))),
        actionButton('-1', l10n.t('Mark not helpful'), () => setStatus(l10n.t('Reaction saved.')))
      );
      container.appendChild(actions);
    }
    function renderMessage(message, streaming) {
      const shouldStick = isNearBottom(nodes.messages) || message.role === 'user';
      let article = nodes.messages.querySelector('[data-timestamp="' + String(message.timestamp) + '"]');
      if (!article) {
        article = document.createElement('article');
        article.className = 'message ' + (message.role === 'user' ? 'user' : 'assistant');
        article.dataset.timestamp = String(message.timestamp);
        nodes.messages.appendChild(article);
      }
      article.replaceChildren();
      const head = document.createElement('div');
      head.className = 'message-head';
      const role = document.createElement('span');
      role.className = 'role';
      role.textContent = message.role === 'user' ? l10n.t('You') : l10n.t('Assistant');
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = fmtTime(message.timestamp);
      head.append(role, time);
      const body = document.createElement('div');
      body.className = 'body';
      renderBody(body, message, !!streaming);
      article.append(head, body);
      if (!streaming) {
        renderActions(article, message, body);
        renderTools(article, message);
      }
      nodes.empty.style.display = nodes.messages.querySelector('.message') ? 'none' : 'block';
      pruneRenderedMessages();
      scheduleScrollToBottom(shouldStick);
    }

    /**
     * Fast streaming update: only update the body text without rebuilding the
     * entire message article. This avoids expensive markdown re-parsing and
     * DOM reconstruction on every streamed chunk.
     *
     * When the <pre> element already exists we append only the new chunk as a
     * text node instead of replacing the entire textContent string. This keeps
     * the operation O(chunk) rather than O(total-content) so long responses
     * do not degrade the UI.
     */
    function updateStreamingBody(timestamp, content, chunk) {
      const article = nodes.messages.querySelector('[data-timestamp="' + String(timestamp) + '"]');
      if (!article) {
        return;
      }
      const body = article.querySelector('.body');
      if (!body) {
        return;
      }
      let pre = body.querySelector('.streaming-text');
      if (!pre) {
        body.replaceChildren();
        pre = document.createElement('pre');
        pre.className = 'streaming-text';
        body.appendChild(pre);
        // First chunk — set full content (handles hydration / reconnect cases).
        pre.textContent = content;
      } else if (chunk) {
        // Subsequent chunks — append only the delta to avoid O(n²) cost.
        pre.appendChild(document.createTextNode(chunk));
      } else {
        // No chunk provided (e.g. called from outside streaming path) — full replace.
        pre.textContent = content;
      }
    }
    function queueAssistantDelta(timestamp, content, chunk) {
      const key = String(timestamp);
      const entry = state.streamQueue.get(key) || {
        timestamp,
        content,
        chunk: '',
        shouldStick: false
      };
      entry.content = content;
      entry.chunk += chunk;
      entry.shouldStick = entry.shouldStick || isNearBottom(nodes.messages);
      state.streamQueue.set(key, entry);
      if (state.streamPending) {
        return;
      }
      state.streamPending = true;
      requestAnimationFrame(() => {
        state.streamPending = false;
        const batch = Array.from(state.streamQueue.values());
        state.streamQueue.clear();
        for (const queued of batch) {
          updateStreamingBody(queued.timestamp, queued.content, queued.chunk);
          scheduleScrollToBottom(queued.shouldStick);
        }
      });
    }
    function exportTranscript() {
      const lines = state.history.map((message) => {
        const role = message.role === 'user' ? l10n.t('User') : l10n.t('Assistant');
        return '## ' + role + ' - ' + new Date(message.timestamp).toISOString() + '\\n\\n' + text(message.content);
      });
      copyText(lines.join('\\n\\n'));
      setStatus(l10n.t('Transcript copied.'));
    }

    document.getElementById('settings').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
    document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
    document.getElementById('export').addEventListener('click', exportTranscript);
    document.getElementById('quota-banner-retry').addEventListener('click', () => vscode.postMessage({ type: 'retry' }));
    nodes.cancel.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    nodes.send.addEventListener('click', sendPrompt);
    nodes.provider.addEventListener('change', postSelection);
    nodes.model.addEventListener('change', postSelection);
    nodes.prompt.addEventListener('input', estimateTokens);
    nodes.extraContext.addEventListener('input', estimateTokens);
    nodes.toggleContext.addEventListener('click', () => {
      state.contextVisible = !state.contextVisible;
      nodes.extraContext.classList.toggle('visible', state.contextVisible);
      nodes.toggleContext.textContent = state.contextVisible ? l10n.t('Hide context') : l10n.t('Attach context');
      if (state.contextVisible) {
        nodes.extraContext.focus();
      }
    });
    nodes.prompt.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        sendPrompt();
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'hydrate') {
        state.history = Array.isArray(message.history) ? message.history : [];
        nodes.provider.value = message.provider || 'none';
        nodes.model.value = message.model || '';
        nodes.contextInfo.textContent = message.contextInfo || '';
        clearMessages();
        for (const item of state.history) {
          renderMessage(item, false);
        }
        nodes.empty.style.display = state.history.length ? 'none' : 'block';
        setBusy(!!message.busy);
        if (!message.busy) {
          setStatus(l10n.t('Ready'));
        }
        estimateTokens();
      } else if (message.type === 'appendMessage') {
        state.history.push(message.message);
        renderMessage(message.message, false);
      } else if (message.type === 'assistantChunk') {
        const target = state.history.find((item) => item.timestamp === message.timestamp);
        if (target) {
          const chunk = text(message.text);
          target.content = text(target.content) + chunk;
          queueAssistantDelta(message.timestamp, target.content, chunk);
        }
      } else if (message.type === 'assistantReplace') {
        const index = state.history.findIndex((item) => item.timestamp === message.message?.timestamp);
        if (index >= 0) {
          state.history[index] = message.message;
        } else {
          state.history.push(message.message);
        }
        // Defer full markdown render to the next animation frame so the browser
        // can settle pending streaming layout before the expensive DOM rebuild.
        requestAnimationFrame(() => {
          renderMessage(message.message, false);
        });
      } else if (message.type === 'status') {
        setStatus(message.text || l10n.t('Ready'));
      } else if (message.type === 'busy') {
        setBusy(!!message.busy);
        if (!message.busy) {
          setStatus(l10n.t('Ready'));
        }
      } else if (message.type === 'contextInfo') {
        nodes.contextInfo.textContent = message.text || '';
        estimateTokens();
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`,
    nonce
  );
}
