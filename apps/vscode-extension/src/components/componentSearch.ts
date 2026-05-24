import * as vscode from 'vscode';
import {
  AI_SECRET_KEYS,
  COMMANDS,
  OCTOPART_SECRET_KEY,
  SEARCH_DEBOUNCE_MS,
  SETTINGS
} from '../constants';
import type { BomEntry, ComponentSearchResult } from '../types';
import { BomParser } from '../bom/bomParser';
import { SExpressionParser } from '../language/sExpressionParser';
import {
  asNumber,
  asRecord,
  asString,
  hasType
} from '../utils/webviewMessages';
import { openDatasheet } from './datasheetOpener';
import { ComponentSearchCache } from './componentSearchCache';
import { LcscClient } from './lcscClient';
import { OctopartClient } from './octopartClient';
import { createNonce } from '../utils/nonce';
import type { KiCadLibraryIndexer } from '../library/libraryIndexer';
import type { PcmService } from '../library/pcmService';
import { injectWebviewLocalization } from '../webviewI18n';

type ComponentSearchSource = 'octopart' | 'lcsc';
type ProviderStatus = 'ready' | 'warning' | 'disabled';

export interface ComponentSearchProviderChip {
  id: 'local' | 'lcsc' | 'octopart' | 'ai';
  label: string;
  status: ProviderStatus;
  detail: string;
}

export interface ComponentSearchRecommendation {
  label: string;
  query: string;
  detail?: string | undefined;
}

export interface ComponentSearchViewResult {
  result: ComponentSearchResult;
  availability: string;
  footprintMatch: string;
  datasheet: string;
  confidence: string;
}

export interface ComponentSearchViewState {
  nonce: string;
  cspSource: string;
  query: string;
  loading: boolean;
  providers: ComponentSearchProviderChip[];
  warnings: string[];
  recentSearches: string[];
  recommendations: ComponentSearchRecommendation[];
  results: ComponentSearchViewResult[];
  projectName?: string | undefined;
  error?: string | undefined;
}

export interface ComponentSearchProjectContext {
  activeFile?: string | undefined;
  selectedReference?: string | undefined;
  projectName?: string | undefined;
}

interface ComponentSearchProviderState {
  providers: ComponentSearchProviderChip[];
  warnings: string[];
  inlineSources: ComponentSearchSource[];
}

const RECENT_SEARCHES_KEY = 'kicadstudio.componentSearch.recentSearches';
const MAX_RECENT_SEARCHES = 6;
const MAX_RECOMMENDATIONS = 4;

export class ComponentSearchService implements vscode.WebviewViewProvider {
  private detailsPanel: vscode.WebviewPanel | undefined;
  private searchView: vscode.WebviewView | undefined;
  private lastInlineResults: ComponentSearchResult[] = [];

  constructor(
    private readonly octopart: OctopartClient,
    private readonly lcsc: LcscClient,
    private readonly cache: ComponentSearchCache,
    private readonly libraryIndexer?: KiCadLibraryIndexer | undefined,
    private readonly pcmService?: PcmService | undefined,
    private readonly extensionContext?:
      | Pick<vscode.ExtensionContext, 'globalState' | 'secrets'>
      | undefined,
    private readonly projectContextProvider?:
      | (() => Promise<ComponentSearchProjectContext | undefined>)
      | undefined
  ) {}

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext<unknown>,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.searchView = webviewView;
    webviewView.title = vscode.l10n.t('Component Search');
    webviewView.description = vscode.l10n.t('Inline part lookup');
    webviewView.webview.options = {
      enableScripts: true
    };
    webviewView.onDidDispose(() => {
      if (this.searchView === webviewView) {
        this.searchView = undefined;
      }
    });
    webviewView.webview.onDidReceiveMessage((message: unknown) =>
      this.handleSearchViewMessage(message)
    );

