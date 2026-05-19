import * as vscode from 'vscode';
import { AI_SECRET_KEY_LEGACY, SETTINGS } from '../constants';
import type { AIProvider } from '../types';
import {
  getAiSecretKey,
  isAiSecretProvider,
  migrateLegacyAiSecret,
  type AiSecretProvider
} from '../utils/secrets';
import { ClaudeProvider } from './claudeProvider';
import { CodexProvider, CopilotProvider } from './copilotProvider';
import { GeminiProvider } from './geminiProvider';
import { getDefaultModel } from './modelCatalog';
import { OpenAIProvider } from './openaiProvider';
import {
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_API_MODE,
  DEFAULT_OPENAI_MODEL
} from './prompts';

export class AIProviderRegistry {
  constructor(private readonly context: vscode.ExtensionContext) {}

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

    if (selected === 'copilot') {
      return new CopilotProvider();
    }

    if (selected === 'codex') {
      return new CodexProvider();
    }

    if (selected === 'claude') {
      const apiKey = await this.getApiKey('claude');
      if (!apiKey) {
        return undefined;
      }
      return new ClaudeProvider(apiKey, model || DEFAULT_CLAUDE_MODEL);
    }
    if (selected === 'openai') {
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
    if (selected === 'gemini') {
      const apiKey = await this.getApiKey('gemini');
      if (!apiKey) {
        return undefined;
      }
      return new GeminiProvider(apiKey, model || DEFAULT_GEMINI_MODEL);
    }
    return undefined;
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
      ...(['claude', 'openai', 'gemini'] as AiSecretProvider[]).map(
        (provider) => this.clearApiKey(provider)
      ),
      this.context.secrets.delete(AI_SECRET_KEY_LEGACY)
    ]);
  }

  getDefaultModel(provider: string): string {
    return provider === 'claude' ||
      provider === 'openai' ||
      provider === 'copilot' ||
      provider === 'gemini' ||
      provider === 'codex'
      ? getDefaultModel(provider)
      : '';
  }

  isKeyedProvider(provider: string): provider is AiSecretProvider {
    return isAiSecretProvider(provider);
  }
}
