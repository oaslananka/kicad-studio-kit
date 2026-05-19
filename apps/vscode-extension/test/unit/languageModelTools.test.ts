import * as vscode from 'vscode';
import { registerLanguageModelTools } from '../../src/lm/languageModelTools';
import {
  __setConfiguration,
  createExtensionContextMock,
  lm,
  workspace,
  window
} from './vscodeMock';

interface RegisteredTool {
  invoke(
    options: { input: Record<string, unknown> },
    token: vscode.CancellationToken
  ): Promise<unknown>;
}

interface RegisteredPreparedTool extends RegisteredTool {
  prepareInvocation?(
    options: { input: Record<string, unknown> },
    token: vscode.CancellationToken
  ): Promise<Record<string, unknown> | undefined>;
}

describe('language model tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (lm.registerTool as jest.Mock).mockImplementation(() => ({
      dispose: jest.fn()
    }));
    __setConfiguration({
      'kicadstudio.ai.allowTools': true,
      'kicadstudio.defaultOutputDir': 'fab'
    });
  });

  it('registers KiCad Studio language model tools when enabled', () => {
    registerLanguageModelTools(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      {
        logger: { debug: jest.fn() } as never,
        checkService: { runDRC: jest.fn(), runERC: jest.fn() } as never,
        cliDetector: { detect: jest.fn() } as never,
        cliRunner: { run: jest.fn() } as never,
        componentSearch: { searchQuery: jest.fn() } as never,
        libraryIndexer: {
          isIndexed: jest.fn().mockReturnValue(true),
          isStale: jest.fn().mockReturnValue(false),
          searchSymbols: jest.fn().mockReturnValue([]),
          searchFootprints: jest.fn().mockReturnValue([])
        } as never,
        variantProvider: {
          getActiveVariantName: jest.fn(),
          listVariants: jest.fn().mockResolvedValue([]),
          getVariantByName: jest.fn(),
          setActive: jest.fn()
        } as never,
        diagnosticsCollection: { set: jest.fn() } as never,
        getStudioContext: jest.fn().mockResolvedValue({
          activeFile: '/workspace/sample.kicad_pcb',
          fileType: 'pcb',
          drcErrors: []
        }),
        setLatestDrcRun: jest.fn()
      }
    );

    const names = (lm.registerTool as jest.Mock).mock.calls.map(
      (call) => call[0]
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'kicadstudio_runDrc',
        'kicadstudio_runErc',
        'kicadstudio_exportGerbers',
        'kicadstudio_openFile',
        'kicadstudio_searchComponent',
        'kicadstudio_searchSymbol',
        'kicadstudio_searchFootprint',
        'kicadstudio_getActiveContext',
        'kicadstudio_listVariants',
        'kicadstudio_switchVariant'
      ])
    );
  });

  it('skips registration when the feature is disabled or the VS Code API is unavailable', () => {
    const logger = { debug: jest.fn() };
    __setConfiguration({
      'kicadstudio.ai.allowTools': false
    });

    registerLanguageModelTools(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      {
        logger: logger as never,
        checkService: { runDRC: jest.fn(), runERC: jest.fn() } as never,
        cliDetector: { detect: jest.fn() } as never,
        cliRunner: { run: jest.fn() } as never,
        componentSearch: { searchQuery: jest.fn() } as never,
        libraryIndexer: {
          isIndexed: jest.fn().mockReturnValue(true),
          isStale: jest.fn().mockReturnValue(false),
          searchSymbols: jest.fn().mockReturnValue([]),
          searchFootprints: jest.fn().mockReturnValue([])
        } as never,
        variantProvider: {
          getActiveVariantName: jest.fn(),
          listVariants: jest.fn().mockResolvedValue([]),
          getVariantByName: jest.fn(),
          setActive: jest.fn()
        } as never,
        diagnosticsCollection: { set: jest.fn() } as never,
        getStudioContext: jest.fn().mockResolvedValue({
          activeFile: undefined,
          fileType: 'other',
          drcErrors: []
        }),
        setLatestDrcRun: jest.fn()
      }
    );

    expect(lm.registerTool).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Language model tools are disabled by configuration.'
    );

    const originalRegisterTool = lm.registerTool;
    (lm as { registerTool?: unknown }).registerTool = undefined;
    __setConfiguration({
      'kicadstudio.ai.allowTools': true
    });
    registerLanguageModelTools(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      {
        logger: logger as never,
        checkService: { runDRC: jest.fn(), runERC: jest.fn() } as never,
        cliDetector: { detect: jest.fn() } as never,
        cliRunner: { run: jest.fn() } as never,
        componentSearch: { searchQuery: jest.fn() } as never,
        libraryIndexer: {
          isIndexed: jest.fn().mockReturnValue(true),
          isStale: jest.fn().mockReturnValue(false),
          searchSymbols: jest.fn().mockReturnValue([]),
          searchFootprints: jest.fn().mockReturnValue([])
        } as never,
        variantProvider: {
          getActiveVariantName: jest.fn(),
          listVariants: jest.fn().mockResolvedValue([]),
          getVariantByName: jest.fn(),
          setActive: jest.fn()
        } as never,
        diagnosticsCollection: { set: jest.fn() } as never,
        getStudioContext: jest.fn().mockResolvedValue({
          activeFile: undefined,
          fileType: 'other',
          drcErrors: []
        }),
        setLatestDrcRun: jest.fn()
      }
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'VS Code language model tool API is unavailable on this host.'
    );
    (lm as { registerTool?: unknown }).registerTool = originalRegisterTool;
  });

  it('disposes registered tools when the controller is disposed', () => {
    const disposables = [jest.fn(), jest.fn()];
    (lm.registerTool as jest.Mock)
      .mockReturnValueOnce({ dispose: disposables[0] })
      .mockReturnValue({ dispose: disposables[1] });

    const disposable = registerLanguageModelTools(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      {
        logger: { debug: jest.fn() } as never,
        checkService: { runDRC: jest.fn(), runERC: jest.fn() } as never,
        cliDetector: { detect: jest.fn() } as never,
        cliRunner: { run: jest.fn() } as never,
        componentSearch: { searchQuery: jest.fn() } as never,
        libraryIndexer: {
          isIndexed: jest.fn().mockReturnValue(true),
          isStale: jest.fn().mockReturnValue(false),
          searchSymbols: jest.fn().mockReturnValue([]),
          searchFootprints: jest.fn().mockReturnValue([])
        } as never,
        variantProvider: {
          getActiveVariantName: jest.fn(),
          listVariants: jest.fn().mockResolvedValue([]),
          getVariantByName: jest.fn(),
          setActive: jest.fn()
        } as never,
        diagnosticsCollection: { set: jest.fn() } as never,
        getStudioContext: jest.fn().mockResolvedValue({
          activeFile: undefined,
          fileType: 'other',
          drcErrors: []
        }),
        setLatestDrcRun: jest.fn()
      }
    );

    disposable.dispose();

    expect(disposables[0]).toHaveBeenCalled();
    expect(disposables[1]).toHaveBeenCalled();
  });

  it('invokes DRC, search, context, and variant tools with structured results', async () => {
    const diagnostics = [
      new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 10),
        'Clearance violation',
        0
      )
    ];
    const variantProvider = {
      getActiveVariantName: jest.fn().mockResolvedValue('Assembly-A'),
      listVariants: jest.fn().mockResolvedValue([
        { name: 'Assembly-A', isDefault: true, componentOverrides: [] },
        { name: 'Assembly-B', isDefault: false, componentOverrides: [] }
      ]),
      getVariantByName: jest.fn().mockResolvedValue({
        name: 'Assembly-B',
        isDefault: false,
        componentOverrides: []
      }),
      setActive: jest.fn().mockResolvedValue(undefined)
    };
    const checkService = {
      runDRC: jest.fn().mockResolvedValue({
        diagnostics,
        summary: {
          file: '/workspace/sample.kicad_pcb',
          errors: 1,
          warnings: 0,
          infos: 0,
          source: 'drc'
        }
      }),
      runERC: jest.fn().mockResolvedValue({
        diagnostics: [],
        summary: {
          file: '/workspace/sample.kicad_sch',
          errors: 0,
          warnings: 0,
          infos: 0,
          source: 'erc'
        }
      })
    };
    const services = {
      logger: { debug: jest.fn() } as never,
      checkService: checkService as never,
      cliDetector: {
        detect: jest.fn().mockResolvedValue({ version: '10.0.1' })
      } as never,
      cliRunner: { run: jest.fn().mockResolvedValue({}) } as never,
      componentSearch: {
        searchQuery: jest.fn().mockResolvedValue([
          {
            source: 'octopart',
            mpn: 'STM32F4',
            manufacturer: 'ST',
            description: 'MCU',
            offers: [],
            specs: []
          }
        ])
      } as never,
      libraryIndexer: {
        isIndexed: jest.fn().mockReturnValue(true),
        isStale: jest.fn().mockReturnValue(false),
        searchSymbols: jest
          .fn()
          .mockReturnValue([{ name: 'STM32', description: 'MCU' }]),
        searchFootprints: jest
          .fn()
          .mockReturnValue([{ name: 'QFN-48', description: 'Package' }])
      } as never,
      variantProvider: variantProvider as never,
      diagnosticsCollection: { set: jest.fn() } as never,
      getStudioContext: jest.fn().mockResolvedValue({
        activeFile: '/workspace/sample.kicad_pcb',
        fileType: 'pcb',
        drcErrors: ['Clearance violation']
      }),
      setLatestDrcRun: jest.fn()
    };

    registerLanguageModelTools(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      services
    );
    const registrations = new Map<string, RegisteredTool>(
      (lm.registerTool as jest.Mock).mock.calls.map((call) => [
        call[0] as string,
        call[1] as RegisteredTool
      ])
    );

    const drcResult = (await registrations
      .get('kicadstudio_runDrc')
      ?.invoke(
        { input: { pcbPath: '/workspace/sample.kicad_pcb' } },
        {} as vscode.CancellationToken
      )) as { content: Array<{ value: string }> };
    const searchResult = (await registrations
      .get('kicadstudio_searchComponent')
      ?.invoke(
        { input: { query: 'STM32F4' } },
        {} as vscode.CancellationToken
      )) as {
      content: Array<{ value: string }>;
    };
    const contextResult = (await registrations
      .get('kicadstudio_getActiveContext')
      ?.invoke({ input: {} }, {} as vscode.CancellationToken)) as {
      content: Array<{ value: string }>;
    };
    await registrations
      .get('kicadstudio_switchVariant')
      ?.invoke(
        { input: { variant: 'Assembly-B' } },
        {} as vscode.CancellationToken
      );

    expect(drcResult.content[0]).toEqual(
      expect.objectContaining({
        value: expect.stringContaining('DRC completed')
      })
    );
    expect(searchResult.content[0]).toEqual(
      expect.objectContaining({
        value: expect.stringContaining('Found 1 component matches')
      })
    );
    expect(contextResult.content[1]).toEqual(
      expect.objectContaining({
        value: expect.stringContaining('sample.kicad_pcb')
      })
    );
    expect(variantProvider.setActive).toHaveBeenCalled();
  });

  it('opens files and exports gerbers through the registered tools', async () => {
    const cliRunner = { run: jest.fn().mockResolvedValue({}) };
    const variantProvider = {
      getActiveVariantName: jest.fn().mockResolvedValue('Assembly-A'),
      listVariants: jest.fn().mockResolvedValue([]),
      getVariantByName: jest.fn(),
      setActive: jest.fn()
    };
    registerLanguageModelTools(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      {
        logger: { debug: jest.fn() } as never,
        checkService: { runDRC: jest.fn(), runERC: jest.fn() } as never,
        cliDetector: {
          detect: jest.fn().mockResolvedValue({ version: '10.0.0' })
        } as never,
        cliRunner: cliRunner as never,
        componentSearch: {
          searchQuery: jest.fn().mockResolvedValue([])
        } as never,
        libraryIndexer: {
          isIndexed: jest.fn().mockReturnValue(true),
          isStale: jest.fn().mockReturnValue(false),
          searchSymbols: jest.fn().mockReturnValue([]),
          searchFootprints: jest.fn().mockReturnValue([])
        } as never,
        variantProvider: variantProvider as never,
        diagnosticsCollection: { set: jest.fn() } as never,
        getStudioContext: jest.fn().mockResolvedValue({
          activeFile: '/workspace/sample.kicad_pcb',
          fileType: 'pcb',
          drcErrors: []
        }),
        setLatestDrcRun: jest.fn()
      }
    );

    const registrations = new Map<string, RegisteredTool>(
      (lm.registerTool as jest.Mock).mock.calls.map((call) => [
        call[0] as string,
        call[1] as RegisteredTool
      ])
    );
    (workspace.openTextDocument as jest.Mock).mockResolvedValue({
      uri: vscode.Uri.file('/workspace/readme.md')
    });

    await registrations
      .get('kicadstudio_openFile')
      ?.invoke(
        { input: { uri: '/workspace/readme.md' } },
        {} as vscode.CancellationToken
      );
    await registrations.get('kicadstudio_exportGerbers')?.invoke(
      {
        input: {
          pcbPath: '/workspace/sample.kicad_pcb',
          variant: 'Assembly-A'
        }
      },
      {
        isCancellationRequested: false
      } as vscode.CancellationToken
    );

    expect(workspace.openTextDocument).toHaveBeenCalled();
    expect(window.showTextDocument).toHaveBeenCalled();
    expect(cliRunner.run).toHaveBeenCalled();
    expect(variantProvider.getActiveVariantName).not.toHaveBeenCalled();
  });

  it('covers fallback and error branches for registered tools', async () => {
    const libraryIndexer = {
      isIndexed: jest.fn().mockReturnValue(false),
      isStale: jest.fn().mockReturnValue(true),
      indexAll: jest.fn().mockResolvedValue(undefined),
      searchSymbols: jest.fn().mockReturnValue([]),
      searchFootprints: jest.fn().mockReturnValue([])
    };
    const variantProvider = {
      getActiveVariantName: jest.fn().mockResolvedValue('Assembly-A'),
      listVariants: jest.fn().mockResolvedValue([]),
      getVariantByName: jest.fn().mockResolvedValue(undefined),
      setActive: jest.fn()
    };
    registerLanguageModelTools(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      {
        logger: { debug: jest.fn() } as never,
        checkService: {
          runDRC: jest.fn(),
          runERC: jest.fn().mockResolvedValue({
            diagnostics: [],
            summary: {
              file: '/workspace/sample.kicad_sch',
              errors: 0,
              warnings: 0,
              infos: 0,
              source: 'erc'
            }
          })
        } as never,
        cliDetector: {
          detect: jest.fn().mockResolvedValue({ version: '9.0.0' })
        } as never,
        cliRunner: { run: jest.fn().mockResolvedValue({}) } as never,
        componentSearch: {
          searchQuery: jest.fn().mockResolvedValue([])
        } as never,
        libraryIndexer: libraryIndexer as never,
        variantProvider: variantProvider as never,
        diagnosticsCollection: { set: jest.fn() } as never,
        getStudioContext: jest.fn().mockResolvedValue({
          activeFile: undefined,
          fileType: 'other',
          drcErrors: []
        }),
        setLatestDrcRun: jest.fn()
      }
    );

    const registrations = new Map<string, RegisteredTool>(
      (lm.registerTool as jest.Mock).mock.calls.map((call) => [
        call[0] as string,
        call[1] as RegisteredTool
      ])
    );
    (workspace.findFiles as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([vscode.Uri.file('/workspace/sample.kicad_sch')]);
    window.activeTextEditor = undefined;

    await expect(
      registrations
        .get('kicadstudio_runDrc')
        ?.invoke({ input: {} }, {} as vscode.CancellationToken)
    ).rejects.toThrow('No KiCad PCB file is available');
    await expect(
      registrations
        .get('kicadstudio_openFile')
        ?.invoke({ input: {} }, {} as vscode.CancellationToken)
    ).rejects.toThrow('The uri parameter is required.');
    await expect(
      registrations
        .get('kicadstudio_searchSymbol')
        ?.invoke({ input: { query: '' } }, {} as vscode.CancellationToken)
    ).rejects.toThrow('The query parameter is required.');
    await expect(
      registrations
        .get('kicadstudio_switchVariant')
        ?.invoke(
          { input: { variant: 'Missing' } },
          {} as vscode.CancellationToken
        )
    ).rejects.toThrow('Variant "Missing" was not found.');

    window.activeTextEditor = {
      document: {
        uri: vscode.Uri.file('/workspace/active.kicad_pcb')
      }
    } as never;

    const ercResult = (await registrations
      .get('kicadstudio_runErc')
      ?.invoke({ input: {} }, {} as vscode.CancellationToken)) as {
      content: Array<{ value: string }>;
    };
    const symbolResult = (await registrations
      .get('kicadstudio_searchSymbol')
      ?.invoke(
        { input: { query: 'STM32' } },
        {} as vscode.CancellationToken
      )) as {
      content: Array<{ value: string }>;
    };
    const footprintResult = (await registrations
      .get('kicadstudio_searchFootprint')
      ?.invoke(
        { input: { query: 'QFN' } },
        {} as vscode.CancellationToken
      )) as {
      content: Array<{ value: string }>;
    };
    const variantResult = (await registrations
      .get('kicadstudio_listVariants')
      ?.invoke({ input: {} }, {} as vscode.CancellationToken)) as {
      content: Array<{ value: string }>;
    };
    await registrations
      .get('kicadstudio_openFile')
      ?.invoke(
        { input: { uri: 'https://example.com/file' } },
        {} as vscode.CancellationToken
      );
    await registrations
      .get('kicadstudio_exportGerbers')
      ?.invoke({ input: {} }, {
        isCancellationRequested: false
      } as vscode.CancellationToken);

    expect(ercResult.content[0]).toEqual(
      expect.objectContaining({
        value: expect.stringContaining('ERC completed')
      })
    );
    expect(symbolResult.content[0]).toEqual(
      expect.objectContaining({
        value: expect.stringContaining('No symbol matches')
      })
    );
    expect(footprintResult.content[0]).toEqual(
      expect.objectContaining({
        value: expect.stringContaining('No footprint matches')
      })
    );
    expect(variantResult.content[0]).toEqual(
      expect.objectContaining({
        value: expect.stringContaining('No design variants')
      })
    );
    expect(libraryIndexer.indexAll).toHaveBeenCalled();
    expect(workspace.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: 'https://example.com/file' })
    );
  });

  it('covers tool preparation messages and validation branches', async () => {
    const variantProvider = {
      getActiveVariantName: jest.fn().mockResolvedValue(undefined),
      listVariants: jest
        .fn()
        .mockResolvedValue([
          { name: 'Assembly-A', isDefault: true, componentOverrides: [] }
        ]),
      getVariantByName: jest.fn().mockResolvedValue(undefined),
      setActive: jest.fn()
    };
    registerLanguageModelTools(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      {
        logger: { debug: jest.fn() } as never,
        checkService: { runDRC: jest.fn(), runERC: jest.fn() } as never,
        cliDetector: {
          detect: jest.fn().mockResolvedValue({ version: '10.0.0' })
        } as never,
        cliRunner: { run: jest.fn().mockResolvedValue({}) } as never,
        componentSearch: {
          searchQuery: jest.fn().mockResolvedValue([])
        } as never,
        libraryIndexer: {
          isIndexed: jest.fn().mockReturnValue(true),
          isStale: jest.fn().mockReturnValue(false),
          searchSymbols: jest.fn().mockReturnValue([]),
          searchFootprints: jest.fn().mockReturnValue([])
        } as never,
        variantProvider: variantProvider as never,
        diagnosticsCollection: { set: jest.fn() } as never,
        getStudioContext: jest.fn().mockResolvedValue({
          activeFile: undefined,
          fileType: 'other',
          drcErrors: []
        }),
        setLatestDrcRun: jest.fn()
      }
    );

    const registrations = new Map<string, RegisteredPreparedTool>(
      (lm.registerTool as jest.Mock).mock.calls.map((call) => [
        call[0] as string,
        call[1] as RegisteredPreparedTool
      ])
    );

    await expect(
      registrations
        .get('kicadstudio_searchComponent')
        ?.invoke({ input: { query: '' } }, {} as vscode.CancellationToken)
    ).rejects.toThrow('The query parameter is required.');
    await expect(
      registrations
        .get('kicadstudio_searchFootprint')
        ?.invoke({ input: { query: '' } }, {} as vscode.CancellationToken)
    ).rejects.toThrow('The query parameter is required.');
    await expect(
      registrations
        .get('kicadstudio_switchVariant')
        ?.invoke({ input: {} }, {} as vscode.CancellationToken)
    ).rejects.toThrow('The variant parameter is required.');

    const runDrcPreparation = await registrations
      .get('kicadstudio_runDrc')
      ?.prepareInvocation?.({ input: {} }, {} as vscode.CancellationToken);
    const runErcPreparation = await registrations
      .get('kicadstudio_runErc')
      ?.prepareInvocation?.({ input: {} }, {} as vscode.CancellationToken);
    const exportPreparation = await registrations
      .get('kicadstudio_exportGerbers')
      ?.prepareInvocation?.({ input: {} }, {} as vscode.CancellationToken);
    const openPreparation = await registrations
      .get('kicadstudio_openFile')
      ?.prepareInvocation?.({ input: {} }, {} as vscode.CancellationToken);
    const switchPreparation = await registrations
      .get('kicadstudio_switchVariant')
      ?.prepareInvocation?.({ input: {} }, {} as vscode.CancellationToken);
    const variantListResult = (await registrations
      .get('kicadstudio_listVariants')
      ?.invoke({ input: {} }, {} as vscode.CancellationToken)) as {
      content: Array<{ value: string }>;
    };

    expect(runDrcPreparation).toEqual(
      expect.objectContaining({ invocationMessage: 'Running KiCad DRC' })
    );
    expect(runErcPreparation).toEqual(
      expect.objectContaining({ invocationMessage: 'Running KiCad ERC' })
    );
    expect(exportPreparation).toEqual(
      expect.objectContaining({ invocationMessage: 'Exporting KiCad Gerbers' })
    );
    expect(openPreparation).toEqual(
      expect.objectContaining({ invocationMessage: 'Opening KiCad file' })
    );
    expect(switchPreparation).toEqual(
      expect.objectContaining({
        invocationMessage: 'Switching KiCad design variant'
      })
    );
    expect(variantListResult.content[0]).toEqual(
      expect.objectContaining({
        value: expect.stringContaining('Found 1 design variants')
      })
    );
  });
});