    await this.renderSearchView();
  }

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

  private async handleSearchViewMessage(message: unknown): Promise<void> {
    if (
      !hasType(message, [
        'search',
        'use-query',
        'open-result',
        'datasheet',
        'copy-mpn',
        'pcm-install',
        'setup-octopart',
        'setup-ai'
      ])
    ) {
      return;
    }

    const record = asRecord(message);
    const payload = asRecord(record?.['payload']) ?? record;
    const query = asString(payload?.['query'])?.trim();
    const index = asNumber(payload?.['index']);

    if (message.type === 'search' || message.type === 'use-query') {
      await this.runInlineSearch(query ?? '');
      return;
    }

    if (message.type === 'setup-octopart') {
      await vscode.commands.executeCommand(COMMANDS.setOctopartApiKey);
      await this.renderSearchView({ query: query ?? '' });
      return;
    }

    if (message.type === 'setup-ai') {
      await vscode.commands.executeCommand(COMMANDS.setAiApiKey);
      await this.renderSearchView({ query: query ?? '' });
      return;
    }

    if (typeof index !== 'number') {
      return;
    }
    const result = this.lastInlineResults[index];
    if (!result) {
      return;
    }

    if (message.type === 'open-result') {
      await this.showDetails(result);
      await this.offerPcmInstall(result);
      return;
    }

    if (message.type === 'datasheet' && result.datasheetUrl) {
      await openDatasheet(result.datasheetUrl);
      return;
    }

    if (message.type === 'copy-mpn') {
      await vscode.env.clipboard.writeText(
        result.mpn || result.lcscPartNumber || result.description
      );
      return;
    }

    if (message.type === 'pcm-install') {
      await this.installPcmPackageForResult(result);
    }
  }

  private async runInlineSearch(query: string): Promise<void> {
    if (!query) {
      this.lastInlineResults = [];
      await this.renderSearchView({ query: '' });
      return;
    }

    await this.renderSearchView({ query, loading: true });
    try {
      const providerState = await this.getProviderState();
      const results = await this.searchQuery(
        query,
        providerState.inlineSources
      );
      this.lastInlineResults = results;
      await this.rememberSearch(query);
      await this.renderSearchView({
        query,
        results: this.toViewResults(results, query),
        warnings: providerState.warnings
      });
    } catch (error) {
      this.lastInlineResults = [];
      await this.renderSearchView({
        query,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async renderSearchView(
    update: Partial<
      Pick<
        ComponentSearchViewState,
        'query' | 'loading' | 'warnings' | 'results' | 'error'
      >
    > = {}
  ): Promise<void> {
    if (!this.searchView) {
      return;
    }

    const [providerState, recentSearches, recommendations, projectContext] =
      await Promise.all([
        this.getProviderState(),
        this.getRecentSearches(),
        this.getRecommendedSearches(),
        this.getProjectContext()
      ]);
    const nonce = createNonce();
    this.searchView.webview.html = buildComponentSearchViewHtml({
      nonce,
      cspSource: this.searchView.webview.cspSource,
      query: update.query ?? '',
      loading: update.loading ?? false,
      providers: providerState.providers,
      warnings: update.warnings ?? providerState.warnings,
      recentSearches,
      recommendations,
      results: update.results ?? [],
      projectName: projectContext?.projectName,
      error: update.error
    });
  }

  async searchQuery(
    query: string,
    sources: ComponentSearchSource[] = ['octopart', 'lcsc']
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
    this.detailsPanel.webview.html = buildComponentDetailsHtml(result, {
      nonce,
      cspSource
    });
  }

  private async searchWithCache(
    source: ComponentSearchSource,
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
      await vscode.commands.executeCommand(
        COMMANDS.installPcmPackage,
        candidate
      );
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

  private async getProviderState(): Promise<ComponentSearchProviderState> {
    const lcscEnabled = vscode.workspace
      .getConfiguration()
      .get<boolean>(SETTINGS.enableLCSC, true);
    const octopartConfigured = Boolean(
      await this.extensionContext?.secrets.get(OCTOPART_SECRET_KEY)
    );
    const aiConfigured = await this.hasConfiguredAiKey();
    const localAvailable = Boolean(this.libraryIndexer);
    const localReady =
      localAvailable &&
      this.libraryIndexer?.isIndexed() === true &&
      this.libraryIndexer?.isStale() === false;

    const warnings: string[] = [];
    if (!octopartConfigured) {
      warnings.push(
        'Octopart/Nexar API key is missing; LCSC and local library searches still work.'
      );
    }
    if (!aiConfigured) {
      warnings.push(
        'AI API key is missing; AI matching stays disabled without blocking search.'
      );
    }
    if (!lcscEnabled) {
      warnings.push(
        'LCSC search is disabled in settings; local and configured providers still work.'
      );
    }

    return {
      providers: [
        {
          id: 'local',
          label: 'Local KiCad libraries',
          status: localReady
            ? 'ready'
            : localAvailable
              ? 'warning'
              : 'disabled',
          detail: localReady
            ? 'Indexed'
            : localAvailable
              ? 'Indexes on first local fallback'
              : 'Unavailable'
        },
        {
          id: 'lcsc',
          label: 'LCSC',
          status: lcscEnabled ? 'ready' : 'disabled',
          detail: lcscEnabled ? 'Enabled' : 'Disabled'
        },
        {
          id: 'octopart',
          label: 'Octopart/Nexar',
          status: octopartConfigured ? 'ready' : 'warning',
          detail: octopartConfigured ? 'API key stored' : 'API key needed'
        },
        {
          id: 'ai',
          label: 'AI matching',
          status: aiConfigured ? 'ready' : 'warning',
          detail: aiConfigured ? 'API key stored' : 'API key needed'
        }
      ],
      warnings,
      inlineSources: [
        ...(octopartConfigured ? (['octopart'] as const) : []),
        ...(lcscEnabled ? (['lcsc'] as const) : [])
      ]
    };
  }

  private async hasConfiguredAiKey(): Promise<boolean> {
    if (!this.extensionContext) {
      return false;
    }
    for (const key of Object.values(AI_SECRET_KEYS)) {
      if (await this.extensionContext.secrets.get(key)) {
        return true;
      }
    }
    return false;
  }

  private async getRecentSearches(): Promise<string[]> {
    return (
      this.extensionContext?.globalState.get<string[]>(
        RECENT_SEARCHES_KEY,
        []
      ) ?? []
    ).filter((entry) => typeof entry === 'string' && entry.trim());
  }

  private async rememberSearch(query: string): Promise<void> {
    if (!this.extensionContext) {
      return;
    }
    const normalized = query.trim();
    if (!normalized) {
      return;
    }
    const existing = await this.getRecentSearches();
    const next = [
      normalized,
      ...existing.filter(
        (entry) => entry.toLowerCase() !== normalized.toLowerCase()
      )
    ].slice(0, MAX_RECENT_SEARCHES);
    await this.extensionContext.globalState.update(RECENT_SEARCHES_KEY, next);
  }

  private async getRecommendedSearches(): Promise<
    ComponentSearchRecommendation[]
  > {
    const projectContext = await this.getProjectContext();
    const activeFile = projectContext?.activeFile;
    if (!projectContext || !activeFile?.endsWith('.kicad_sch')) {
      return [];
    }

    let entries: BomEntry[];
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(activeFile)
      );
      const text = new TextDecoder().decode(bytes);
      entries = new BomParser(new SExpressionParser()).parse(text, false);
    } catch {
      return [];
    }

    const selectedReference = projectContext.selectedReference?.toLowerCase();
    const selectedEntries = selectedReference
      ? entries.filter((entry) =>
          entry.references.some(
            (reference) => reference.toLowerCase() === selectedReference
          )
        )
      : entries;

    return selectedEntries
      .map((entry) => this.toRecommendation(entry, projectContext))
      .filter((entry): entry is ComponentSearchRecommendation =>
        Boolean(entry?.query)
      )
      .slice(0, MAX_RECOMMENDATIONS);
  }

  private async getProjectContext(): Promise<
    ComponentSearchProjectContext | undefined
  > {
    try {
      return await this.projectContextProvider?.();
    } catch {
      return undefined;
    }
  }

  private toRecommendation(
    entry: BomEntry,
    projectContext: ComponentSearchProjectContext
  ): ComponentSearchRecommendation | undefined {
    const query =
      entry.mpn ||
      entry.lcsc ||
      [entry.value, compactFootprint(entry.footprint)]
        .filter(Boolean)
        .join(' ');
    if (!query) {
      return undefined;
    }
    const reference = entry.references[0] ?? 'symbol';
    return {
      label: vscode.l10n.t({
        message: 'Recommended for {reference}',
        args: { reference },
        comment: 'Suggested component search label for a schematic reference.'
      }),
      query,
      detail: [
        projectContext.projectName,
        entry.value,
        compactFootprint(entry.footprint)
      ]
        .filter(Boolean)
        .join(' • ')
    };
  }

  private toViewResults(
    results: ComponentSearchResult[],
    query: string
  ): ComponentSearchViewResult[] {
    return results.map((result) => ({
      result,
      availability: formatAvailability(result),
      footprintMatch: formatFootprintMatch(result),
      datasheet: result.datasheetUrl ? 'Available' : 'Not provided',
      confidence: estimateConfidence(result, query)
    }));
  }
}

export function buildComponentSearchViewHtml(
  state: ComponentSearchViewState
): string {
  const providerChips = state.providers
    .map(
      (provider) => `<span class="provider provider-${escapeHtml(
        provider.status
      )}" data-provider-id="${escapeHtml(provider.id)}">
        <span class="provider-label">${escapeHtml(provider.label)}</span>
        <span class="provider-detail">${escapeHtml(provider.detail)}</span>
      </span>`
    )
    .join('');
  const warnings = state.warnings.length
    ? `<section class="warnings" role="status" aria-label="Provider warnings">
        <p>Missing API keys are non-blocking provider warnings.</p>
        <ul>
          ${state.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}
        </ul>
        <div class="warning-actions">
          <button type="button" data-command="setup-octopart">Set Octopart/Nexar API Key</button>
          <button type="button" data-command="setup-ai">Set AI API Key</button>
        </div>
      </section>`
    : '';
  const recommendations = state.recommendations.length
    ? `<section class="suggestions" aria-label="Recommended parts">
        <h2>Recommended parts</h2>
        ${state.projectName ? `<p class="section-context">${escapeHtml(state.projectName)}</p>` : ''}
        <div class="suggestion-list">
          ${state.recommendations
            .map((recommendation) =>
              searchPill(
                recommendation.label,
                recommendation.query,
                recommendation.detail
              )
            )
            .join('')}
        </div>
      </section>`
    : '';
  const recentSearches = state.recentSearches.length
    ? `<section class="suggestions" aria-label="Recent searches">
        <h2>Recent searches</h2>
        <div class="suggestion-list">
          ${state.recentSearches
            .map((query) => searchPill(query, query))
            .join('')}
        </div>
      </section>`
    : '';
  const resultList = state.results.length
    ? `<section class="results" aria-live="polite">
        <h2>Results</h2>
        <ol>
          ${state.results.map((result, index) => resultRow(result, index)).join('')}
        </ol>
      </section>`
    : state.query && !state.loading && !state.error
      ? `<section class="empty" aria-live="polite">No matching components yet.</section>`
      : '';
  const loading = state.loading
    ? '<section class="loading" aria-live="polite">Searching providers...</section>'
    : '';
  const error = state.error
    ? `<section class="error" role="alert">${escapeHtml(state.error)}</section>`
    : '';

  return injectWebviewLocalization(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${state.nonce}'; script-src 'nonce-${state.nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component Search</title>
  <style nonce="${state.nonce}">
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      font: var(--vscode-font-size) var(--vscode-font-family);
    }
    .search-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      align-items: center;
    }
    label.sr-only {
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
    input {
      width: 100%;
      min-width: 0;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 3px;
      padding: 7px 8px;
      font: inherit;
    }
    input:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 2px;
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 0;
      border-radius: 3px;
      padding: 7px 9px;
      font: inherit;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
    .providers,
    .suggestion-list,
    .warning-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .providers { margin: 10px 0; }
    .provider,
    .pill {
      display: inline-flex;
      min-width: 0;
      max-width: 100%;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--vscode-contrastBorder, var(--vscode-panel-border));
      border-radius: 999px;
      padding: 4px 7px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      line-height: 1.25;
    }
    .provider-warning { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground)); }
    .provider-disabled { opacity: 0.72; background: var(--vscode-editorWidget-background); color: var(--vscode-descriptionForeground); }
    .provider-label,
    .provider-detail,
    .pill-label {
      overflow-wrap: anywhere;
    }
    .provider-detail {
      color: inherit;
      opacity: 0.78;
    }
    section { margin-top: 12px; }
    h2 {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
    }
    .section-context {
      margin: -2px 0 8px;
      color: var(--vscode-descriptionForeground);
      overflow-wrap: anywhere;
    }
    .warnings,
    .error,
    .empty,
    .loading {
      border-left: 3px solid var(--vscode-inputValidation-warningBorder, var(--vscode-focusBorder));
      padding: 8px;
      background: var(--vscode-editorWidget-background);
    }
    .warnings p,
    .warnings ul {
      margin: 0 0 8px;
      padding-left: 16px;
    }
    .warnings p { padding-left: 0; }
    .results ol {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .result {
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 8px;
    }
    .result-title {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: flex-start;
    }
    .result-title strong,
    .result-description {
      overflow-wrap: anywhere;
    }
    .source {
      flex: 0 0 auto;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .result-description {
      margin: 4px 0 6px;
      color: var(--vscode-descriptionForeground);
    }
    dl {
      display: grid;
      grid-template-columns: minmax(7.5em, auto) minmax(0, 1fr);
      gap: 4px 8px;
      margin: 0 0 8px;
    }
    dt { color: var(--vscode-descriptionForeground); }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .result-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .pill {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border-color: var(--vscode-textLink-foreground);
      padding: 3px 7px;
    }
  </style>
</head>
<body>
  <form id="component-search-form" class="search-form">
    <label class="sr-only" for="component-search-input">Search components</label>
    <input id="component-search-input" type="search" value="${escapeHtml(state.query)}" placeholder="Part number, value, or footprint" autocomplete="off">
    <button type="submit">Search</button>
  </form>
  <div class="providers" aria-label="Provider status">${providerChips}</div>
  ${warnings}
  ${recommendations}
  ${recentSearches}
  ${loading}
  ${error}
  ${resultList}
  <script nonce="${state.nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('component-search-input');
    document.getElementById('component-search-form').addEventListener('submit', (event) => {
      event.preventDefault();
      vscode.postMessage({ type: 'search', query: input.value });
    });
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-command]');
      if (!target) {
        return;
      }
      const command = target.getAttribute('data-command');
      const index = Number(target.getAttribute('data-index'));
      const query = target.getAttribute('data-query') || input.value;
      if (command === 'use-query') {
        input.value = query;
        vscode.postMessage({ type: 'use-query', query });
        return;
      }
      vscode.postMessage({
        type: command,
        query,
        index: Number.isFinite(index) ? index : undefined
      });
    });
  </script>
