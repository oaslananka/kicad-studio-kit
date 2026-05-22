import * as vscode from 'vscode';
import { COMMANDS, SEARCH_DEBOUNCE_MS, SETTINGS } from '../constants';
import type { ComponentSearchResult } from '../types';
import { asRecord, asString, hasType } from '../utils/webviewMessages';
import { openDatasheet } from './datasheetOpener';
import { ComponentSearchCache } from './componentSearchCache';
import { LcscClient } from './lcscClient';
import { OctopartClient } from './octopartClient';
import { createNonce } from '../utils/nonce';
import type { KiCadLibraryIndexer } from '../library/libraryIndexer';
import type { PcmService } from '../library/pcmService';
import { injectWebviewLocalization } from '../webviewI18n';

export class ComponentSearchService {
  private detailsPanel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly octopart: OctopartClient,
    private readonly lcsc: LcscClient,
    private readonly cache: ComponentSearchCache,
    private readonly libraryIndexer?: KiCadLibraryIndexer | undefined,
    private readonly pcmService?: PcmService | undefined
  ) {}

  async search(): Promise<void> {
    const sourceChoices = await vscode.window.showQuickPick(
      [
        { label: 'Octopart / Nexar', value: 'octopart', picked: true },
        {
          label: 'LCSC',
          value: 'lcsc',
          picked: vscode.workspace
            .getConfiguration()
            .get<boolean>(SETTINGS.enableLCSC, true)
        }
      ],
      { canPickMany: true, title: 'Choose component sources' }
    );
    if (!sourceChoices?.length) {
      return;
    }

    const query = await vscode.window.showInputBox({
      title: 'Search component',
      prompt: 'Enter part number, description, or value + footprint'
    });
    if (!query) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS));
    const results = await this.searchQuery(
      query,
      sourceChoices
        .map((item) => item.value)
        .filter(
          (value): value is 'octopart' | 'lcsc' =>
            value === 'octopart' || value === 'lcsc'
        )
    );

    const picked = await vscode.window.showQuickPick(
      results.map((result) => ({
        label: result.mpn || result.lcscPartNumber || result.description,
        description: `${result.manufacturer} • ${result.source}`,
        detail: result.description,
        result
      })),
      { title: 'Search results' }
    );
    if (!picked) {
      return;
    }

    await this.showDetails(picked.result);
    await this.offerPcmInstall(picked.result);
  }

  async searchQuery(
    query: string,
    sources: Array<'octopart' | 'lcsc'> = ['octopart', 'lcsc']
  ): Promise<ComponentSearchResult[]> {
    const results: ComponentSearchResult[] = [];
    const selectedSources = new Set(sources);

    if (selectedSources.has('octopart')) {
      results.push(...(await this.searchWithCache('octopart', query)));
    }
    if (selectedSources.has('lcsc')) {
      results.push(...(await this.searchWithCache('lcsc', query)));
    }
    if (
      !results.length &&
      selectedSources.has('octopart') &&
      vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.enableLCSC, true)
    ) {
      results.push(...(await this.searchWithCache('lcsc', query)));
    }
    if (!results.length) {
      results.push(...(await this.searchLocalLibrary(query)));
    }
    if (!results.length) {
      results.push(...(await this.searchPcmPackages(query)));
    }

    return results;
  }

  private async showDetails(result: ComponentSearchResult): Promise<void> {
    if (!this.detailsPanel) {
      this.detailsPanel = vscode.window.createWebviewPanel(
        'kicadstudio.componentDetails',
        'KiCad Component Details',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );
      this.detailsPanel.onDidDispose(() => {
        this.detailsPanel = undefined;
      });
      this.detailsPanel.webview.onDidReceiveMessage(
        async (message: unknown) => {
          if (!hasType(message, ['datasheet', 'copy-mpn', 'pcm-install'])) {
            return;
          }

          const record = asRecord(message);
          const url = asString(record?.['url']);
          const mpn = asString(record?.['mpn']);
          if (message.type === 'datasheet' && url) {
            await openDatasheet(url);
          }
          if (message.type === 'copy-mpn' && mpn) {
            await vscode.env.clipboard.writeText(mpn);
          }
          if (message.type === 'pcm-install') {
            await this.installPcmPackageForResult(result);
          }
        }
      );
    }

    this.detailsPanel.title = `Part: ${result.mpn || result.lcscPartNumber || 'Details'}`;
    const nonce = createNonce();
    const cspSource = this.detailsPanel.webview.cspSource;
    this.detailsPanel.webview.html = injectWebviewLocalization(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      padding: 16px;
    }
    button {
      margin-right: 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(result.mpn || result.lcscPartNumber || 'Part')}</h1>
  <p>${escapeHtml(result.description)}</p>
  <p><strong>Manufacturer:</strong> ${escapeHtml(result.manufacturer || 'Unknown')}</p>
  <p><strong>Source:</strong> ${escapeHtml(result.source)}</p>
  <button id="datasheet">Open Datasheet</button>
  <button id="copy">Copy MPN</button>
  ${result.pcmPackageId ? '<button id="pcm-install">Install PCM Library</button>' : ''}
  <h2>Offers</h2>
  <pre>${escapeHtml(JSON.stringify(result.offers, null, 2))}</pre>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('datasheet').addEventListener('click', () => vscode.postMessage({ type: 'datasheet', url: ${JSON.stringify(result.datasheetUrl ?? '')} }));
    document.getElementById('copy').addEventListener('click', () => vscode.postMessage({ type: 'copy-mpn', mpn: ${JSON.stringify(result.mpn)} }));
    document.getElementById('pcm-install')?.addEventListener('click', () => vscode.postMessage({ type: 'pcm-install' }));
  </script>
</body>
    </html>`,
      nonce
    );
  }

  private async searchWithCache(
    source: 'octopart' | 'lcsc',
    query: string
  ): Promise<ComponentSearchResult[]> {
    const key = ComponentSearchCache.buildKey(query, source);
    const cached = await this.cache.get(key);
    if (cached) {
      return cached;
    }

    try {
      const results =
        source === 'octopart'
          ? await this.octopart.search(query)
          : await this.lcsc.search(query);
      await this.cache.set(key, results, source, query);
      return results;
    } catch (error) {
      if (source === 'octopart') {
        void vscode.window.showWarningMessage(
          `Octopart/Nexar search failed. Falling back to LCSC when available. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      return [];
    }
  }

  private async searchLocalLibrary(
    query: string
  ): Promise<ComponentSearchResult[]> {
    if (!this.libraryIndexer) {
      return [];
    }
    try {
      if (!this.libraryIndexer.isIndexed() || this.libraryIndexer.isStale()) {
        await this.libraryIndexer.indexAll();
      }
      const symbolResults = this.libraryIndexer
        .searchSymbols(query)
        .slice(0, 8)
        .map((symbol) => ({
          source: 'local' as const,
          mpn: symbol.name,
          manufacturer: 'Local KiCad Library',
          description: symbol.description || symbol.name,
          category: symbol.libraryName,
          offers: [],
          specs: [
            ...symbol.keywords.map((keyword) => ({
              name: 'Keyword',
              value: keyword
            })),
            ...symbol.footprintFilters.map((filter) => ({
              name: 'Footprint filter',
              value: filter
            }))
          ]
        }));
      const footprintResults = this.libraryIndexer
        .searchFootprints(query)
        .slice(0, 8)
        .map((footprint) => ({
          source: 'local' as const,
          mpn: footprint.name,
          manufacturer: 'Local KiCad Library',
          description: footprint.description || footprint.name,
          category: footprint.libraryName,
          offers: [],
          specs: footprint.tags.map((tag) => ({ name: 'Tag', value: tag }))
        }));
      return [...symbolResults, ...footprintResults].slice(0, 10);
    } catch {
      return [];
    }
  }

  private async searchPcmPackages(
    query: string
  ): Promise<ComponentSearchResult[]> {
    if (!this.pcmService) {
      return [];
    }
    try {
      return (await this.pcmService.findPackages(query))
        .filter((pkg) => pkg.state !== 'installed')
        .slice(0, 5)
        .map((pkg) => ({
          source: 'local' as const,
          mpn: query,
          manufacturer: 'KiCad PCM',
          description: `${pkg.metadata.name}: ${pkg.metadata.description || 'PCM package available'}`,
          category: pkg.contentTypes.join(', '),
          offers: [],
          specs: [
            { name: 'PCM package', value: pkg.metadata.identifier },
            { name: 'Repository', value: pkg.repositoryName },
            ...(pkg.latestVersion
              ? [{ name: 'Version', value: pkg.latestVersion.version }]
              : [])
          ],
          pcmPackageId: pkg.metadata.identifier
        }));
    } catch {
      return [];
    }
  }

  private async offerPcmInstall(result: ComponentSearchResult): Promise<void> {
    if (!this.pcmService) {
      return;
    }
    const candidate =
      (result.pcmPackageId
        ? this.pcmService
            .getPackages()
            .find((pkg) => pkg.metadata.identifier === result.pcmPackageId)
        : undefined) ??
      (await this.pcmService.findInstallCandidateForResult(result));
    if (!candidate || candidate.state === 'installed') {
      return;
    }
    const action = await vscode.window.showInformationMessage(
      `${candidate.metadata.name} is available from KiCad PCM.`,
      'Install PCM Library'
    );
    if (action === 'Install PCM Library') {
      await vscode.commands.executeCommand(COMMANDS.installPcmPackage, candidate);
    }
  }

  private async installPcmPackageForResult(
    result: ComponentSearchResult
  ): Promise<void> {
    if (!this.pcmService || !result.pcmPackageId) {
      return;
    }
    await vscode.commands.executeCommand(
      COMMANDS.installPcmPackage,
      result.pcmPackageId
    );
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
