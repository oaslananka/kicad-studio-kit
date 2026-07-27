import type { ComponentSearchResult } from '../../src/types';
import {
  searchComponentProviders,
  type ComponentSearchProviderAdapters,
  type ComponentSearchSource
} from '../../src/components/componentSearchProviders';

function result(
  source: ComponentSearchResult['source'],
  mpn: string
): ComponentSearchResult {
  return {
    source,
    mpn,
    manufacturer: source,
    description: mpn,
    offers: [],
    specs: []
  };
}

function adapters(
  overrides: Partial<ComponentSearchProviderAdapters> = {}
): ComponentSearchProviderAdapters {
  return {
    octopart: { search: jest.fn().mockResolvedValue([]) },
    lcsc: { search: jest.fn().mockResolvedValue([]) },
    cache: {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined)
    },
    buildCacheKey: (query, source) => `${source}:${query.trim().toLowerCase()}`,
    lcscEnabled: true,
    onOctopartFailure: jest.fn(),
    searchLocal: jest.fn().mockResolvedValue([]),
    searchPcm: jest.fn().mockResolvedValue([]),
    ...overrides
  };
}

function provider(
  adaptersValue: ComponentSearchProviderAdapters,
  source: ComponentSearchSource
) {
  return source === 'octopart' ? adaptersValue.octopart : adaptersValue.lcsc;
}

describe('Component Search provider coordinator', () => {
  it('returns cached results without invoking the provider or fallbacks', async () => {
    const cached = [result('octopart', 'STM32')];
    const value = adapters({
      cache: {
        get: jest.fn().mockResolvedValue(cached),
        set: jest.fn()
      }
    });

    await expect(
      searchComponentProviders(' STM32 ', ['octopart'], value)
    ).resolves.toEqual(cached);
    expect(value.cache.get).toHaveBeenCalledWith('octopart:stm32');
    expect(value.octopart.search).not.toHaveBeenCalled();
    expect(value.searchLocal).not.toHaveBeenCalled();
    expect(value.searchPcm).not.toHaveBeenCalled();
  });

  it('uses Octopart and LCSC as the default source order', async () => {
    const octopartResults = [result('octopart', 'OPA192')];
    const lcscResults = [result('lcsc', 'C1234')];
    const value = adapters({
      octopart: { search: jest.fn().mockResolvedValue(octopartResults) },
      lcsc: { search: jest.fn().mockResolvedValue(lcscResults) }
    });

    await expect(
      searchComponentProviders('op amp', undefined, value)
    ).resolves.toEqual([...octopartResults, ...lcscResults]);
    const octopartOrder = (value.octopart.search as jest.Mock).mock
      .invocationCallOrder[0];
    const lcscOrder = (value.lcsc.search as jest.Mock).mock
      .invocationCallOrder[0];
    expect(octopartOrder).toBeLessThan(lcscOrder!);
  });

  it('queries selected providers in order, caches results, and skips fallbacks', async () => {
    const octopartResults = [result('octopart', 'OPA192')];
    const lcscResults = [result('lcsc', 'C1234')];
    const value = adapters({
      octopart: { search: jest.fn().mockResolvedValue(octopartResults) },
      lcsc: { search: jest.fn().mockResolvedValue(lcscResults) }
    });

    await expect(
      searchComponentProviders('op amp', ['octopart', 'lcsc'], value)
    ).resolves.toEqual([...octopartResults, ...lcscResults]);
    expect(value.cache.set).toHaveBeenNthCalledWith(
      1,
      'octopart:op amp',
      octopartResults,
      'octopart',
      'op amp'
    );
    expect(value.cache.set).toHaveBeenNthCalledWith(
      2,
      'lcsc:op amp',
      lcscResults,
      'lcsc',
      'op amp'
    );
    expect(value.searchLocal).not.toHaveBeenCalled();
    expect(value.searchPcm).not.toHaveBeenCalled();
  });

  it('warns for Octopart Error failures and falls back to enabled LCSC', async () => {
    const lcscResults = [result('lcsc', 'C9865')];
    const value = adapters({
      octopart: { search: jest.fn().mockRejectedValue(new Error('offline')) },
      lcsc: { search: jest.fn().mockResolvedValue(lcscResults) }
    });

    await expect(
      searchComponentProviders('10uF', ['octopart'], value)
    ).resolves.toEqual(lcscResults);
    expect(value.onOctopartFailure).toHaveBeenCalledWith('offline');
    expect(value.lcsc.search).toHaveBeenCalledTimes(1);
  });

  it('formats non-Error Octopart failures and uses local then PCM fallbacks', async () => {
    const pcmResults = [result('local', 'PCM package')];
    const value = adapters({
      octopart: { search: jest.fn().mockRejectedValue('network unavailable') },
      lcscEnabled: false,
      searchLocal: jest.fn().mockResolvedValue([]),
      searchPcm: jest.fn().mockResolvedValue(pcmResults)
    });

    await expect(
      searchComponentProviders('sensor', ['octopart'], value)
    ).resolves.toEqual(pcmResults);
    expect(value.onOctopartFailure).toHaveBeenCalledWith('network unavailable');
    expect(value.lcsc.search).not.toHaveBeenCalled();
    expect(value.searchLocal).toHaveBeenCalledWith('sensor');
    expect(value.searchPcm).toHaveBeenCalledWith('sensor');
  });

  it('returns local results without consulting PCM', async () => {
    const localResults = [result('local', 'Device:R')];
    const value = adapters({
      lcscEnabled: false,
      searchLocal: jest.fn().mockResolvedValue(localResults)
    });

    await expect(searchComponentProviders('R', [], value)).resolves.toEqual(
      localResults
    );
    expect(value.searchPcm).not.toHaveBeenCalled();
  });

  it('keeps LCSC failures silent and preserves the duplicate enabled retry', async () => {
    const value = adapters({
      octopart: { search: jest.fn().mockResolvedValue([]) },
      lcsc: { search: jest.fn().mockRejectedValue(new Error('lcsc offline')) }
    });

    await expect(
      searchComponentProviders('missing', ['octopart', 'lcsc'], value)
    ).resolves.toEqual([]);
    expect(value.lcsc.search).toHaveBeenCalledTimes(2);
    expect(value.onOctopartFailure).not.toHaveBeenCalled();
    expect(value.searchLocal).toHaveBeenCalled();
    expect(value.searchPcm).toHaveBeenCalled();
  });

  it('treats provider cache-write failures like provider failures', async () => {
    const value = adapters({
      octopart: {
        search: jest.fn().mockResolvedValue([result('octopart', 'TPS5430')])
      },
      cache: {
        get: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockRejectedValue(new Error('cache write failed'))
      },
      lcscEnabled: false
    });

    await expect(
      searchComponentProviders('TPS5430', ['octopart'], value)
    ).resolves.toEqual([]);
    expect(value.onOctopartFailure).toHaveBeenCalledWith('cache write failed');
  });

  it('propagates cache-read failures before provider error handling', async () => {
    const value = adapters({
      cache: {
        get: jest.fn().mockRejectedValue(new Error('cache read failed')),
        set: jest.fn()
      }
    });

    await expect(
      searchComponentProviders('TPS5430', ['octopart'], value)
    ).rejects.toThrow('cache read failed');
    expect(provider(value, 'octopart').search).not.toHaveBeenCalled();
    expect(value.onOctopartFailure).not.toHaveBeenCalled();
  });
});
