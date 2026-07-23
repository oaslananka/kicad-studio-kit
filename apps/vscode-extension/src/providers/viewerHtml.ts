import * as vscode from 'vscode';
import type { ViewerEngineState, ViewerMetadata, ViewerState } from '../types';
import { createNonce } from '../utils/nonce';
import { getViewerSidebarWidth } from './viewer/viewerLayerPanel';
import { createViewerEngineState } from './viewer/viewerEngine';
import { createViewerPayload } from './viewer/viewerPayload';
import { resolveViewerPalette } from './viewer/viewerPalette';
import { compactHtmlDocument, escapeScriptJson } from './viewer/viewerTemplate';
import { createViewerControllerScript } from './viewer/viewerControllerScript';
import {
  injectWebviewLocalization,
  localizeWebviewMessage,
  webviewLocale
} from '../webviewI18n';

export interface KiCanvasViewerHtmlOptions {
  title: string;
  fileName: string;
  fileType: 'schematic' | 'board';
  status: string;
  cspSource: string;
  kicanvasUri: string;
  viewerCssUri?: string;
  base64: string;
  disabledReason: string;
  theme?: string;
  fallbackBackground?: string;
  initialEngine?: ViewerEngineState | undefined;
  metadata?: ViewerMetadata;
  restoreState?: ViewerState | undefined;
}

