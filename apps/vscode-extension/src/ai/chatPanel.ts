import * as vscode from 'vscode';
import { AI_CHAT_MAX_HISTORY, COMMANDS, SETTINGS } from '../constants';
import { AIStreamAbortedError } from '../errors';
import { McpClient } from '../mcp/mcpClient';
import { extractMcpToolCalls } from '../mcp/toolCallParser';
import type { McpToolCall } from '../types';
import { Logger } from '../utils/logger';
import {
  asNumber,
  asRecord,
  asString,
  hasType
} from '../utils/webviewMessages';
import { AIProviderRegistry } from './aiProvider';
import { getActiveAiContext } from './context';
import {
  buildSystemPrompt,
  DEFAULT_AI_LANGUAGE,
  normalizeAiLanguage
} from './prompts';
import { buildChatHtml } from './chatHtml';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: McpToolCall[];
  applied?: boolean;
}

const CHAT_HISTORY_KEY = 'kicadstudio.aiChat.history';
const CHAT_PANEL_MESSAGE_TYPES = [
  'send',
  'cancel',
  'clear',
  'ready',
  'selectionChanged',
  'applyToolCalls',
  'ignoreToolCalls',
  'openSettings'
];

/**
 * Multi-turn AI chat panel for KiCad Studio.
 */
export class KiCadChatPanel implements vscode.Disposable {
  public static readonly viewType = 'kicadstudio.aiChat';
  private static instance: KiCadChatPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly history: ChatMessage[] = [];
  private readonly disposables: vscode.Disposable[] = [];
  private abortController: AbortController | undefined;
  private busy = false;
  private selectedProvider: string;
  private selectedModel: string;
  private disposed = false;

  static createOrShow(
    context: vscode.ExtensionContext,
    providers: AIProviderRegistry,
    logger: Logger,
    mcpClient?: McpClient
  ): KiCadChatPanel {
    if (KiCadChatPanel.instance) {
      KiCadChatPanel.instance.panel.reveal(vscode.ViewColumn.Beside);
      void KiCadChatPanel.instance.postHydrate();
      return KiCadChatPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      KiCadChatPanel.viewType,
      'KiCad AI Chat',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
      }
    );

