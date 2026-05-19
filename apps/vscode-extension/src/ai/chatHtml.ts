import * as vscode from 'vscode';
import { createNonce } from '../utils/nonce';

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

  return `<!DOCTYPE html>
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
      grid-template-rows: auto 1fr auto;
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
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
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
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
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
        <option value="codex">Codex (VS Code)</option>
      </select>
      <input id="model" type="text" aria-label="Model" placeholder="Model override">
      <button id="settings" class="icon" type="button" title="Open KiCad Studio settings" aria-label="Open settings">&#9881;</button>
      <button id="export" class="icon" type="button" title="Export chat transcript" aria-label="Export chat">&#8681;</button>
      <button id="clear" class="icon" type="button" title="Clear chat" aria-label="Clear chat">Clear</button>
      <button id="cancel" class="danger" type="button" disabled>Cancel</button>
    </div>
  </header>
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
    const state = { history: [], busy: false, contextVisible: false, scrollPending: false };
    const nodes = {
      messages: document.getElementById('messages'),
      empty: document.getElementById('empty'),
      provider: document.getElementById('provider'),
      model: document.getElementById('model'),
      status: document.getElementById('status'),
      prompt: document.getElementById('prompt'),
      extraContext: document.getElementById('extra-context'),
      contextInfo: document.getElementById('context-info'),
      tokenEstimate: document.getElementById('token-estimate'),
      send: document.getElementById('send'),
      cancel: document.getElementById('cancel'),
      toggleContext: document.getElementById('toggle-context')
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
    function setStatus(value) {
      nodes.status.textContent = value || 'Ready';
    }
    function setBusy(busy) {
      state.busy = !!busy;
      nodes.send.disabled = state.busy;
      nodes.cancel.disabled = !state.busy;
      nodes.send.textContent = state.busy ? '…' : 'Send';
    }
    function clearMessages() {
      for (const item of [...nodes.messages.querySelectorAll('.message')]) {
        item.remove();
      }
    }
    /**
     * Scroll the message list to the bottom using requestAnimationFrame so
     * multiple calls within the same event loop tick are coalesced into a
     * single layout pass. While the assistant is actively streaming (state.busy)
     * we always scroll so new chunks stay visible. Once streaming ends we only
     * scroll when the user is already near the bottom (within 120 px) so
     * manual scroll-up to read history is preserved.
     */
    function scheduleScrollToBottom() {
      if (state.scrollPending) {
        return;
      }
      state.scrollPending = true;
      requestAnimationFrame(() => {
        state.scrollPending = false;
        const el = nodes.messages;
        if (state.busy) {
          el.scrollTop = el.scrollHeight;
          return;
        }
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (nearBottom) {
          el.scrollTop = el.scrollHeight;
        }
      });
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
      setStatus('Copied message.');
    }
    function renderBody(body, message, streaming) {
      body.replaceChildren();
      if (message.role === 'assistant') {
        const content = text(message.content);
        if (!content) {
          const typing = document.createElement('span');
          typing.className = 'typing-indicator';
          typing.textContent = 'Thinking…';
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
      summary.textContent = message.applied ? 'Tool calls handled' : 'Suggested MCP tool calls';
      details.appendChild(summary);
      const list = document.createElement('div');
      list.className = 'tool-list';
      for (const tool of tools) {
        const row = document.createElement('code');
        row.textContent = tool && typeof tool.name === 'string' ? tool.name : 'tool';
        list.appendChild(row);
      }
      details.appendChild(list);
      if (!message.applied) {
        const actions = document.createElement('div');
        actions.className = 'tool-actions';
        actions.append(
          actionButton('Apply', 'Apply suggested MCP tool calls', () => vscode.postMessage({ type: 'applyToolCalls', timestamp: message.timestamp })),
          actionButton('Ignore', 'Mark suggested MCP tool calls as handled', () => vscode.postMessage({ type: 'ignoreToolCalls', timestamp: message.timestamp }))
        );
        details.appendChild(actions);
      }
      container.appendChild(details);
    }
    function renderActions(container, message, body) {
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.append(
        actionButton('Copy', 'Copy message', () => copyText(text(message.content))),
        actionButton('Edit', 'Edit this prompt', () => {
          nodes.prompt.value = text(message.content);
          nodes.prompt.focus();
          estimateTokens();
        }),
        actionButton('+1', 'Mark helpful', () => setStatus('Reaction saved.')),
        actionButton('-1', 'Mark not helpful', () => setStatus('Reaction saved.'))
      );
      container.appendChild(actions);
    }
    function renderMessage(message, streaming) {
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
      role.textContent = message.role === 'user' ? 'You' : 'Assistant';
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
      scheduleScrollToBottom();
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
      scheduleScrollToBottom();
    }
    function exportTranscript() {
      const lines = state.history.map((message) => {
        const role = message.role === 'user' ? 'User' : 'Assistant';
        return '## ' + role + ' - ' + new Date(message.timestamp).toISOString() + '\\n\\n' + text(message.content);
      });
      copyText(lines.join('\\n\\n'));
      setStatus('Transcript copied.');
    }

    document.getElementById('settings').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
    document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
    document.getElementById('export').addEventListener('click', exportTranscript);
    nodes.cancel.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    nodes.send.addEventListener('click', sendPrompt);
    nodes.provider.addEventListener('change', postSelection);
    nodes.model.addEventListener('change', postSelection);
    nodes.prompt.addEventListener('input', estimateTokens);
    nodes.extraContext.addEventListener('input', estimateTokens);
    nodes.toggleContext.addEventListener('click', () => {
      state.contextVisible = !state.contextVisible;
      nodes.extraContext.classList.toggle('visible', state.contextVisible);
      nodes.toggleContext.textContent = state.contextVisible ? 'Hide context' : 'Attach context';
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
          setStatus('Ready');
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
          // Fast path: only update the streaming text area — no full re-render.
          // Pass chunk so updateStreamingBody can append rather than replace.
          updateStreamingBody(message.timestamp, target.content, chunk);
        }
      } else if (message.type === 'assistantReplace') {
        const index = state.history.findIndex((item) => item.timestamp === message.message?.timestamp);
        if (index >= 0) {
          state.history[index] = message.message;
        } else {
          state.history.push(message.message);
        }
        // Full render with markdown now that streaming is complete.
        renderMessage(message.message, false);
      } else if (message.type === 'status') {
        setStatus(message.text || 'Ready');
      } else if (message.type === 'busy') {
        setBusy(!!message.busy);
        if (!message.busy) {
          setStatus('Ready');
        }
      } else if (message.type === 'contextInfo') {
        nodes.contextInfo.textContent = message.text || '';
        estimateTokens();
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
