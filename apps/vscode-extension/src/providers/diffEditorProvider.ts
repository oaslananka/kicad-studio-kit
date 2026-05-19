import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { bufferToBase64 } from '../utils/fileUtils';
import { GitDiffDetector } from '../git/gitDiffDetector';
import { asRecord, asString, hasType } from '../utils/webviewMessages';
import { createNonce } from '../utils/nonce';

/**
 * Panel manager for visual schematic/PCB Git diffs. Panels are keyed by
 * document URI so re-opening the same file reveals the existing panel.
 */
export class DiffEditorProvider {
  public static readonly viewType = 'kicadstudio.diffViewer';

  /** Track open panels to avoid duplicates. */
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly detector: GitDiffDetector
  ) {}

  // ─── Public command entry-point ───────────────────────────────────────────

  /**
   * Open (or reveal) the visual diff panel for the given URI.
   * Falls back to the active text editor or the first .kicad_sch in the
   * workspace when no URI is supplied.
   */
  async show(resource?: vscode.Uri): Promise<void> {
    const filePath = await this.resolveTarget(resource);
    if (!filePath) {
      void vscode.window.showWarningMessage(
        'KiCad Studio: Open a .kicad_sch or .kicad_pcb file first to view its Git diff.'
      );
      return;
    }

    const uri = vscode.Uri.file(filePath);
    const key = uri.toString();

    // Reveal existing panel
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DiffEditorProvider.viewType,
      `KiCad Diff: ${path.basename(filePath)}`,
      vscode.ViewColumn.Active,
      this.webviewOptions()
    );

    this.configureWebview(panel.webview);
    panel.webview.html = this.buildHtml(panel.webview);
    this.panels.set(key, panel);
    panel.onDidDispose(() => this.panels.delete(key));

    panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!hasType(message, ['navigate', 'refresh', 'copyToClipboard'])) {
        return;
      }
      this.handleMessage(message, uri);
    });

    // Toolbar refresh button
    panel.onDidChangeViewState(async (e) => {
      if (e.webviewPanel.visible) {
        await this.postDiffContent(panel.webview, filePath);
      }
    });

    await this.postDiffContent(panel.webview, filePath);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private configureWebview(webview: vscode.Webview): void {
    webview.options = this.webviewOptions();
  }

  private webviewOptions(): vscode.WebviewOptions & vscode.WebviewPanelOptions {
    return {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };
  }

  private async postDiffContent(
    webview: vscode.Webview,
    filePath: string
  ): Promise<void> {
    // Show loading state immediately
    await webview.postMessage({ type: 'loading' });

    try {
      const versions = this.detector.readFileVersions(filePath);
      const components = await this.detector.getChangedComponents(filePath);

      const added = components.filter((c) => c.type === 'added').length;
      const removed = components.filter((c) => c.type === 'removed').length;
      const changed = components.filter((c) => c.type === 'changed').length;

      await webview.postMessage({
        type: 'setDiff',
        payload: {
          beforeBase64: bufferToBase64(
            Buffer.from(versions.beforeText, 'utf8')
          ),
          afterBase64: bufferToBase64(Buffer.from(versions.afterText, 'utf8')),
          components,
          summary: `Showing diff: HEAD vs Working Tree — ${added} added, ${removed} removed, ${changed} changed`,
          fileName: path.basename(filePath),
          fileType: filePath.endsWith('.kicad_pcb') ? 'board' : 'schematic'
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await webview.postMessage({
        type: 'error',
        payload: { message: `Could not load diff: ${message}` }
      });
    }
  }

  private handleMessage(
    message: { type: string; payload?: unknown },
    _uri: vscode.Uri
  ): void {
    if (message.type === 'navigate') {
      const payload = asRecord(message.payload);
      const reference = asString(payload?.['reference']);
      if (reference) {
        void vscode.window.showInformationMessage(`Diff focus: ${reference}`);
      }
    }

    if (message.type === 'refresh') {
      // Re-send diff data when the user clicks the refresh button in the toolbar
      const key = _uri.toString();
      const panel = this.panels.get(key);
      if (panel) {
        void this.postDiffContent(panel.webview, _uri.fsPath);
      }
    }

    if (message.type === 'copyToClipboard') {
      const payload = asRecord(message.payload);
      const text = asString(payload?.['text']) ?? '';
      void vscode.env.clipboard.writeText(text);
    }
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const templatePath = path.join(
      this.context.extensionUri.fsPath,
      'media',
      'viewer',
      'diff.html'
    );

    if (!fs.existsSync(templatePath)) {
      return this.fallbackHtml(webview);
    }

    const template = fs.readFileSync(templatePath, 'utf8');
    return template
      .replaceAll('{{cspSource}}', webview.cspSource)
      .replaceAll('{{scriptNonce}}', nonce)
      .replaceAll(
        '{{viewerCssUri}}',
        webview
          .asWebviewUri(
            vscode.Uri.joinPath(
              this.context.extensionUri,
              'media',
              'styles',
              'viewer.css'
            )
          )
          .toString()
      )
      .replaceAll(
        '{{kicanvasUri}}',
        webview
          .asWebviewUri(
            vscode.Uri.joinPath(
              this.context.extensionUri,
              'media',
              'kicanvas',
              'kicanvas.js'
            )
          )
          .toString()
      )
      .replaceAll(
        '{{scriptUri}}',
        webview
          .asWebviewUri(
            vscode.Uri.joinPath(
              this.context.extensionUri,
              'media',
              'viewer',
              'diff.js'
            )
          )
          .toString()
      );
  }

  /** Minimal inline fallback if the external HTML template is missing. */
  private fallbackHtml(webview: vscode.Webview): string {
    const csp = webview.cspSource;
    const nonce = createNonce();
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}' ${csp};">
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 2rem; }
    #summary { margin-bottom: 1rem; font-weight: bold; }
    #diff-list { list-style: none; padding: 0; }
    #diff-list li { padding: 4px 8px; border-radius: 3px; margin-bottom: 2px; }
    .added   { background: rgba(0,200,0,0.15); color: #4caf50; }
    .removed { background: rgba(200,0,0,0.15); color: #f44336; }
    .changed { background: rgba(200,200,0,0.15); color: #ffeb3b; }
    #loading { opacity: 0.6; }
    #error   { color: var(--vscode-errorForeground); }
    button   { background: var(--vscode-button-background); color: var(--vscode-button-foreground);
               border: none; padding: 4px 12px; cursor: pointer; border-radius: 3px; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <button id="refresh-btn">↻ Refresh</button>
  <div id="summary">Loading diff…</div>
  <ul id="diff-list"></ul>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const summaryEl = document.getElementById('summary');
    const listEl    = document.getElementById('diff-list');
    document.getElementById('refresh-btn').addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });
    window.addEventListener('message', ({ data }) => {
      if (data.type === 'loading') {
        summaryEl.textContent = 'Loading diff…';
        listEl.innerHTML = '';
      } else if (data.type === 'error') {
        summaryEl.textContent = '⚠ ' + data.payload.message;
      } else if (data.type === 'setDiff') {
        summaryEl.textContent = data.payload.summary;
        listEl.innerHTML = data.payload.components.map(c =>
          '<li class="' + c.type + '">' +
            (c.type === 'added' ? '+ ' : c.type === 'removed' ? '- ' : '~ ') +
            (c.reference ?? c.uuid ?? '?') +
            (c.value ? ' (' + c.value + ')' : '') +
          '</li>'
        ).join('');
      }
    });
  </script>
</body>
</html>`;
  }

  private async resolveTarget(
    resource?: vscode.Uri
  ): Promise<string | undefined> {
    if (
      resource &&
      (resource.fsPath.endsWith('.kicad_sch') ||
        resource.fsPath.endsWith('.kicad_pcb'))
    ) {
      return resource.fsPath;
    }
    const active = vscode.window.activeTextEditor?.document.fileName;
    if (
      active &&
      (active.endsWith('.kicad_sch') || active.endsWith('.kicad_pcb'))
    ) {
      return active;
    }
    const files = await vscode.workspace.findFiles(
      '**/*.kicad_sch',
      '**/node_modules/**',
      1
    );
    return files[0]?.fsPath;
  }
}