</body>
</html>`,
    state.nonce
  );
}

export function buildComponentDetailsHtml(
  result: ComponentSearchResult,
  options: { nonce: string; cspSource: string }
): string {
  return injectWebviewLocalization(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource} data:; style-src 'nonce-${options.nonce}'; script-src 'nonce-${options.nonce}';">
  <title>KiCad Component Details</title>
  <style nonce="${options.nonce}">
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
    button:focus-visible {
      outline: 2px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 2px;
    }
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
  <script nonce="${options.nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('datasheet').addEventListener('click', () => vscode.postMessage({ type: 'datasheet', url: ${JSON.stringify(result.datasheetUrl ?? '')} }));
    document.getElementById('copy').addEventListener('click', () => vscode.postMessage({ type: 'copy-mpn', mpn: ${JSON.stringify(result.mpn)} }));
    document.getElementById('pcm-install')?.addEventListener('click', () => vscode.postMessage({ type: 'pcm-install' }));
  </script>
</body>
</html>`,
    options.nonce
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function searchPill(
  label: string,
  query: string,
  detail?: string | undefined
): string {
  const title = detail ? ` title="${escapeHtml(detail)}"` : '';
  return `<button type="button" class="pill" data-command="use-query" data-query="${escapeHtml(query)}"${title}>
    <span class="pill-label">${escapeHtml(label)}</span>
  </button>`;
}

