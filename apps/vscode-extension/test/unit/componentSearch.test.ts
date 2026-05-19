import * as vscode from 'vscode';
import { ComponentSearchService } from '../../src/components/componentSearch';
import { ComponentSearchCache } from '../../src/components/componentSearchCache';
import { openDatasheet } from '../../src/components/datasheetOpener';
import { __setConfiguration, createExtensionContextMock } from './vscodeMock';

function createPanelMock() {
  let messageHandler: ((message: unknown) => Promise<void>) | undefined;
  let disposeHandler: (() => void) | undefined;
  const webview = {
    cspSource: 'vscode-resource:',
    html: '',
    onDidReceiveMessage: jest.fn(
      (callback: (message: unknown) => Promise<void>) => {
        messageHandler = callback;
        return { dispose: jest.fn() };
      }
    )
  };
  return {
    panel: {
      webview,
      title: '',
      onDidDispose: jest.fn((callback: () => void) => {
        disposeHandler = callback;
        return { dispose: jest.fn() };
      })
    },
    send: async (message: unknown) => messageHandler?.(message),
    dispose: () => disposeHandler?.()
  };
}

describe('ComponentSearchCache', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('caches Octopart results for TTL duration', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    await cache.set(
      'oct:stm32',
      [
        {
          source: 'octopart',
          mpn: 'STM32',
          manufacturer: 'ST',
          description: 'MCU',
          offers: [],
          specs: []
        }
      ],
      'octopart',
      'STM32'
    );
    await expect(cache.get('oct:stm32')).resolves.toHaveLength(1);
  });

  it('returns cached result without network call', async () => {
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const octopart = {
      search: jest.fn().mockResolvedValue([
        {
          source: 'octopart',
          mpn: 'STM32',
          manufacturer: 'ST',
          description: 'MCU',
          offers: [],
          specs: []
        }
      ])
    };
    const lcsc = { search: jest.fn() };
    const service = new ComponentSearchService(
      octopart as never,
      lcsc as never,
      cache
    );

    await (service as any).searchWithCache('octopart', 'STM32');
    await (service as any).searchWithCache('octopart', 'STM32');

    expect(octopart.search).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache after TTL expires', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    await cache.set(
      'oct:stm32',
      [
        {
          source: 'octopart',
          mpn: 'STM32',
          manufacturer: 'ST',
          description: 'MCU',
          offers: [],
          specs: []
        }
      ],
      'octopart',
      'STM32'
    );
    nowSpy.mockReturnValue(24 * 60 * 60 * 1000 + 2_000);
    await expect(cache.get('oct:stm32')).resolves.toBeUndefined();
  });

  it('evicts the oldest cache entry before adding a new one when full', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000);
    const context = createExtensionContextMock();
    const storage = context.globalState as unknown as vscode.Memento;
    const cache = new ComponentSearchCache(storage);
    const prefix = 'kicadstudio.search.cache.';

    for (let index = 0; index < 100; index += 1) {
      await storage.update(`${prefix}${index}`, {
        results: [],
        timestamp: index,
        query: `Q${index}`,
        source: 'octopart'
      });
    }

    await cache.set('new', [], 'octopart', 'New');

    expect(storage.get(`${prefix}0`)).toBeUndefined();
    expect(storage.get(`${prefix}1`)).toBeDefined();
    expect(storage.get(`${prefix}new`)).toBeDefined();
  });

  it('handles Octopart network error gracefully, falls back to LCSC', async () => {
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const octopart = {
      search: jest.fn().mockRejectedValue(new Error('network down'))
    };
    const lcscResult = [
      {
        source: 'lcsc',
        mpn: 'C1234',
        manufacturer: 'LCSC',
        description: 'Capacitor',
        offers: [],
        specs: []
      }
    ];
    const lcsc = { search: jest.fn().mockResolvedValue(lcscResult) };
    const service = new ComponentSearchService(
      octopart as never,
      lcsc as never,
      cache
    );

    (vscode.window.showQuickPick as jest.Mock)
      .mockResolvedValueOnce([
        { label: 'Octopart / Nexar', value: 'octopart' },
        { label: 'LCSC', value: 'lcsc' }
      ])
      .mockResolvedValueOnce(undefined);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('10uF 0603');

    await service.search();

    expect(octopart.search).toHaveBeenCalled();
    expect(lcsc.search).toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    const secondQuickPickArgs = (vscode.window.showQuickPick as jest.Mock).mock
      .calls[1]?.[0] as Array<{ description: string }>;
    expect(secondQuickPickArgs.at(0)?.description).toContain('lcsc');
  });

  it('returns early when the user cancels source selection or query entry', async () => {
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const octopart = { search: jest.fn() };
    const lcsc = { search: jest.fn() };
    const service = new ComponentSearchService(
      octopart as never,
      lcsc as never,
      cache
    );

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
    await service.search();

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce([
      { label: 'Octopart / Nexar', value: 'octopart' }
    ]);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(undefined);
    await service.search();

    expect(octopart.search).not.toHaveBeenCalled();
    expect(lcsc.search).not.toHaveBeenCalled();
  });

  it('does not fall back to LCSC when the setting is disabled', async () => {
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const octopart = {
      search: jest.fn().mockRejectedValue(new Error('network down'))
    };
    const lcsc = { search: jest.fn() };
    const service = new ComponentSearchService(
      octopart as never,
      lcsc as never,
      cache
    );

    __setConfiguration({
      'kicadstudio.componentSearch.enableLCSC': false
    });
    (vscode.window.showQuickPick as jest.Mock)
      .mockResolvedValueOnce([{ label: 'Octopart / Nexar', value: 'octopart' }])
      .mockResolvedValueOnce(undefined);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('STM32');

    await service.search();

    expect(octopart.search).toHaveBeenCalled();
    expect(lcsc.search).not.toHaveBeenCalled();
  });

  it('reuses the details panel and handles datasheet/copy actions', async () => {
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const panelMock = createPanelMock();
    const service = new ComponentSearchService(
      { search: jest.fn() } as never,
      { search: jest.fn() } as never,
      cache
    );
    const result = {
      source: 'octopart' as const,
      mpn: 'STM32F411',
      manufacturer: 'ST',
      description: 'MCU',
      datasheetUrl: 'https://example.com/datasheet.pdf',
      offers: [],
      specs: []
    };

    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );

    await (service as any).showDetails(result);
    await (service as any).showDetails(result);
    await panelMock.send({ type: 'copy-mpn', mpn: 'STM32F411' });
    await panelMock.send({
      type: 'datasheet',
      url: 'https://example.com/datasheet.pdf'
    });

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('STM32F411');
    expect(vscode.env.openExternal).toHaveBeenCalled();
    expect(panelMock.panel.title).toContain('STM32F411');
    expect(panelMock.panel.webview.html).toContain('Open Datasheet');
    expect(panelMock.panel.webview.html).toContain(
      'img-src vscode-resource: data:;'
    );
    expect(panelMock.panel.webview.html).not.toContain('img-src https:');

    panelMock.dispose();
    await (service as any).showDetails(result);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it('rejects non-http datasheet URLs before opening externally', async () => {
    jest.clearAllMocks();

    await openDatasheet('javascript:alert(1)');
    await openDatasheet('not a url');
    await openDatasheet('https://example.com/datasheet.pdf');

    expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
    expect(vscode.env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: 'https://example.com/datasheet.pdf' })
    );
    expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(2);
  });

  it('falls back to LCSC when Octopart returns no results', async () => {
    __setConfiguration({
      'kicadstudio.componentSearch.enableLCSC': true
    });
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const octopart = { search: jest.fn().mockResolvedValue([]) };
    const lcscResult = [
      {
        source: 'lcsc',
        mpn: 'C2040',
        manufacturer: 'LCSC',
        description: 'Capacitor',
        offers: [],
        specs: []
      }
    ];
    const lcsc = { search: jest.fn().mockResolvedValue(lcscResult) };
    const service = new ComponentSearchService(
      octopart as never,
      lcsc as never,
      cache
    );

    (vscode.window.showQuickPick as jest.Mock)
      .mockResolvedValueOnce([{ label: 'Octopart / Nexar', value: 'octopart' }])
      .mockResolvedValueOnce(undefined);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('22uF 0805');

    await service.search();

    expect(octopart.search).toHaveBeenCalledWith('22uF 0805');
    expect(lcsc.search).toHaveBeenCalledWith('22uF 0805');
    const secondQuickPickArgs = (vscode.window.showQuickPick as jest.Mock).mock
      .calls[1]?.[0] as Array<{ description: string }>;
    expect(secondQuickPickArgs.at(0)?.description).toContain('lcsc');
  });

  it('opens the details view when the user picks a result', async () => {
    __setConfiguration({
      'kicadstudio.componentSearch.enableLCSC': true
    });
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const panelMock = createPanelMock();
    const octopartResult = [
      {
        source: 'octopart',
        mpn: 'STM32G0',
        manufacturer: 'ST',
        description: 'MCU',
        offers: [],
        specs: []
      }
    ];
    const octopart = { search: jest.fn().mockResolvedValue(octopartResult) };
    const lcsc = { search: jest.fn() };
    const service = new ComponentSearchService(
      octopart as never,
      lcsc as never,
      cache
    );

    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );
    (vscode.window.showQuickPick as jest.Mock)
      .mockResolvedValueOnce([{ label: 'Octopart / Nexar', value: 'octopart' }])
      .mockResolvedValueOnce({
        label: 'STM32G0',
        description: 'ST • octopart',
        detail: 'MCU',
        result: octopartResult[0]
      });
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('STM32G0');

    await service.search();

    expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    expect(panelMock.panel.webview.html).toContain('STM32G0');
  });

  it('supports programmatic component queries for language model tools', async () => {
    __setConfiguration({
      'kicadstudio.componentSearch.enableLCSC': true
    });
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const octopart = {
      search: jest.fn().mockResolvedValue([
        {
          source: 'octopart',
          mpn: 'TPS5430',
          manufacturer: 'TI',
          description: 'Buck regulator',
          offers: [],
          specs: []
        }
      ])
    };
    const lcsc = { search: jest.fn().mockResolvedValue([]) };
    const service = new ComponentSearchService(
      octopart as never,
      lcsc as never,
      cache
    );

    const results = await service.searchQuery('TPS5430', ['octopart']);

    expect(results).toHaveLength(1);
    expect(octopart.search).toHaveBeenCalledWith('TPS5430');
    expect(lcsc.search).not.toHaveBeenCalled();
  });

  it('falls back to the local library index when online sources are unavailable', async () => {
    __setConfiguration({
      'kicadstudio.componentSearch.enableLCSC': true
    });
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const octopart = {
      search: jest.fn().mockRejectedValue(new Error('offline'))
    };
    const lcsc = { search: jest.fn().mockRejectedValue(new Error('offline')) };
    const libraryIndexer = {
      isIndexed: jest.fn().mockReturnValue(true),
      isStale: jest.fn().mockReturnValue(false),
      searchSymbols: jest.fn().mockReturnValue([
        {
          name: 'TPS5430',
          libraryName: 'Regulator_Switching',
          description: 'Buck regulator',
          keywords: ['buck'],
          footprintFilters: ['SOIC*']
        }
      ]),
      searchFootprints: jest.fn().mockReturnValue([])
    };
    const service = new ComponentSearchService(
      octopart as never,
      lcsc as never,
      cache,
      libraryIndexer as never
    );

    const results = await service.searchQuery('TPS5430', ['octopart', 'lcsc']);

    expect(results).toEqual([
      expect.objectContaining({
        source: 'local',
        mpn: 'TPS5430',
        manufacturer: 'Local KiCad Library'
      })
    ]);
  });

  it('indexes stale local libraries and includes footprint fallback results', async () => {
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const libraryIndexer = {
      isIndexed: jest.fn().mockReturnValue(true),
      isStale: jest.fn().mockReturnValue(true),
      indexAll: jest.fn().mockResolvedValue(undefined),
      searchSymbols: jest.fn().mockReturnValue([]),
      searchFootprints: jest.fn().mockReturnValue([
        {
          name: 'Connector_PinHeader_1x02',
          libraryName: 'Connector_PinHeader_2.54mm',
          description: '',
          tags: ['pin-header', 'through-hole']
        }
      ])
    };
    const service = new ComponentSearchService(
      { search: jest.fn().mockResolvedValue([]) } as never,
      { search: jest.fn().mockResolvedValue([]) } as never,
      cache,
      libraryIndexer as never
    );

    const results = await service.searchQuery('pin header', []);

    expect(libraryIndexer.indexAll).toHaveBeenCalled();
    expect(results).toEqual([
      expect.objectContaining({
        source: 'local',
        mpn: 'Connector_PinHeader_1x02',
        description: 'Connector_PinHeader_1x02',
        specs: [
          { name: 'Tag', value: 'pin-header' },
          { name: 'Tag', value: 'through-hole' }
        ]
      })
    ]);
  });

  it('returns no local fallback results when library indexing fails', async () => {
    const context = createExtensionContextMock();
    const cache = new ComponentSearchCache(
      context.globalState as unknown as vscode.Memento
    );
    const service = new ComponentSearchService(
      { search: jest.fn().mockResolvedValue([]) } as never,
      { search: jest.fn().mockResolvedValue([]) } as never,
      cache,
      {
        isIndexed: jest.fn().mockReturnValue(false),
        isStale: jest.fn(),
        indexAll: jest.fn().mockRejectedValue(new Error('index failed')),
        searchSymbols: jest.fn(),
        searchFootprints: jest.fn()
      } as never
    );

    await expect(service.searchQuery('pin header', [])).resolves.toEqual([]);
  });
});
