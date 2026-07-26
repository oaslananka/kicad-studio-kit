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
import {
  buildComponentDetailsHtml,
  buildComponentSearchViewHtml,
  type ComponentSearchProjectContext,
  type ComponentSearchProviderChip,
  type ComponentSearchRecommendation,
  type ComponentSearchViewResult,
  type ComponentSearchViewState
} from './componentSearchView';
export {
  buildComponentDetailsHtml,
  buildComponentSearchViewHtml,
  type ComponentSearchProjectContext,
  type ComponentSearchProviderChip,
  type ComponentSearchRecommendation,
  type ComponentSearchViewResult,
  type ComponentSearchViewState
} from './componentSearchView';
import type { KiCadLibraryIndexer } from '../library/libraryIndexer';
import type { PcmService } from '../library/pcmService';

type ComponentSearchSource = 'octopart' | 'lcsc';
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
