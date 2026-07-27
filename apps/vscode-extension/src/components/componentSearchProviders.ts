import type { ComponentSearchResult } from '../types';

export type ComponentSearchSource = 'octopart' | 'lcsc';

export interface ComponentSearchRemoteProvider {
  search(query: string): Promise<ComponentSearchResult[]>;
}

export interface ComponentSearchCacheAdapter {
  get(key: string): Promise<ComponentSearchResult[] | undefined>;
  set(
    key: string,
    results: ComponentSearchResult[],
    source: ComponentSearchSource,
    query: string
  ): Promise<void>;
}

export interface ComponentSearchProviderAdapters {
  octopart: ComponentSearchRemoteProvider;
  lcsc: ComponentSearchRemoteProvider;
  cache: ComponentSearchCacheAdapter;
  buildCacheKey(query: string, source: ComponentSearchSource): string;
  lcscEnabled: boolean;
  onOctopartFailure(message: string): void;
  searchLocal(query: string): Promise<ComponentSearchResult[]>;
  searchPcm(query: string): Promise<ComponentSearchResult[]>;
}

export async function searchComponentProviders(
  query: string,
  sources: readonly ComponentSearchSource[] = ['octopart', 'lcsc'],
  adapters: ComponentSearchProviderAdapters
): Promise<ComponentSearchResult[]> {
  const results: ComponentSearchResult[] = [];
  const selectedSources = new Set(sources);

  if (selectedSources.has('octopart')) {
    results.push(...(await searchRemote('octopart', query, adapters)));
  }
  if (selectedSources.has('lcsc')) {
    results.push(...(await searchRemote('lcsc', query, adapters)));
  }
  if (
    !results.length &&
    selectedSources.has('octopart') &&
    adapters.lcscEnabled
  ) {
    results.push(...(await searchRemote('lcsc', query, adapters)));
  }
  if (!results.length) {
    results.push(...(await adapters.searchLocal(query)));
  }
  if (!results.length) {
    results.push(...(await adapters.searchPcm(query)));
  }

  return results;
}

async function searchRemote(
  source: ComponentSearchSource,
  query: string,
  adapters: ComponentSearchProviderAdapters
): Promise<ComponentSearchResult[]> {
  const key = adapters.buildCacheKey(query, source);
  const cached = await adapters.cache.get(key);
  if (cached) {
    return cached;
  }

  try {
    const provider = source === 'octopart' ? adapters.octopart : adapters.lcsc;
    const results = await provider.search(query);
    await adapters.cache.set(key, results, source, query);
    return results;
  } catch (error) {
    if (source === 'octopart') {
      adapters.onOctopartFailure(
        error instanceof Error ? error.message : String(error)
      );
    }
    return [];
  }
}
