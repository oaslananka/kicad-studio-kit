import * as vscode from 'vscode';
import { getAiSecretKey } from '../../src/utils/secrets';
import {
  KiCadStudioLanguageModelChatProvider,
  registerLanguageModelChatProvider
} from '../../src/lm/languageModelChatProvider';
import { createExtensionContextMock, commands, lm, window } from './vscodeMock';

describe('KiCadStudioLanguageModelChatProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (lm.registerLanguageModelChatProvider as jest.Mock).mockImplementation(
      () => ({
        dispose: jest.fn()
      })
    );
  });

  it('returns no models in silent mode when no API key is stored', async () => {
    const context =
      createExtensionContextMock() as unknown as vscode.ExtensionContext;
    const provider = new KiCadStudioLanguageModelChatProvider(
      context,
      { debug: jest.fn() } as never,
      async () => ({ activeFile: undefined, fileType: 'other', drcErrors: [] })
    );

    await expect(
      provider.provideLanguageModelChatInformation({ silent: true }, {
        isCancellationRequested: false
      } as vscode.CancellationToken)
    ).resolves.toEqual([]);
  });

  it('offers setup when the provider is queried interactively without a key', async () => {
    const context =
      createExtensionContextMock() as unknown as vscode.ExtensionContext;
    (window.showInformationMessage as jest.Mock).mockResolvedValue(
      'Open Setup'
    );
    const provider = new KiCadStudioLanguageModelChatProvider(
      context,
      { debug: jest.fn() } as never,
      async () => ({ activeFile: undefined, fileType: 'other', drcErrors: [] })
    );

    await provider.provideLanguageModelChatInformation({ silent: false }, {
      isCancellationRequested: false
    } as vscode.CancellationToken);

    expect(commands.executeCommand).toHaveBeenCalledWith(
      'kicadstudio.manageChatProvider'
    );
  });

  it('streams chat responses through progress reporting', async () => {
    const context = createExtensionContextMock();
    await context.secrets.store(getAiSecretKey('claude'), 'secret');
    const progress = { report: jest.fn() };
    let cancellationHandler: (() => void) | undefined;
    let streamSignal: AbortSignal | undefined;
    const provider = new KiCadStudioLanguageModelChatProvider(
      context as unknown as vscode.ExtensionContext,
      { debug: jest.fn() } as never,
      async () => ({
        activeFile: '/workspace/sample.kicad_pcb',
        fileType: 'pcb',
        drcErrors: ['Clearance violation']
      }),
      () => ({
        analyzeStream: async (
          _prompt,
          _context,
          _systemPrompt,
          onChunk,
          signal
        ) => {
          streamSignal = signal;
          cancellationHandler?.();
          onChunk('Hello');
          onChunk(' world');
        }
      })
    );

    await provider.provideLanguageModelChatResponse(
      {
        id: 'claudeThroughMcp',
        name: 'Claude via KiCad Studio',
        family: 'claude',
        version: 'claude-sonnet-4-6',
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
        capabilities: {}
      },
      [{ role: 'user', content: [{ value: 'Summarize the board' }] }],
      {},
      progress,
      {
        isCancellationRequested: false,
        onCancellationRequested: jest.fn((callback: () => void) => {
          cancellationHandler = callback;
          return { dispose: jest.fn() };
        })
      } as unknown as vscode.CancellationToken
    );

    expect(progress.report).toHaveBeenCalledTimes(2);
    expect(streamSignal?.aborted).toBe(true);
  });

  it('returns model metadata when a key is configured', async () => {
    const context = createExtensionContextMock();
    await context.secrets.store(getAiSecretKey('claude'), 'secret');
    const provider = new KiCadStudioLanguageModelChatProvider(
      context as unknown as vscode.ExtensionContext,
      { debug: jest.fn() } as never,
      async () => ({ activeFile: undefined, fileType: 'other', drcErrors: [] })
    );

    const models = await provider.provideLanguageModelChatInformation(
      { silent: true },
      {} as vscode.CancellationToken
    );

    expect(models[0]).toEqual(
      expect.objectContaining({
        id: 'claudeThroughMcp',
        family: 'claude'
      })
    );
  });

  it('throws when a chat response is requested without a stored key and estimates token counts', async () => {
    const context =
      createExtensionContextMock() as unknown as vscode.ExtensionContext;
    const provider = new KiCadStudioLanguageModelChatProvider(
      context,
      { debug: jest.fn() } as never,
      async () => ({ activeFile: undefined, fileType: 'other', drcErrors: [] })
    );

    await expect(
      provider.provideLanguageModelChatResponse(
        {
          id: 'claudeThroughMcp',
          name: 'Claude via KiCad Studio',
          family: 'claude',
          version: 'claude-sonnet-4-6',
          maxInputTokens: 200000,
          maxOutputTokens: 4096,
          capabilities: {}
        },
        [{ role: 'user', content: [{ value: 'Hello' }] }],
        {},
        { report: jest.fn() },
        {
          onCancellationRequested: jest.fn()
        } as unknown as vscode.CancellationToken
      )
    ).rejects.toThrow('KiCad Studio Claude is not configured');

    await expect(
      provider.provideTokenCount(
        {
          id: 'claudeThroughMcp',
          name: 'Claude via KiCad Studio',
          family: 'claude',
          version: 'claude-sonnet-4-6',
          maxInputTokens: 200000,
          maxOutputTokens: 4096,
          capabilities: {}
        },
        'hello world',
        {} as vscode.CancellationToken
      )
    ).resolves.toBeGreaterThan(0);
  });

  it('registers the vendor when the VS Code API is available', () => {
    const context =
      createExtensionContextMock() as unknown as vscode.ExtensionContext;

    registerLanguageModelChatProvider(
      context,
      { debug: jest.fn() } as never,
      async () => ({ activeFile: undefined, fileType: 'other', drcErrors: [] })
    );

    expect(lm.registerLanguageModelChatProvider).toHaveBeenCalledWith(
      'kicadstudio',
      expect.any(KiCadStudioLanguageModelChatProvider)
    );
  });

  it('logs and skips registration when the VS Code API is unavailable', () => {
    const originalRegister = lm.registerLanguageModelChatProvider;
    const logger = { debug: jest.fn() };
    (
      lm as { registerLanguageModelChatProvider?: unknown }
    ).registerLanguageModelChatProvider = undefined;

    registerLanguageModelChatProvider(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      logger as never,
      async () => ({ activeFile: undefined, fileType: 'other', drcErrors: [] })
    );

    expect(logger.debug).toHaveBeenCalledWith(
      'VS Code language model chat provider API is unavailable on this host.'
    );
    (
      lm as { registerLanguageModelChatProvider?: unknown }
    ).registerLanguageModelChatProvider = originalRegister;
  });
});
