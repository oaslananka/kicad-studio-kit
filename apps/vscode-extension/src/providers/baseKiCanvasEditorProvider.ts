import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  COMMANDS,
  SETTINGS,
  VIEWER_DEFAULT_LARGE_FILE_THRESHOLD_BYTES,
  VIEWER_HIDDEN_CACHE_RELEASE_MS,
  WEBVIEW_MESSAGE_DEBOUNCE_MS
} from '../constants';
import type { ViewerMetadata, ViewerState } from '../types';
import { bufferToBase64 } from '../utils/fileUtils';
import {
  asNumber,
  asRecord,
  asString,
  hasType,
  isRecord
} from '../utils/webviewMessages';
import {
  createKiCanvasViewerHtml,
  createViewerErrorHtml,
  kicanvasUri,
  viewerCssUri
} from './viewerHtml';

const PROGRESS_INLINE_WARNING_BYTES = 1 * 1024 * 1024;
const LARGE_FILE_METADATA_BYTES = 512 * 1024;
const MAX_PNG_EXPORT_BYTES = 20 * 1024 * 1024;
const PNG_SIGNATURE = '89504e470d0a1a0a';

interface ViewerPayload {
  fileName: string;
  base64: string;
  disabledReason: string;
  theme: string;
  fallbackBackground: string;
  metadata?: ViewerMetadata | undefined;
  restoreState?: ViewerState;
}

interface CachedFilePayload {
  base64: string;
  disabledReason: string;
  mtimeMs: number;
  metadata?: ViewerMetadata | undefined;
}

interface PanelInfo {
  uri: vscode.Uri;
  pendingRefresh: boolean;
  state?: ViewerState | undefined;
  releaseTimer?: NodeJS.Timeout | undefined;
}

type ViewerSvgFallbackProvider = (
  uri: vscode.Uri
) => Promise<string | undefined>;

/**
 * Shared custom editor provider for KiCanvas-backed viewers.
 */
