import * as vscode from 'vscode';
import type { ComponentSearchResult } from '../types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_PREFIX = 'kicadstudio.search.cache.';
const MAX_CACHE_ENTRIES = 100;

interface CacheEntry {
  results: ComponentSearchResult[];
  timestamp: number;
  query: string;
  source: string;
}

/**
 * Small TTL cache for remote component search results.
 */
export class ComponentSearchCache {
  constructor(private readonly storage: vscode.Memento) {}

  async get(key: string): Promise<ComponentSearchResult[] | undefined> {
    const entry = this.storage.get<CacheEntry>(CACHE_PREFIX + key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      await this.storage.update(CACHE_PREFIX + key, undefined);
      return undefined;
    }
    return entry.results;
  }

  async set(
    key: string,
    results: ComponentSearchResult[],
    source: string,
    query: string
  ): Promise<void> {
    await this.evictOldEntries();
    await this.storage.update(CACHE_PREFIX + key, {
      results,
      timestamp: Date.now(),
      query,
      source
    } satisfies CacheEntry);
  }

  static buildKey(query: string, source: string): string {
    return `${source}:${query.toLowerCase().trim()}`;
  }

  private async evictOldEntries(): Promise<void> {
    const keys =
      typeof this.storage.keys === 'function' ? this.storage.keys() : [];
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    if (cacheKeys.length < MAX_CACHE_ENTRIES) {
      return;
    }

    const entries = cacheKeys
      .map((key) => ({
        key,
        entry: this.storage.get<CacheEntry>(key)
      }))
      .filter((item): item is { key: string; entry: CacheEntry } =>
        Boolean(item.entry)
      )
      .sort((left, right) => left.entry.timestamp - right.entry.timestamp);

    const deleteCount = entries.length - MAX_CACHE_ENTRIES + 1;
    for (const item of entries.slice(0, deleteCount)) {
      await this.storage.update(item.key, undefined);
    }
  }
}