function resultRow(result: ComponentSearchViewResult, index: number): string {
  const label =
    result.result.mpn ||
    result.result.lcscPartNumber ||
    result.result.description;
  const datasheetButton = result.result.datasheetUrl
    ? `<button type="button" data-command="datasheet" data-index="${index}">Open Datasheet</button>`
    : '';
  const pcmButton = result.result.pcmPackageId
    ? `<button type="button" data-command="pcm-install" data-index="${index}">Install PCM Library</button>`
    : '';
  return `<li class="result">
    <div class="result-title">
      <strong>${escapeHtml(label)}</strong>
      <span class="source">${escapeHtml(result.result.source)}</span>
    </div>
    <p class="result-description">${escapeHtml(result.result.description)}</p>
    <dl>
      <dt>Manufacturer</dt>
      <dd>${escapeHtml(result.result.manufacturer || 'Unknown')}</dd>
      <dt>Availability</dt>
      <dd>${escapeHtml(result.availability)}</dd>
      <dt>Footprint match</dt>
      <dd>${escapeHtml(result.footprintMatch)}</dd>
      <dt>Datasheet</dt>
      <dd>${escapeHtml(result.datasheet)}</dd>
      <dt>Confidence</dt>
      <dd>${escapeHtml(result.confidence)}</dd>
    </dl>
    <div class="result-actions">
      <button type="button" data-command="open-result" data-index="${index}">Details</button>
      <button type="button" data-command="copy-mpn" data-index="${index}">Copy MPN</button>
      ${datasheetButton}
      ${pcmButton}
    </div>
  </li>`;
}

