import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { KiCadCliDetector } from '../cli/kicadCliDetector';
import { KiCadCliRunner } from '../cli/kicadCliRunner';
import { createNonce } from '../utils/nonce';
import {
  LibraryFootprint,
  LibrarySymbol,
  KiCadLibraryIndexer
} from './libraryIndexer';

type SymbolQuickPickItem = vscode.QuickPickItem & { symbol: LibrarySymbol };
type FootprintQuickPickItem = vscode.QuickPickItem & {
  footprint: LibraryFootprint;
};

/**
 * QuickPick-based local KiCad library search UI.
 */
export class LibrarySearchProvider {
  constructor(
    private readonly indexer: KiCadLibraryIndexer,
    private readonly logger: Logger,
    private readonly cliDetector: KiCadCliDetector,
    private readonly cliRunner: KiCadCliRunner,
    private readonly extensionUri: vscode.Uri
  ) {}

  async searchSymbols(): Promise<void> {
    await this.ensureIndex();
    const picker = vscode.window.createQuickPick<SymbolQuickPickItem>();
    picker.placeholder = 'Search by symbol name, description, or keyword...';
    picker.matchOnDescription = true;
    picker.matchOnDetail = true;
    picker.onDidChangeValue((query) => {
      picker.items = this.indexer.searchSymbols(query).map((symbol) => ({
        label: symbol.name,
        description: symbol.libraryName,
        detail: symbol.description,
        symbol
      }));
    });
    picker.onDidAccept(() => {
      const item = picker.selectedItems[0];
      picker.dispose();
      if (item) {
        void this.showSymbolPreview(item.symbol);
      }
    });
    picker.items = this.indexer.searchSymbols('').map((symbol) => ({
      label: symbol.name,
      description: symbol.libraryName,
      detail: symbol.description,
      symbol
    }));
    picker.show();
  }

  async searchFootprints(): Promise<void> {
    await this.ensureIndex();
    const picker = vscode.window.createQuickPick<FootprintQuickPickItem>();
    picker.placeholder = 'Search by footprint name, description, or tags...';
    picker.matchOnDescription = true;
    picker.matchOnDetail = true;
    picker.onDidChangeValue((query) => {
      picker.items = this.indexer.searchFootprints(query).map((footprint) => ({
        label: footprint.name,
        description: footprint.libraryName,
        detail: footprint.description || footprint.tags.join(', '),
        footprint
      }));
    });
    picker.onDidAccept(() => {
      const item = picker.selectedItems[0];
      picker.dispose();
      if (item) {
        void this.showFootprintPreview(item.footprint);
      }
    });
    picker.items = this.indexer.searchFootprints('').map((footprint) => ({
      label: footprint.name,
      description: footprint.libraryName,
      detail: footprint.description || footprint.tags.join(', '),
      footprint
    }));
    picker.show();
  }

  private async ensureIndex(): Promise<void> {
    if (this.indexer.isIndexed() && !this.indexer.isStale()) {
      return;
    }
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'KiCad libraries are being indexed...'
      },
      (progress) => this.indexer.indexAll(progress)
    );
  }

  private async showSymbolPreview(symbol: LibrarySymbol): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'kicadstudio.librarySymbolPreview',
      `Symbol: ${symbol.name}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
      }
    );
    const nonce = createNonce();
    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; img-src ${panel.webview.cspSource} data:;">
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>${escapeHtml(symbol.name)}</h1>
  <p><strong>Library:</strong> ${escapeHtml(symbol.libraryName)}</p>
  <p><strong>Description:</strong> ${escapeHtml(symbol.description || 'No description')}</p>
  <p><strong>Keywords:</strong> ${escapeHtml(symbol.keywords.join(', ') || 'None')}</p>
  <p><strong>Value:</strong> ${escapeHtml(symbol.value || 'Unknown')}</p>
  <p><strong>Footprint filters:</strong> ${escapeHtml(symbol.footprintFilters.join(', ') || 'None')}</p>
  <pre>${escapeHtml(symbol.libraryPath)}</pre>
</body>
</html>`;
  }

  private async showFootprintPreview(
    footprint: LibraryFootprint
  ): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'kicadstudio.libraryFootprintPreview',
      `Footprint: ${footprint.name}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
      }
    );

    let svgMarkup = '';
    if (await this.cliDetector.hasCapability('fpSvg')) {
      try {
        svgMarkup = await this.renderFootprintSvg(footprint.libraryPath);
      } catch (error) {
        this.logger.warn(
          `Footprint preview fallback for ${footprint.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const svgDataUri = svgMarkup ? createSvgDataUri(svgMarkup) : '';
    const nonce = createNonce();
    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; img-src ${panel.webview.cspSource} data:;">
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    .preview { max-width: 100%; max-height: 520px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
  </style>
</head>
<body>
  <h1>${escapeHtml(footprint.name)}</h1>
  <p><strong>Library:</strong> ${escapeHtml(footprint.libraryName)}</p>
  <p><strong>Description:</strong> ${escapeHtml(footprint.description || 'No description')}</p>
  <p><strong>Tags:</strong> ${escapeHtml(footprint.tags.join(', ') || 'None')}</p>
  ${svgDataUri ? `<img class="preview" src="${escapeAttr(svgDataUri)}" alt="Footprint preview" />` : '<p>SVG preview unavailable. Showing metadata-only fallback.</p>'}
  <pre>${escapeHtml(footprint.libraryPath)}</pre>
</body>
</html>`;
  }

  private async renderFootprintSvg(filePath: string): Promise<string> {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-fp-preview-')
    );
    await this.cliRunner.run<string>({
      command: ['fp', 'export', 'svg', '--output', tempRoot, filePath],
      cwd: path.dirname(filePath),
      progressTitle: 'Rendering footprint preview'
    });
    const svgFile = fs
      .readdirSync(tempRoot)
      .map((entry) => path.join(tempRoot, entry))
      .find((entry) => entry.endsWith('.svg'));
    if (!svgFile) {
      return '';
    }
    return fs.readFileSync(svgFile, 'utf8');
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function createSvgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
