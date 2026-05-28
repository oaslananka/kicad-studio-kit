import * as vscode from 'vscode';
import { buildChatHtml } from '../../src/ai/chatHtml';

function createWebviewMock(): vscode.Webview {
  return {
    cspSource: 'vscode-resource:',
    asWebviewUri: jest.fn((uri: vscode.Uri) => uri)
  } as unknown as vscode.Webview;
}

describe('buildChatHtml', () => {
  it('uses a strict nonce CSP with no unsafe inline script or style', () => {
    const html = buildChatHtml({
      webview: createWebviewMock(),
      extensionUri: vscode.Uri.file('/extension')
    });

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("style-src 'nonce-");
    expect(html).toContain("script-src 'nonce-");
    expect(html).not.toContain("'unsafe-inline'");
    expect(html).not.toContain('https://cdn');
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });

  it('includes the pragmatic chat controls expected by the webview', () => {
    const html = buildChatHtml({
      webview: createWebviewMock(),
      extensionUri: vscode.Uri.file('/extension')
    });

    expect(html).toContain('id="provider"');
    expect(html).toContain('id="model"');
    expect(html).toContain('id="settings"');
    expect(html).toContain('id="export"');
    expect(html).toContain('id="cancel"');
    expect(html).toContain('id="quota-banner"');
    expect(html).toContain('id="toggle-context"');
    expect(html).toContain('id="token-estimate"');
    expect(html).toContain('Suggested MCP tool calls');
    expect(html).toContain('renderMarkdown(content)');
  });

  it('batches streaming updates and preserves manual scroll position', () => {
    const html = buildChatHtml({
      webview: createWebviewMock(),
      extensionUri: vscode.Uri.file('/extension')
    });

    expect(html).toContain('const AUTO_SCROLL_THRESHOLD_PX = 96;');
    expect(html).toContain('const MAX_RENDERED_MESSAGES = 240;');
    expect(html).toContain('function isNearBottom(el)');
    expect(html).toContain('function queueAssistantDelta');
    expect(html).toContain('requestAnimationFrame(() => {');
    expect(html).not.toContain('if (state.busy) {');
    expect(html).toContain('quota|rate limit|usage limit|limit reached');
  });
});