function formatAvailability(result: ComponentSearchResult): string {
  const totalInventory = result.offers.reduce(
    (total, offer) => total + (offer.inventoryLevel ?? 0),
    0
  );
  if (totalInventory > 0) {
    const count = new Intl.NumberFormat(vscode.env.language || 'en').format(
      totalInventory
    );
    return vscode.l10n.t({
      message: '{count} in stock',
      args: { count },
      comment: 'Component availability count shown in search results.'
    });
  }
  return result.offers.length
    ? vscode.l10n.t('Stock not reported')
    : vscode.l10n.t('No availability data');
}

function formatFootprintMatch(result: ComponentSearchResult): string {
  const footprint = result.specs.find((spec) =>
    /footprint|package|case/iu.test(spec.name)
  );
  return footprint?.value || result.category || vscode.l10n.t('Not reported');
}

function estimateConfidence(
  result: ComponentSearchResult,
  query: string
): string {
  const normalizedQuery = query.trim().toLowerCase();
  const identifiers = [result.mpn, result.lcscPartNumber]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());
  if (
    identifiers.some(
      (identifier) =>
        identifier === normalizedQuery ||
        identifier.includes(normalizedQuery) ||
        normalizedQuery.includes(identifier)
    )
  ) {
    return 'High';
  }
  if (result.source === 'local') {
    return 'High';
  }
  const searchable = [
    result.description,
    result.manufacturer,
    result.category,
    ...result.specs.map((spec) => `${spec.name} ${spec.value}`)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const tokens = normalizedQuery
    .split(/\s+/u)
    .filter((token) => token.length > 2);
  const matchedTokens = tokens.filter((token) => searchable.includes(token));
  if (matchedTokens.length >= Math.max(1, Math.ceil(tokens.length / 2))) {
    return 'Medium';
  }
  return 'Low';
}

function compactFootprint(footprint: string): string {
  if (!footprint) {
    return '';
  }
  const parts = footprint.split(':');
  return parts.at(-1) ?? footprint;
}