    const instance = new KiCadChatPanel(
      context,
      panel,
      providers,
      logger,
      mcpClient
    );
    KiCadChatPanel.instance = instance;
    context.subscriptions.push(instance);
    return instance;
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    private readonly providers: AIProviderRegistry,
    private readonly logger: Logger,
    private readonly mcpClient?: McpClient
  ) {
    this.panel = panel;
    const selection = providers.getSelection();
    this.selectedProvider = selection.provider;
    this.selectedModel = selection.model;
    this.history.push(...this.loadHistory());
    this.panel.webview.html = buildChatHtml({
      webview: this.panel.webview,
      extensionUri: this.context.extensionUri
    });
    this.disposables.push(
      this.panel.onDidDispose(() => this.handleDisposed()),
      this.panel.webview.onDidReceiveMessage(
        (message: unknown) => void this.handleMessage(message)
      ),
      vscode.window.onDidChangeActiveTextEditor(
        () => void this.postContextInfo()
      ),
      vscode.workspace.onDidSaveTextDocument(() => void this.postContextInfo())
    );
  }

  async submitPrompt(
    prompt: string,
    extraContext: string,
    selection?: { provider?: string; model?: string }
  ): Promise<void> {
    this.panel.reveal(vscode.ViewColumn.Beside);
    if (selection?.provider) {
      this.selectedProvider = selection.provider;
    }
    if (typeof selection?.model === 'string') {
      this.selectedModel = selection.model;
    }
    await this.runPrompt(prompt, extraContext);
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!hasType(message, CHAT_PANEL_MESSAGE_TYPES)) {
      return;
    }

    const record = asRecord(message) ?? {};
    if (message.type === 'ready') {
      await this.postHydrate();
      return;
    }

    if (message.type === 'selectionChanged') {
      const provider = asString(record['provider']);
      const model = asString(record['model']);
      if (provider) {
        this.selectedProvider = provider;
      }
      if (typeof model === 'string') {
        this.selectedModel = model;
      }
      return;
    }

    if (message.type === 'cancel') {
      this.abortController?.abort(new AIStreamAbortedError());
      return;
    }

    if (message.type === 'clear') {
      this.history.length = 0;
      await this.persistHistory();
      await this.postHydrate();
      return;
    }

    if (message.type === 'applyToolCalls') {
      const timestamp = asNumber(record['timestamp']);
      if (timestamp !== undefined) {
        await this.applyToolCalls(timestamp);
      }
      return;
    }

    if (message.type === 'ignoreToolCalls') {
      const timestamp = asNumber(record['timestamp']);
      if (timestamp !== undefined) {
        const target = this.history.find(
          (entry) => entry.timestamp === timestamp
        );
        if (target) {
          target.applied = true;
          await this.persistHistory();
          await this.panel.webview.postMessage({
            type: 'assistantReplace',
            message: target
          });
        }
      }
      return;
    }

    if (message.type === 'openSettings') {
      await vscode.commands.executeCommand(COMMANDS.openSettings);
      return;
    }

    if (message.type === 'send') {
      const prompt = asString(record['prompt'])?.trim();
      const context = asString(record['context']) ?? '';
      if (prompt) {
        await this.runPrompt(prompt, context);
      }
    }
  }

  private async runPrompt(prompt: string, extraContext: string): Promise<void> {
    if (this.busy) {
      this.abortController?.abort(new AIStreamAbortedError());
    }

    const provider = await this.providers.getProviderForSelection(
      this.selectedProvider,
      this.selectedModel
    );
    if (!provider?.isConfigured()) {
      void vscode.window.showWarningMessage(
        'AI provider is not configured. Choose a provider and store an API key first.'
      );
      await this.postStatus('AI provider is not configured.');
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    };
    this.history.push(userMessage);
    this.trimHistory();
    await this.persistHistory();
    await this.panel.webview.postMessage({
      type: 'appendMessage',
      message: userMessage
    });

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1
    };
    this.history.push(assistantMessage);
    this.trimHistory();
    await this.persistHistory();
    await this.panel.webview.postMessage({
      type: 'appendMessage',
      message: assistantMessage
    });

    const activeContext = getActiveAiContext();
    const aiLanguage = normalizeAiLanguage(
      vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.aiLanguage, DEFAULT_AI_LANGUAGE)
    );
    const conversation = this.buildConversationMessages()
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n\n');
    const context = [
      activeContext.description,
      extraContext ? `Additional context:\n${extraContext}` : '',
      activeContext.documentPreview
        ? `Document preview:\n${activeContext.documentPreview}`
        : '',
      conversation ? `Conversation history:\n${conversation}` : ''
    ]
      .filter(Boolean)
      .join('\n\n');
    const mcpState = this.mcpClient
      ? await this.mcpClient.testConnection()
      : undefined;
    const systemPrompt = buildSystemPrompt(aiLanguage, {
      ...activeContext.projectContext,
      mcpConnected: mcpState?.connected
    });

    this.busy = true;
    this.abortController = new AbortController();
    await this.panel.webview.postMessage({ type: 'busy', busy: true });
    await this.postStatus(`Streaming response from ${provider.name}...`);

    try {
      if (provider.analyzeStream) {
        await provider.analyzeStream(
          prompt,
          context,
          systemPrompt,
          async (chunk) => {
            assistantMessage.content += chunk;
            await this.panel.webview.postMessage({
              type: 'assistantChunk',
              timestamp: assistantMessage.timestamp,
              text: chunk
            });
          },
          this.abortController.signal
        );
      } else {
        assistantMessage.content = await provider.analyze(
          prompt,
          context,
          systemPrompt
        );
      }
      assistantMessage.toolCalls = extractMcpToolCalls(
        assistantMessage.content
      );
      await this.panel.webview.postMessage({
        type: 'assistantReplace',
        message: assistantMessage
      });
      await this.postStatus(`Response complete from ${provider.name}.`);
    } catch (error) {
      if (
        error instanceof AIStreamAbortedError ||
        this.abortController.signal.aborted
      ) {
        await this.postStatus('Streaming stopped.');
        if (!assistantMessage.content.trim()) {
          const index = this.history.indexOf(assistantMessage);
          if (index >= 0) {
            this.history.splice(index, 1);
          }
        }
      } else {
        const message = error instanceof Error ? error.message : String(error);
        assistantMessage.content = message;
        await this.panel.webview.postMessage({
          type: 'assistantReplace',
          message: assistantMessage
        });
        this.logger.error('AI chat request failed', error);
        void vscode.window.showErrorMessage(message);
      }
    } finally {
      this.busy = false;
      this.abortController = undefined;
      this.trimHistory();
      await this.persistHistory();
      await this.panel.webview.postMessage({ type: 'busy', busy: false });
    }
  }

  private buildConversationMessages(): Array<{
    role: string;
    content: string;
  }> {
    return this.history.slice(-AI_CHAT_MAX_HISTORY).map((message) => ({
      role: message.role,
      content: message.content
    }));
  }

  private loadHistory(): ChatMessage[] {
    const stored = this.context.workspaceState.get<ChatMessage[]>(
      CHAT_HISTORY_KEY,
      []
    );
    return stored.filter(
      (message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        typeof message.timestamp === 'number'
    );
  }

  private async persistHistory(): Promise<void> {
    await this.context.workspaceState.update(
      CHAT_HISTORY_KEY,
      this.history.slice(-AI_CHAT_MAX_HISTORY)
    );
  }

  private trimHistory(): void {
    while (this.history.length > AI_CHAT_MAX_HISTORY) {
      this.history.shift();
    }
  }

  private async postHydrate(): Promise<void> {
    await this.panel.webview.postMessage({
      type: 'hydrate',
      history: this.history,
      provider: this.selectedProvider,
      model: this.selectedModel,
      busy: this.busy,
      contextInfo: getActiveAiContext().description
    });
  }

  private async postContextInfo(): Promise<void> {
    if (this.disposed) {
      return;
    }
    await this.panel.webview.postMessage({
      type: 'contextInfo',
      text: getActiveAiContext().description
    });
  }

  private async postStatus(text: string): Promise<void> {
    await this.panel.webview.postMessage({ type: 'status', text });
  }

  private async applyToolCalls(timestamp: number): Promise<void> {
    const target = this.history.find((entry) => entry.timestamp === timestamp);
    if (!target?.toolCalls?.length) {
      return;
    }
    if (!this.mcpClient) {
      void vscode.window.showWarningMessage(
        'MCP client is not available in this session.'
      );
      return;
    }

    const previews = await Promise.all(
      target.toolCalls.map(async (toolCall) => {
        try {
          return `${toolCall.name}: ${await this.mcpClient?.previewToolCall(toolCall)}`;
        } catch {
          return `${toolCall.name}: preview unavailable`;
        }
      })
    );

    const choice = await vscode.window.showInformationMessage(
      `Apply ${target.toolCalls.length} MCP tool call(s)?\n\n${previews.join('\n')}`,
      'Apply',
      'Cancel'
    );
    if (choice !== 'Apply') {
      return;
    }

    for (const toolCall of target.toolCalls) {
      await this.mcpClient.callTool(toolCall.name, toolCall.arguments);
    }

    target.applied = true;
    await this.persistHistory();
    await this.panel.webview.postMessage({
      type: 'assistantReplace',
      message: target
    });
    void vscode.window.showInformationMessage(
      'Suggested MCP changes were applied.'
    );
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.handleDisposed();
    this.panel.dispose();
  }

  private handleDisposed(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.abortController?.abort(new AIStreamAbortedError());
    this.disposables.forEach((disposable) => disposable.dispose());
    KiCadChatPanel.instance = undefined;
  }
}
