(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeHtml(value) {
    return escapeHtml(value);
  }

  function renderInline(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const html = [];
    let inCodeBlock = false;
    let inList = false;

    function closeList() {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
    }

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        closeList();
        if (inCodeBlock) {
          html.push('</code></pre>');
        } else {
          html.push('<pre><code>');
        }
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) {
        html.push(escapeHtml(line) + '\n');
        continue;
      }

      if (!line.trim()) {
        closeList();
        html.push('<br>');
        continue;
      }

      if (/^\s*[-*]\s+/.test(line)) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push(
          '<li>' + renderInline(line.replace(/^\s*[-*]\s+/, '')) + '</li>'
        );
        continue;
      }

      closeList();
      if (line.startsWith('### ')) {
        html.push('<h3>' + renderInline(line.slice(4)) + '</h3>');
        continue;
      }
      if (line.startsWith('## ')) {
        html.push('<h2>' + renderInline(line.slice(3)) + '</h2>');
        continue;
      }
      if (line.startsWith('# ')) {
        html.push('<h1>' + renderInline(line.slice(2)) + '</h1>');
        continue;
      }
      html.push('<p>' + renderInline(line) + '</p>');
    }

    closeList();
    if (inCodeBlock) {
      html.push('</code></pre>');
    }

    return html.join('');
  }

  window.KiCadChatMarkdown = {
    renderMarkdown: renderMarkdown,
    sanitizeHtml: sanitizeHtml
  };
})();