export function createKiCanvasViewerHtml(
  options: KiCanvasViewerHtmlOptions
): string {
  const nonce = createNonce();
  const themeName = options.theme ?? 'kicad';
  const palette = resolveViewerPalette(themeName);
  const hasLayerControls = Boolean(options.metadata?.layers?.length);
  const sidebarWidth = getViewerSidebarWidth(options.metadata);
  const payload = createViewerPayload({
    fileName: options.fileName,
    fileType: options.fileType,
    base64: options.base64,
    disabledReason: options.disabledReason,
    theme: themeName,
    fallbackBackground: options.fallbackBackground ?? '',
    ...(options.initialEngine ? { initialEngine: options.initialEngine } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
    ...(options.restoreState ? { restoreState: options.restoreState } : {})
  });
  const initialEngine =
    payload.engine ??
    createViewerEngineState(
      options.disabledReason ? 'metadata-only' : 'kicanvas',
      options.disabledReason || undefined
    );

  return injectWebviewLocalization(
    compactHtmlDocument(String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src  'nonce-${nonce}' ${options.cspSource} blob:;
    style-src   'nonce-${nonce}' ${options.cspSource};
    worker-src  blob: ${options.cspSource};
    connect-src 'self' blob: data: ${options.cspSource};
    img-src     ${options.cspSource} data: blob:;
    font-src    ${options.cspSource} data:;
  ">
  <title>${escapeHtml(options.title)}: ${escapeHtml(options.fileName)}</title>
  ${
    options.viewerCssUri
      ? `<link rel="stylesheet" href="${escapeAttr(options.viewerCssUri)}">`
      : ''
  }
  <style nonce="${nonce}">
    :root {
      color-scheme: ${palette.colorScheme};
      --bg:      ${palette.bg};
      --panel:   ${palette.panel};
      --border:  ${palette.border};
      --text:    ${palette.text};
      --muted:   ${palette.muted};
      --accent:  ${palette.accent};
      --danger:  ${palette.danger};
      --green:   ${palette.green};
      --viewer-card-bg: ${palette.card};
      --sidebar-width: ${sidebarWidth};
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(options.title)}: ${escapeHtml(options.fileName)}</h1>
    <div class="viewer-toolbar" id="viewer-toolbar" role="toolbar" aria-label="Viewer tools">
      <button class="btn btn-primary" id="reload-btn" type="button" aria-label="Reload viewer">Reload Viewer</button>
      <button class="btn" id="open-kicad-btn" type="button" aria-label="Open in KiCad">Open in KiCad</button>
      <span class="toolbar-divider" aria-hidden="true"></span>
      <button class="btn compact-btn" id="fit-btn" type="button" aria-label="Fit viewer">Fit</button>
      <button class="btn icon-btn" id="zoom-out-btn" type="button" aria-label="Zoom out viewer">-</button>
      <span id="zoom-level" class="zoom-level" aria-label="Current zoom">100%</span>
      <button class="btn icon-btn" id="zoom-in-btn" type="button" aria-label="Zoom in viewer">+</button>
      <label class="toolbar-field sheet-field" for="sheet-select">
        <span>Sheet</span>
        <select id="sheet-select" aria-label="Sheet selector"></select>
      </label>
      <button class="btn compact-btn" id="grid-toggle" type="button" aria-pressed="false">Grid</button>
      <button class="btn compact-btn" id="theme-toggle" type="button" aria-pressed="${themeName === 'light' ? 'true' : 'false'}">${themeName === 'light' ? 'Light' : 'Dark'}</button>
      <label class="reference-search-field" for="reference-search">
        <span>Reference</span>
        <input id="reference-search" type="search" inputmode="search" autocomplete="off" placeholder="Find reference" aria-label="Find reference">
      </label>
      <button class="btn compact-btn" id="reference-search-btn" type="button">Find</button>
      <details class="export-menu" id="export-menu">
        <summary class="btn compact-btn" id="export-menu-toggle" aria-label="Export">Export</summary>
        <div class="export-menu-items">
          <button class="btn" id="export-png-btn" type="button" aria-label="Export PNG">PNG</button>
          <button class="btn" id="export-svg-btn" type="button" aria-label="Export SVG">SVG</button>
        </div>
      </details>
      <button class="btn compact-btn" id="side-panel-toggle" type="button" aria-controls="viewer-side-panel" aria-expanded="false">Panel</button>
    </div>
    <span id="viewer-engine-badge" class="engine-badge" data-engine-kind="${escapeAttr(initialEngine.kind)}" title="${escapeAttr(initialEngine.reason ?? initialEngine.label)}">${escapeHtml(initialEngine.label)}</span>
    <span id="viewer-status">${escapeHtml(options.status)}</span>
  </header>

  <main>
    <div id="viewer-mount"></div>
    <div id="hop-over-overlay" class="hop-over-overlay" aria-label="KiCad 10 hop-over overlay" hidden></div>
    <div id="loading-overlay" class="overlay" role="status" aria-label="Loading file...">
      <div id="loading-card" class="card loading-card">
        <div class="spinner" aria-hidden="true"></div>
        <strong>Loading KiCanvas renderer…</strong>
        <div id="loading-detail">Preparing ${escapeHtml(options.fileType === 'board' ? 'PCB' : 'schematic')} viewer…</div>
      </div>
    </div>
    <div id="error-overlay" class="overlay" hidden>
      <div class="card">
        <p class="error-title" id="error-title">Viewer error</p>
        <p id="error-message">An unexpected error occurred.</p>
        <p>Try clicking <strong>Reload Viewer</strong>. If the problem persists, open the file in KiCad directly.</p>
        <div class="actions">
          <button class="btn btn-primary" id="error-reload-btn" type="button">Reload Viewer</button>
          <button class="btn" id="error-open-btn"   type="button">Open in KiCad</button>
        </div>
        <pre class="error-detail" id="error-detail" aria-label="Error detail"></pre>
      </div>
    </div>
    <div id="empty-overlay" class="overlay" hidden>
      <div class="card">
        <h2 id="empty-title">No drawable objects yet</h2>
        <p>
          ${
            options.fileType === 'board'
              ? 'This PCB file does not contain any footprints, tracks, zones, or graphics that KiCanvas can render.'
              : 'This schematic file does not contain any symbols, wires, labels, or other drawable objects yet.'
          }
        </p>
        <p>Add components in KiCad, save the file, and the viewer will refresh automatically.</p>
        <div id="safe-preview" aria-label="File source preview (first 3000 chars)"></div>
      </div>
    </div>

    <aside id="viewer-side-panel" aria-label="Viewer side panel">
      <div class="side-section" id="engine-section">
        <h2>Viewer Engine</h2>
        <div id="engine-summary" class="meta-row">${escapeHtml(initialEngine.reason ?? initialEngine.label)}</div>
      </div>
      <div class="side-section">
        <h2>Viewer Tools</h2>
        <div class="side-actions">
          ${
            hasLayerControls
              ? `<button class="btn" id="all-layers-btn" type="button" aria-label="Show All layers">All</button>
          <button class="btn" id="none-layers-btn" type="button" aria-label="None - hide all layers">None</button>
          <button class="btn" id="copper-layers-btn" type="button" aria-label="Show Copper Only layers">Copper Only</button>`
              : ''
          }
        </div>
        <div id="selection-summary" class="meta-row">No lasso area selected.</div>
      </div>
      <div class="side-section" id="layers-section" hidden>
        <h2>Layer Visibility</h2>
        <div id="layer-list" class="layer-list"></div>
      </div>
      <div class="side-section" id="tuning-section" hidden>
        <h2>Tuning Profiles</h2>
        <div id="tuning-list" class="meta-list"></div>
      </div>
      <div class="side-section" id="notes-section" hidden>
        <h2>Viewer Notes</h2>
        <div id="notes-list" class="meta-list"></div>
      </div>
    </aside>
  </main>
  <script id="viewer-payload" nonce="${nonce}" type="application/json">${escapeScriptJson(payload)}</script>
  <script src="${escapeAttr(options.kicanvasUri)}" nonce="${nonce}"></script>

  <script nonce="${nonce}">
${createViewerControllerScript()}
  </script>
</body>
</html>`),
    nonce
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Error page
// ─────────────────────────────────────────────────────────────────────────────

export function createViewerErrorHtml(
  fileName: string,
  error: unknown,
  cspSource = ''
): string {
  const message = error instanceof Error ? error.message : String(error);
  const nonce = createNonce();
  const title = `${localizeWebviewMessage('KiCad Studio could not open')} ${fileName}`;
  return /* html */ `<!DOCTYPE html>
<html lang="${escapeAttr(webviewLocale())}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' ${escapeAttr(cspSource)};">
  <title>${escapeHtml(title)}</title>
  <style nonce="${nonce}">
    body  { margin: 0; padding: 24px; background: #0f172a; color: #e2e8f0; font: 13px/1.6 "Segoe UI", sans-serif; }
    .card { max-width: 860px; margin: 0 auto; padding: 22px; border-radius: 16px; background: #111827; border: 1px solid rgba(148,163,184,.22); }
    h1    { margin-top: 0; font-size: 17px; }
    pre   { white-space: pre-wrap; word-break: break-word; background: #020617; padding: 12px; border-radius: 10px; border: 1px solid rgba(148,163,184,.18); }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p><strong>${escapeHtml(localizeWebviewMessage('What happened:'))}</strong> ${escapeHtml(localizeWebviewMessage('the viewer failed while preparing the custom editor.'))}</p>
    <p><strong>${escapeHtml(localizeWebviewMessage('How to fix:'))}</strong> ${escapeHtml(localizeWebviewMessage('reload the window and reopen the file. If the error persists, this message will help diagnose the issue quickly.'))}</p>
    <pre>${escapeHtml(message)}</pre>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a value for use as an HTML attribute (inside double-quotes). */
function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function kicanvasUri(
  context: vscode.ExtensionContext,
  webview: vscode.Webview
): string {
  return webview
    .asWebviewUri(
      vscode.Uri.joinPath(
        context.extensionUri,
        'media',
        'kicanvas',
        'kicanvas.js'
      )
    )
    .toString();
}

export function viewerCssUri(
  context: vscode.ExtensionContext,
  webview: vscode.Webview
): string {
  return webview
    .asWebviewUri(
      vscode.Uri.joinPath(
        context.extensionUri,
        'media',
        'kicanvas',
        'viewer.css'
      )
    )
    .toString();
}