export abstract class BaseKiCanvasEditorProvider
  implements vscode.CustomReadonlyEditorProvider, vscode.Disposable
{
  protected abstract readonly fileExtension: string;
  protected abstract readonly fileType: 'schematic' | 'board';
  protected abstract readonly viewerTitle: string;

  private readonly panels = new Map<string, Set<vscode.WebviewPanel>>();
  private readonly panelInfo = new Map<vscode.WebviewPanel, PanelInfo>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly refreshDebounce = new Map<string, NodeJS.Timeout>();
  private readonly fileCache = new Map<string, CachedFilePayload>();
  private readonly stateByUri = new Map<string, ViewerState>();
  private theme = vscode.workspace
    .getConfiguration()
    .get<string>(SETTINGS.viewerTheme, 'kicad');

  /** Fires whenever a viewer panel for this file type becomes the active editor. */
  private readonly _onDidActivate = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidActivate: vscode.Event<vscode.Uri> = this._onDidActivate.event;

  constructor(
    protected readonly context: vscode.ExtensionContext,
    private readonly svgFallbackProvider?: ViewerSvgFallbackProvider
  ) {
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (!document.fileName.endsWith(this.fileExtension)) {
          return;
        }
        this.invalidateFileCache(document.uri);
        if (
          !vscode.workspace
            .getConfiguration()
            .get<boolean>(SETTINGS.viewerAutoRefresh, true)
        ) {
          return;
        }
        this.scheduleRefresh(document.uri);
      })
    );
  }

  dispose(): void {
    for (const timeout of this.refreshDebounce.values()) {
      clearTimeout(timeout);
    }
    for (const info of this.panelInfo.values()) {
      if (info.releaseTimer) {
        clearTimeout(info.releaseTimer);
      }
    }
    this.disposables.forEach((item) => item.dispose());
    this._onDidActivate.dispose();
  }

  setTheme(theme: string): void {
    this.theme = theme;
    for (const [panel, info] of this.panelInfo) {
      void panel.webview.postMessage({
        type: 'setTheme',
        payload: {
          theme,
          fallbackBackground: resolveViewerFallbackBackground(
            this.fileType,
            theme
          ),
          restoreState: info.state ?? this.stateByUri.get(info.uri.toString())
        }
      });
    }
  }

  getViewerState(uri: vscode.Uri): ViewerState | undefined {
    return this.stateByUri.get(uri.toString());
  }

  protected buildViewerMetadata(
    _uri: vscode.Uri,
    _text: string
  ): ViewerMetadata | undefined {
    return undefined;
  }

  async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
    return {
      uri,
      dispose() {}
    };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    try {
      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'media')
        ]
      };
      this.trackPanel(document.uri, webviewPanel);
      // Notify listeners (e.g. BomViewProvider) that this viewer has opened.
      this._onDidActivate.fire(document.uri);
      // Use a per-panel disposable store so listeners are released when the panel closes,
      // rather than accumulating in the instance-level array for the provider's lifetime.
      const panelDisposables: vscode.Disposable[] = [];
      panelDisposables.push(
        webviewPanel.onDidDispose(() => {
          this.untrackPanel(document.uri, webviewPanel);
          panelDisposables.forEach((d) => d.dispose());
        }),
        webviewPanel.onDidChangeViewState((event) => {
          const info = this.panelInfo.get(event.webviewPanel);
          if (!info) {
            return;
          }
          if (event.webviewPanel.visible) {
            // Notify listeners that this panel has become the active viewer.
            this._onDidActivate.fire(info.uri);
            if (info.releaseTimer) {
              clearTimeout(info.releaseTimer);
              info.releaseTimer = undefined;
            }
            if (info.pendingRefresh) {
              info.pendingRefresh = false;
              void this.refreshDocument(info.uri);
            }
          } else {
            info.releaseTimer = setTimeout(() => {
              this.invalidateFileCache(info.uri);
            }, VIEWER_HIDDEN_CACHE_RELEASE_MS);
          }
        }),
        webviewPanel.webview.onDidReceiveMessage(async (message: unknown) => {
          if (!hasType(message, VIEWER_OUTBOUND_MESSAGE_TYPES)) {
            return;
          }
          if (message.type === 'openInKiCad') {
            await vscode.commands.executeCommand(
              COMMANDS.openInKiCad,
              document.uri
            );
          }
          if (message.type === 'requestRefresh') {
            await this.refreshDocument(document.uri);
          }
          if (message.type === 'viewerState') {
            const info = this.panelInfo.get(webviewPanel);
            const nextState = readViewerState(message.payload);
            if (info && nextState) {
              info.state = nextState;
              this.stateByUri.set(document.uri.toString(), info.state);
            }
          }
          if (message.type === 'selectionChanged') {
            const info = this.panelInfo.get(webviewPanel);
            const payload = readViewerSelection(message.payload);
            if (info) {
              info.state = {
                ...(info.state ?? { zoom: 1, grid: false, theme: this.theme }),
                ...payload
              };
              this.stateByUri.set(document.uri.toString(), info.state);
            }
          }
          if (message.type === 'exportPng') {
            const payload = asRecord(message.payload);
            const dataUrl = asString(payload?.['dataUrl']);
            if (dataUrl) {
              await this.exportPngSnapshot(document.uri, dataUrl);
            }
          }
          if (message.type === 'exportSvg') {
            await vscode.commands.executeCommand(
              COMMANDS.exportViewerSvg,
              document.uri
            );
          }
          if (message.type === 'componentSelected') {
            const info = this.panelInfo.get(webviewPanel);
            const payload = asRecord(message.payload);
            const reference = asString(payload?.['reference']);
            if (info) {
              info.state = {
                ...(info.state ?? { zoom: 1, grid: false, theme: this.theme }),
                selectedReference: reference ?? info.state?.selectedReference
              };
              this.stateByUri.set(document.uri.toString(), info.state);
            }
          }
          if (message.type === 'requestSvgFallback') {
            const payload = asRecord(message.payload);
            const requestId = asString(payload?.['requestId']);
            if (!requestId) {
              return;
            }

            try {
              const svg = await this.svgFallbackProvider?.(document.uri);
              await webviewPanel.webview.postMessage(
                svg
                  ? {
                      type: 'svgFallback',
                      payload: {
                        requestId,
                        svg
                      }
                    }
                  : {
                      type: 'svgFallbackUnavailable',
                      payload: {
                        requestId
                      }
                    }
              );
            } catch {
              await webviewPanel.webview.postMessage({
                type: 'svgFallbackUnavailable',
                payload: {
                  requestId
                }
              });
            }
          }
        })
      );
      await this.postFile(webviewPanel, document.uri);
    } catch (error) {
      webviewPanel.webview.html = createViewerErrorHtml(
        path.basename(document.uri.fsPath),
        error,
        webviewPanel.webview.cspSource
      );
    }
  }

  protected async refreshDocument(uri: vscode.Uri): Promise<void> {
    const payload = await this.buildViewerPayload(uri);
    for (const panel of this.panels.get(uri.toString()) ?? []) {
      if (!panel.visible) {
        const info = this.panelInfo.get(panel);
        if (info) {
          info.pendingRefresh = true;
        }
        continue;
      }
      await panel.webview.postMessage({
        type: 'refresh',
        payload: {
          ...payload,
          restoreState: this.panelInfo.get(panel)?.state
        }
      });
    }
  }

  private scheduleRefresh(uri: vscode.Uri): void {
    const key = uri.toString();
    const existing = this.refreshDebounce.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.refreshDebounce.set(
      key,
      setTimeout(() => {
        this.refreshDebounce.delete(key);
        void this.refreshDocument(uri);
      }, WEBVIEW_MESSAGE_DEBOUNCE_MS)
    );
  }

  private async postFile(
    panel: vscode.WebviewPanel,
    uri: vscode.Uri
  ): Promise<void> {
    const payload = await this.buildViewerPayload(uri);
    panel.webview.html = createKiCanvasViewerHtml({
      title: this.viewerTitle,
      fileName: payload.fileName,
      fileType: this.fileType,
      status: 'Opening interactive renderer...',
      cspSource: panel.webview.cspSource,
      kicanvasUri: kicanvasUri(this.context, panel.webview),
      viewerCssUri: viewerCssUri(this.context, panel.webview),
      base64: payload.base64,
      disabledReason: payload.disabledReason,
      theme: payload.theme,
      fallbackBackground: payload.fallbackBackground,
      ...(payload.metadata ? { metadata: payload.metadata } : {}),
      ...(payload.restoreState ? { restoreState: payload.restoreState } : {})
    });
  }

  private async buildViewerPayload(uri: vscode.Uri): Promise<ViewerPayload> {
    const cacheKey = uri.toString();
    const fileName = path.basename(uri.fsPath);
    const stat = await vscode.workspace.fs.stat(uri);
    const mtimeMs = stat.mtime;
    const cached = this.fileCache.get(cacheKey);
    if (cached && cached.mtimeMs === mtimeMs) {
      const restoreState = this.stateByUri.get(cacheKey);
      return {
        fileName,
        base64: cached.base64,
        disabledReason: cached.disabledReason,
        theme: this.theme,
        fallbackBackground: resolveViewerFallbackBackground(
          this.fileType,
          this.theme
        ),
        ...(cached.metadata ? { metadata: cached.metadata } : {}),
        ...(restoreState ? { restoreState } : {})
      };
    }

    const largeFileThresholdBytes = Math.max(
      1,
      vscode.workspace
        .getConfiguration()
        .get<number>(
          SETTINGS.viewerLargeFileThresholdBytes,
          VIEWER_DEFAULT_LARGE_FILE_THRESHOLD_BYTES
        )
    );
    const canInline = stat.size <= largeFileThresholdBytes;
    const bytes = canInline
      ? stat.size > PROGRESS_INLINE_WARNING_BYTES
        ? await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Loading ${fileName}`
            },
            async () => vscode.workspace.fs.readFile(uri)
          )
        : await vscode.workspace.fs.readFile(uri)
      : undefined;
    const text = bytes
      ? Buffer.from(bytes).toString('utf8')
      : await readTextPrefix(uri, LARGE_FILE_METADATA_BYTES);
    const nextPayload: CachedFilePayload = {
      base64: bytes ? bufferToBase64(bytes) : '',
      disabledReason: canInline
        ? ''
        : `Interactive render is disabled for files larger than ${(largeFileThresholdBytes / 1024 / 1024).toFixed(0)} MB. Metadata is still available in the side panel.`,
      mtimeMs,
      metadata: text ? this.buildViewerMetadata(uri, text) : undefined
    };
    this.fileCache.set(cacheKey, nextPayload);

    return {
      fileName,
      base64: nextPayload.base64,
      disabledReason: nextPayload.disabledReason,
      theme: this.theme,
      fallbackBackground: resolveViewerFallbackBackground(
        this.fileType,
        this.theme
      ),
      ...(nextPayload.metadata ? { metadata: nextPayload.metadata } : {}),
      ...(() => {
        const restoreState = this.stateByUri.get(cacheKey);
        return restoreState ? { restoreState } : {};
      })()
    };
  }

  private invalidateFileCache(uri: vscode.Uri): void {
    this.fileCache.delete(uri.toString());
  }

  private trackPanel(uri: vscode.Uri, panel: vscode.WebviewPanel): void {
    const key = uri.toString();
    const set = this.panels.get(key) ?? new Set<vscode.WebviewPanel>();
    set.add(panel);
    this.panels.set(key, set);
    this.panelInfo.set(panel, {
      uri,
      pendingRefresh: false,
      state: this.stateByUri.get(uri.toString())
    });
  }

  private untrackPanel(uri: vscode.Uri, panel: vscode.WebviewPanel): void {
    const key = uri.toString();
    const set = this.panels.get(key);
    if (set) {
      set.delete(panel);
      if (!set.size) {
        this.panels.delete(key);
      }
    }
    const info = this.panelInfo.get(panel);
    if (info?.releaseTimer) {
      clearTimeout(info.releaseTimer);
    }
    this.panelInfo.delete(panel);
  }

  private async exportPngSnapshot(
    uri: vscode.Uri,
    dataUrl: string
  ): Promise<void> {
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        path.join(
          path.dirname(uri.fsPath),
          `${path.parse(uri.fsPath).name}-viewer.png`
        )
      ),
      filters: {
        PNG: ['png']
      }
    });
    if (!saveUri) {
      return;
    }

    try {
      await vscode.workspace.fs.writeFile(saveUri, parsePngDataUrl(dataUrl));
      void vscode.window.showInformationMessage(
        `Saved viewer snapshot to ${path.basename(saveUri.fsPath)}.`
      );
    } catch (error) {
      void vscode.window.showErrorMessage(
        error instanceof Error ? error.message : 'Invalid PNG snapshot payload.'
      );
    }
  }
}

const BUILTIN_DEFAULT_BACKGROUNDS = {
  board: 'rgb(0, 16, 35)',
  schematic: 'rgb(245, 244, 239)'
} as const;

const BUILTIN_CLASSIC_BACKGROUNDS = {
  board: 'rgb(0, 0, 0)',
  schematic: 'rgb(255, 255, 255)'
} as const;

function resolveViewerFallbackBackground(
  fileType: 'schematic' | 'board',
  theme: string
): string {
  if (fileType === 'board') {
    return (
      readKiCadEditorBackground('board') ?? BUILTIN_DEFAULT_BACKGROUNDS.board
    );
  }

  if (theme !== 'kicad') {
    return '';
  }

  return (
    readKiCadEditorBackground('schematic') ??
    BUILTIN_DEFAULT_BACKGROUNDS.schematic
  );
}

function readKiCadEditorBackground(
  fileType: 'schematic' | 'board'
): string | undefined {
  const configDir = resolveKiCadConfigDir();
  if (!configDir) {
    return undefined;
  }

  const settingsFile = path.join(
    configDir,
    fileType === 'board' ? 'pcbnew.json' : 'eeschema.json'
  );
  const settings = readJsonRecord(settingsFile);
  const appearance = asRecord(settings?.['appearance']);
  const selectedTheme =
    asString(appearance?.['color_theme']) ?? '_builtin_default';

  if (selectedTheme === '_builtin_default') {
    return BUILTIN_DEFAULT_BACKGROUNDS[fileType];
  }

  if (selectedTheme === '_builtin_classic') {
    return BUILTIN_CLASSIC_BACKGROUNDS[fileType];
  }

  const themeFile = path.join(configDir, 'colors', `${selectedTheme}.json`);
  const themeRecord = readJsonRecord(themeFile);
  const section = asRecord(
    themeRecord?.[fileType === 'board' ? 'board' : 'schematic']
  );
  const background = asString(section?.['background']);
  return background ?? BUILTIN_DEFAULT_BACKGROUNDS[fileType];
}

function resolveKiCadConfigDir(): string | undefined {
  const os = process.platform;
  let root: string;

  if (os === 'win32') {
    const appData = process.env['APPDATA'];
    if (!appData) {
      return undefined;
    }
    root = path.join(appData, 'kicad');
  } else if (os === 'darwin') {
    const home = process.env['HOME'];
    if (!home) {
      return undefined;
    }
    root = path.join(home, 'Library', 'Preferences', 'kicad');
  } else {
    // Linux / other POSIX
    const configHome =
      process.env['XDG_CONFIG_HOME'] ??
      path.join(process.env['HOME'] ?? '', '.config');
    root = path.join(configHome, 'kicad');
  }

  if (!fs.existsSync(root)) {
    return undefined;
  }

  const versions = fs
    .readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && /^\d+(?:\.\d+)*$/.test(entry.name)
    )
    .map((entry) => entry.name)
    .sort(compareKiCadVersionsDescending);

  const latest = versions[0];
  return latest ? path.join(root, latest) : undefined;
}

function compareKiCadVersionsDescending(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number(part));
  const rightParts = right.split('.').map((part) => Number(part));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return rightPart - leftPart;
    }
  }

  return 0;
}

function readJsonRecord(filePath: string): Record<string, unknown> | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return asRecord(JSON.parse(raw)) ?? undefined;
  } catch {
    return undefined;
  }
}

async function readTextPrefix(
  uri: vscode.Uri,
  maxBytes: number
): Promise<string | undefined> {
  if (!uri.scheme || uri.scheme === 'file') {
    return readFilePrefix(uri.fsPath, maxBytes);
  }
  const stat = await vscode.workspace.fs.stat(uri);
  if (stat.size > maxBytes) {
    return undefined;
  }
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf8');
}

async function readFilePrefix(
  filePath: string,
  maxBytes: number
): Promise<string> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const result = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, result.bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

function parsePngDataUrl(value: unknown): Buffer {
  if (typeof value !== 'string') {
    throw new Error('Invalid PNG snapshot payload.');
  }

  const prefix = 'data:image/png;base64,';
  if (!value.startsWith(prefix)) {
    throw new Error('Only PNG data URLs can be saved from the viewer.');
  }

  const encoded = value.slice(prefix.length);
  if (Buffer.byteLength(encoded, 'base64') > MAX_PNG_EXPORT_BYTES) {
    throw new Error('PNG snapshot exceeds the 20 MB safety limit.');
  }

  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length > MAX_PNG_EXPORT_BYTES) {
    throw new Error('PNG snapshot exceeds the 20 MB safety limit.');
  }
  if (decoded.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    throw new Error('Invalid PNG snapshot payload.');
  }

  return decoded;
}

const VIEWER_OUTBOUND_MESSAGE_TYPES = [
  'openInKiCad',
  'requestRefresh',
  'viewerState',
  'selectionChanged',
  'exportPng',
  'exportSvg',
  'componentSelected',
  'requestSvgFallback'
];

function readViewerState(value: unknown): ViewerState | undefined {
  const payload = asRecord(value);
  if (!payload) {
    return undefined;
  }
  const zoom = asNumber(payload?.['zoom']);
  const grid = payload?.['grid'];
  const theme = asString(payload?.['theme']);
  if (zoom === undefined || typeof grid !== 'boolean' || !theme) {
    return undefined;
  }

  const selectedArea = readSelectedArea(payload['selectedArea']);
  const activeLayers = readStringArray(payload['activeLayers']);
  return {
    zoom,
    grid,
    theme,
    ...(typeof payload['selectedReference'] === 'string'
      ? { selectedReference: payload['selectedReference'] }
      : {}),
    ...(selectedArea ? { selectedArea } : {}),
    ...(activeLayers ? { activeLayers } : {})
  };
}

function readViewerSelection(value: unknown): Partial<ViewerState> {
  const payload = asRecord(value);
  if (!payload) {
    return {};
  }

  const selectedArea = readSelectedArea(payload['selectedArea']);
  const activeLayers = readStringArray(payload['activeLayers']);
  return {
    ...(typeof payload['selectedReference'] === 'string'
      ? { selectedReference: payload['selectedReference'] }
      : {}),
    ...(selectedArea ? { selectedArea } : {}),
    ...(activeLayers ? { activeLayers } : {})
  };
}

function readSelectedArea(value: unknown):
  | {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const x1 = asNumber(value['x1']);
  const y1 = asNumber(value['y1']);
  const x2 = asNumber(value['x2']);
  const y2 = asNumber(value['y2']);
  if (
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined
  ) {
    return undefined;
  }
  return { x1, y1, x2, y2 };
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}
