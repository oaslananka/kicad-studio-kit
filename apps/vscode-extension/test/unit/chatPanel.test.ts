import * as vscode from 'vscode';
import { KiCadChatPanel } from '../../src/ai/chatPanel';
import { AIStreamAbortedError } from '../../src/errors';
import { createExtensionContextMock } from './vscodeMock';

function createPanelMock() {
  let messageHandler: ((message: unknown) => void) | undefined;
  let disposeHandler: (() => void) | undefined;
  const webview = {
    html: '',
    cspSource: 'vscode-resource:',
    postMessage: jest.fn().mockResolvedValue(true),
    onDidReceiveMessage: jest.fn((callback: (message: unknown) => void) => {
      messageHandler = callback;
      return { dispose: jest.fn() };
    }),
    asWebviewUri: jest.fn((value) => value)
  };
  const panel = {
    webview,
    visible: true,
    reveal: jest.fn(),
    dispose: jest.fn(() => disposeHandler?.()),
    onDidDispose: jest.fn((callback: () => void) => {
      disposeHandler = callback;
      return { dispose: jest.fn() };
    })
  };
  return {
    panel,
    send: async (message: unknown) => messageHandler?.(message)
  };
}

describe('KiCadChatPanel', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    ((KiCadChatPanel as any).instance as KiCadChatPanel | undefined)?.dispose();
  });

  function createProviders(analyzeImpl?: (prompt: string) => Promise<string>) {
    const provider = {
      name: 'Claude',
      isConfigured: () => true,
      analyze: jest.fn(async (prompt: string) =>
        analyzeImpl ? analyzeImpl(prompt) : `reply:${prompt}`
      ),
      analyzeStream: jest.fn(
        async (
          prompt: string,
          _context: string,
          _systemPrompt: string | undefined,
          onChunk: (text: string) => void
        ) => {
          onChunk(`reply:${prompt}`);
        }
      ),
      testConnection: jest.fn(async () => ({ ok: true, latencyMs: 10 }))
    };
    const registry = {
      getSelection: () => ({
        provider: 'claude',
        model: '',
        openAIApiMode: 'responses'
      }),
      getProviderForSelection: jest.fn(async () => provider)
    };
    return { provider, registry };
  }

  function createLogger() {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      show: jest.fn(),
      refreshLevel: jest.fn(),
      dispose: jest.fn()
    };
  }

  it('maintains conversation history across turns', async () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );
    const { registry } = createProviders();
    const chat = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      createLogger() as never
    );

    await chat.submitPrompt('first turn', 'ctx');
    await chat.submitPrompt('second turn', 'ctx');

    const history = (chat as any).history as Array<{ role: string }>;
    expect(history).toHaveLength(4);
    expect(history.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant'
    ]);
  });

  it('truncates history to AI_CHAT_MAX_HISTORY turns', async () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );
    const { registry } = createProviders();
    const chat = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      createLogger() as never
    );

    for (let index = 0; index < 12; index += 1) {
      await chat.submitPrompt(`turn ${index}`, 'ctx');
    }

    const history = (chat as any).history as Array<{ role: string }>;
    expect(history.length).toBeLessThanOrEqual(20);
  });

  it('serializes and deserializes history from workspaceState', async () => {
    const context = createExtensionContextMock();
    const firstPanel = createPanelMock();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      firstPanel.panel
    );
    const { registry } = createProviders();
    const logger = createLogger();
    const chat = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      logger as never
    );
    await chat.submitPrompt('persist me', 'ctx');
    chat.dispose();

    const secondPanel = createPanelMock();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      secondPanel.panel
    );
    const reopened = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      logger as never
    );

    const history = (reopened as any).history as Array<{ role: string }>;
    expect(history.length).toBeGreaterThan(0);
    expect(
      context.workspaceState.get('kicadstudio.aiChat.history', [])
    ).toHaveLength(history.length);
  });

  it('aborts in-flight stream on cancel message', async () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );
    let aborted = false;
    const provider = {
      name: 'Claude',
      isConfigured: () => true,
      analyze: jest.fn(),
      analyzeStream: jest.fn(
        (
          _prompt: string,
          _context: string,
          _systemPrompt: string | undefined,
          _onChunk: (text: string) => void,
          signal?: AbortSignal
        ) =>
          new Promise<void>((resolve, reject) => {
            if (signal?.aborted) {
              aborted = true;
              reject(signal.reason ?? new AIStreamAbortedError());
              return;
            }
            signal?.addEventListener('abort', () => {
              aborted = true;
              reject(signal.reason ?? new AIStreamAbortedError());
            });
          })
      ),
      testConnection: jest.fn(async () => ({ ok: true, latencyMs: 10 }))
    };
    const registry = {
      getSelection: () => ({
        provider: 'claude',
        model: '',
        openAIApiMode: 'responses'
      }),
      getProviderForSelection: jest.fn(async () => provider)
    };
    const chat = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      createLogger() as never
    );

    const pending = chat.submitPrompt('slow turn', 'ctx');
    while (!(chat as any).abortController) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await panelMock.send({ type: 'cancel' });
    await pending;

    expect(aborted).toBe(true);
  });

  it('reuses the existing singleton panel and hydrates on ready', async () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );
    const { registry } = createProviders();
    const logger = createLogger();

    const first = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      logger as never
    );
    const second = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      logger as never
    );

    await panelMock.send({ type: 'ready' });

    expect(first).toBe(second);
    expect(panelMock.panel.reveal).toHaveBeenCalled();
    expect(panelMock.panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hydrate' })
    );
  });

  it('updates provider selection and clears history from webview messages', async () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );
    const { registry } = createProviders();
    const chat = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      createLogger() as never
    );

    await chat.submitPrompt('turn', 'ctx');
    await panelMock.send({
      type: 'selectionChanged',
      provider: 'openai',
      model: 'gpt-4.1'
    });
    await panelMock.send({ type: 'clear' });

    expect((chat as any).selectedProvider).toBe('openai');
    expect((chat as any).selectedModel).toBe('gpt-4.1');
    expect((chat as any).history).toHaveLength(0);
  });

  it('warns when the selected provider is not configured', async () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );
    const registry = {
      getSelection: () => ({
        provider: 'claude',
        model: '',
        openAIApiMode: 'responses'
      }),
      getProviderForSelection: jest.fn(async () => ({
        name: 'Claude',
        isConfigured: () => false,
        analyze: jest.fn(),
        testConnection: jest.fn(async () => ({
          ok: false,
          latencyMs: 0,
          error: 'missing key'
        }))
      }))
    };

    const chat = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      createLogger() as never
    );

    await chat.submitPrompt('turn', 'ctx');

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('AI provider is not configured')
    );
  });

  it('falls back to non-streaming analyze and reports provider errors', async () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );
    const logger = createLogger();
    const registry = {
      getSelection: () => ({
        provider: 'openai',
        model: 'gpt-4.1',
        openAIApiMode: 'responses'
      }),
      getProviderForSelection: jest
        .fn()
        .mockResolvedValueOnce({
          name: 'OpenAI',
          isConfigured: () => true,
          analyze: jest.fn(async () => 'fallback reply'),
          testConnection: jest.fn(async () => ({ ok: true, latencyMs: 10 }))
        })
        .mockResolvedValueOnce({
          name: 'OpenAI',
          isConfigured: () => true,
          analyze: jest.fn(async () => {
            throw new Error('provider exploded');
          }),
          testConnection: jest.fn(async () => ({ ok: true, latencyMs: 10 }))
        })
    };

    const chat = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      logger as never
    );

    await chat.submitPrompt('fallback', 'ctx');
    await chat.submitPrompt('boom', 'ctx');

    expect(panelMock.panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'assistantReplace',
        message: expect.objectContaining({ content: 'fallback reply' })
      })
    );
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'provider exploded'
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('applies and ignores suggested MCP tool calls from assistant replies', async () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );
    const mcpClient = {
      testConnection: jest.fn(async () => ({
        available: true,
        connected: true
      })),
      previewToolCall: jest.fn(async () => 'Update fabrication profile'),
      callTool: jest.fn(async () => ({}))
    };
    const registry = {
      getSelection: () => ({
        provider: 'openai',
        model: 'gpt-5.4',
        openAIApiMode: 'responses'
      }),
      getProviderForSelection: jest.fn(async () => ({
        name: 'OpenAI',
        isConfigured: () => true,
        analyze: jest.fn(
          async () => `Recommended change

\`\`\`mcp
{"name":"project_set_design_intent","arguments":{"fabricationProfile":"jlcpcb"}}
\`\`\``
        ),
        testConnection: jest.fn(async () => ({ ok: true, latencyMs: 10 }))
      }))
    };
    (vscode.window.showInformationMessage as jest.Mock).mockReset();
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(
      'Apply'
    );

    const chat = KiCadChatPanel.createOrShow(
      context as never,
      registry as never,
      createLogger() as never,
      mcpClient as never
    );

    await chat.submitPrompt('suggest a change', 'ctx');
    const history = (chat as any).history as Array<{
      role: string;
      timestamp: number;
      toolCalls?: Array<{ name: string }>;
      applied?: boolean;
    }>;
    const assistantMessage = history.find(
      (entry) => entry.role === 'assistant' && entry.toolCalls?.length
    );
    expect(assistantMessage?.toolCalls?.[0]?.name).toBe(
      'project_set_design_intent'
    );

    await panelMock.send({
      type: 'applyToolCalls',
      timestamp: assistantMessage?.timestamp
    });
    expect(mcpClient.previewToolCall).toHaveBeenCalled();

    await panelMock.send({
      type: 'ignoreToolCalls',
      timestamp: assistantMessage?.timestamp
    });
    expect(
      history.find((entry) => entry.timestamp === assistantMessage?.timestamp)
        ?.applied
    ).toBe(true);
  });
});
