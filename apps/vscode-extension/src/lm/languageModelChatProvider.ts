import * as vscode from 'vscode';
import { ClaudeProvider } from '../ai/claudeProvider';
import {
  buildSystemPrompt,
  DEFAULT_AI_LANGUAGE,
  DEFAULT_CLAUDE_MODEL,
  normalizeAiLanguage
} from '../ai/prompts';
import { COMMANDS, SETTINGS } from '../constants';
import type { StudioContext } from '../types';
import { Logger } from '../utils/logger';
import { migrateLegacyAiSecret } from '../utils/secrets';
import {
  createLanguageModelTextPart,
  estimateLanguageModelTokens,
  flattenLanguageModelMessages,
  getLanguageModelPartText,
  getLanguageModelApi,
  type LanguageModelChatInformation,
  type LanguageModelChatProvider,
  type LanguageModelChatRequestMessage
} from './api';

const CHAT_PROVIDER_VENDOR = 'kicadstudio';
const CHAT_PROVIDER_MODEL_ID = 'claudeThroughMcp';

interface ClaudeLikeProvider {
  analyzeStream(
    prompt: string,
    context: string,
    systemPrompt: string | undefined,
    onChunk: (text: string) => void,
    signal?: AbortSignal
  ): Promise<void>;
}

export class KiCadStudioLanguageModelChatProvider implements LanguageModelChatProvider<LanguageModelChatInformation> {
  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly logger: Logger,
    private readonly getStudioContext: () => Promise<StudioContext>,
    private readonly providerFactory: (
      apiKey: string,
      model: string
    ) => ClaudeLikeProvider = (apiKey, model) =>
      new ClaudeProvider(apiKey, model)
  ) {}

  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    _token: vscode.CancellationToken
  ): Promise<LanguageModelChatInformation[]> {
    const apiKey = await migrateLegacyAiSecret({
      secrets: this.extensionContext.secrets,
      provider: 'claude'
    });
    if (!apiKey) {
      if (!options.silent) {
        const choice = await vscode.window.showInformationMessage(
          'KiCad Studio Claude requires an API key before it can be used as a chat model.',
          'Open Setup'
        );
        if (choice === 'Open Setup') {
          await vscode.commands.executeCommand(COMMANDS.manageChatProvider);
        }
      }
      return [];
    }

    this.logger.debug(
      'KiCad Studio chat provider exposed its Claude-backed chat model.'
    );
    const configuredModel =
      vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.aiModel, '')
        .trim() || DEFAULT_CLAUDE_MODEL;
    return [
      {
        id: CHAT_PROVIDER_MODEL_ID,
        name: 'Claude via KiCad Studio',
        family: 'claude',
        version: configuredModel,
        maxInputTokens: 200_000,
        maxOutputTokens: 4096,
        detail:
          'Uses the KiCad Studio Claude configuration and current project context.',
        tooltip: 'Claude with KiCad Studio prompts and project-aware context.',
        capabilities: {
          toolCalling: false
        }
      }
    ];
  }

  async provideLanguageModelChatResponse(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatRequestMessage[],
    _options: Record<string, unknown>,
    progress: { report(value: unknown): void },
    token: vscode.CancellationToken
  ): Promise<void> {
    const apiKey = await migrateLegacyAiSecret({
      secrets: this.extensionContext.secrets,
      provider: 'claude'
    });
    if (!apiKey) {
      throw new Error(
        'KiCad Studio Claude is not configured. Store an API key first.'
      );
    }

    const studioContext = await this.getStudioContext();
    const prompt = getLastUserFacingMessage(messages);
    const transcript = flattenLanguageModelMessages(messages);
    const language = normalizeAiLanguage(
      vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.aiLanguage, DEFAULT_AI_LANGUAGE)
    );
    const systemPrompt = buildSystemPrompt(language, {
      activeVariant: studioContext.activeVariant,
      kicadVersion:
        studioContext.fileType === 'other' ? undefined : 'workspace',
      mcpConnected: studioContext.mcpConnected
    });

    const context = [transcript, buildStudioContextSummary(studioContext)]
      .filter(Boolean)
      .join('\n\n');

    const provider = this.providerFactory(
      apiKey,
      model.version || DEFAULT_CLAUDE_MODEL
    );
    const abortController = new AbortController();
    token.onCancellationRequested(() =>
      abortController.abort(new Error('Chat request cancelled.'))
    );
    this.logger.debug(
      `Streaming KiCad Studio chat provider response with model ${model.version}.`
    );
    await provider.analyzeStream(
      prompt,
      context,
      systemPrompt,
      (chunk) => progress.report(createLanguageModelTextPart(chunk)),
      abortController.signal
    );
  }

  async provideTokenCount(
    _model: LanguageModelChatInformation,
    text: string | LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    return estimateLanguageModelTokens(text);
  }
}

export function registerLanguageModelChatProvider(
  context: vscode.ExtensionContext,
  logger: Logger,
  getStudioContext: () => Promise<StudioContext>
): void {
  const lm = getLanguageModelApi();
  if (typeof lm?.registerLanguageModelChatProvider !== 'function') {
    logger.debug(
      'VS Code language model chat provider API is unavailable on this host.'
    );
    return;
  }

  context.subscriptions.push(
    lm.registerLanguageModelChatProvider(
      CHAT_PROVIDER_VENDOR,
      new KiCadStudioLanguageModelChatProvider(
        context,
        logger,
        getStudioContext
      )
    )
  );
}

function getLastUserFacingMessage(
  messages: readonly LanguageModelChatRequestMessage[]
): string {
  const lastMessage = [...messages]
    .reverse()
    .find((message) => message.content.length > 0);
  return lastMessage
    ? lastMessage.content.map((part) => getLanguageModelPartText(part)).join('')
    : 'Continue the conversation using the provided KiCad context.';
}

function buildStudioContextSummary(context: StudioContext): string {
  return JSON.stringify(
    {
      activeFile: context.activeFile,
      fileType: context.fileType,
      activeVariant: context.activeVariant,
      mcpConnected: context.mcpConnected,
      cursorPosition: context.cursorPosition,
      activeSheetPath: context.activeSheetPath,
      visibleLayers: context.visibleLayers,
      drcErrors: context.drcErrors.slice(0, 20)
    },
    null,
    2
  );
}
