import * as vscode from 'vscode';
import { AI_SECRET_KEY_LEGACY, SETTINGS } from '../constants';
import type { AIProvider } from '../types';
import {
  getAiSecretKey,
  getAiSecretProviders,
  isAiSecretProvider,
  migrateLegacyAiSecret,
  type AiSecretProvider
} from '../utils/secrets';
import { ClaudeProvider } from './claudeProvider';
import { CopilotProvider } from './copilotProvider';
import { GeminiProvider } from './geminiProvider';
import { LocalProvider } from './localProvider';
import { NvidiaBuildProvider } from './nvidiaBuildProvider';
import { getDefaultModel } from './modelCatalog';
import { OpenAIProvider } from './openaiProvider';
import { OpenRouterProvider } from './openrouterProvider';
import {
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_API_MODE,
  DEFAULT_OPENAI_MODEL
} from './prompts';

export class AIProviderRegistry {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private readonly aiProviderFactories: Record<
    string,
    (model: string) => Promise<AIProvider | undefined>
  > = {
    none: (_model) => this.createNoneProvider(_model),
    copilot: (_model) => this.createCopilotProvider(_model),
    local: (model) => this.createLocalProvider(model),
    claude: (model) => this.createClaudeProvider(model),
    openai: (model) => this.createOpenAIProvider(model),
    openrouter: (model) => this.createOpenRouterProvider(model),
    nvidia: (model) => this.createNvidiaProvider(model),
    gemini: (model) => this.createGeminiProvider(model)
  };

  async getProvider(): Promise<AIProvider | undefined> {
    const selection = this.getSelection();
    return this.getProviderForSelection(selection.provider, selection.model);
  }

  getSelection(): { provider: string; model: string; openAIApiMode: string } {
    const config = vscode.workspace.getConfiguration();
    return {
      provider: config.get<string>(SETTINGS.aiProvider, 'none'),
      model: config.get<string>(SETTINGS.aiModel, '').trim(),
      openAIApiMode: config.get<string>(
        SETTINGS.aiOpenAIApiMode,
        DEFAULT_OPENAI_API_MODE
      )
    };
  }

  async getProviderForSelection(
    selected: string,
    model = ''
  ): Promise<AIProvider | undefined> {
    if (selected === 'none') {
      return undefined;
    }

    const factory = this.aiProviderFactories[selected];
    if (!factory) {
      return undefined;
    }
    return factory.call(this, model);
  }

  private async createNoneProvider(
    _model: string
  ): Promise<AIProvider | undefined> {
    return undefined;
  }

  private async createCopilotProvider(
    _model: string
  ): Promise<AIProvider | undefined> {
    return new CopilotProvider();
  }

  private async createLocalProvider(
    model: string
  ): Promise<AIProvider | undefined> {
    const endpoint = vscode.workspace
      .getConfiguration()
      .get<string>(SETTINGS.aiLocalEndpoint, '')
      .trim();
    return endpoint ? new LocalProvider(endpoint, model) : undefined;
  }

  private async createClaudeProvider(
    model: string
  ): Promise<AIProvider | undefined> {
    const apiKey = await this.getApiKey('claude');
    if (!apiKey) {
      return undefined;
    }
    return new ClaudeProvider(apiKey, model || DEFAULT_CLAUDE_MODEL);
  }

  private async createOpenAIProvider(
    model: string
  ): Promise<AIProvider | undefined> {
    const apiKey = await this.getApiKey('openai');
    if (!apiKey) {
      return undefined;
    }
    const apiMode = this.getSelection().openAIApiMode;
    return new OpenAIProvider(
      apiKey,
      model || DEFAULT_OPENAI_MODEL,
      apiMode === 'chat-completions' ? 'chat-completions' : 'responses'
    );
  }

  private async createOpenRouterProvider(
    model: string
  ): Promise<AIProvider | undefined> {
    const apiKey = await this.getApiKey('openrouter');
    if (!apiKey) {
      return undefined;
    }
    return new OpenRouterProvider(
      apiKey,
      model || getDefaultModel('openrouter')
    );
  }

  private async createNvidiaProvider(
    model: string
  ): Promise<AIProvider | undefined> {
    const apiKey = await this.getApiKey('nvidia');
    if (!apiKey) {
      return undefined;
    }
    return new NvidiaBuildProvider(apiKey, model || getDefaultModel('nvidia'));
  }

  private async createGeminiProvider(
    model: string
  ): Promise<AIProvider | undefined> {
    const apiKey = await this.getApiKey('gemini');
    if (!apiKey) {
      return undefined;
    }
    return new GeminiProvider(apiKey, model || DEFAULT_GEMINI_MODEL);
  }

  async getApiKey(provider: AiSecretProvider): Promise<string | undefined> {
    return migrateLegacyAiSecret({ secrets: this.context.secrets, provider });
  }

  async setApiKey(provider: AiSecretProvider, value: string): Promise<void> {
    await this.context.secrets.store(getAiSecretKey(provider), value);
  }

  async hasApiKey(provider: AiSecretProvider): Promise<boolean> {
    return Boolean(await this.getApiKey(provider));
  }

  async clearApiKey(provider: AiSecretProvider): Promise<void> {
    await this.context.secrets.delete(getAiSecretKey(provider));
  }

  async clearAllApiKeys(): Promise<void> {
    await Promise.all([
      ...getAiSecretProviders().map((provider) => this.clearApiKey(provider)),
      this.context.secrets.delete(AI_SECRET_KEY_LEGACY)
    ]);
  }

  getDefaultModel(provider: string): string {
    return provider === 'claude' ||
      provider === 'openai' ||
      provider === 'openrouter' ||
      provider === 'nvidia' ||
      provider === 'copilot' ||
      provider === 'gemini' ||
      provider === 'local'
      ? getDefaultModel(provider)
      : '';
  }

  isKeyedProvider(provider: string): provider is AiSecretProvider {
    return isAiSecretProvider(provider);
  }
}
