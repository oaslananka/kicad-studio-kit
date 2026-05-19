import * as vscode from 'vscode';
import { AIRequestTimeoutError } from '../errors';
import type { AIConnectionResult, AIProvider } from '../types';
import { buildSystemPrompt, DEFAULT_AI_LANGUAGE } from './prompts';

interface LanguageModelNamespace {
  selectChatModels(
    selector?: Record<string, string>
  ): Promise<LanguageModelChatModel[]>;
}

interface LanguageModelChatModel {
  sendRequest(
    messages: unknown[],
    options?: Record<string, unknown>,
    token?: unknown
  ): Promise<LanguageModelChatResponse>;
}

interface LanguageModelChatResponse {
  text: AsyncIterable<string>;
}

interface MessageFactory {
  User?(content: string): unknown;
}

abstract class BaseLanguageModelProvider implements AIProvider {
  abstract readonly name: string;
  protected abstract readonly selectors: Array<Record<string, string>>;

  isConfigured(): boolean {
    return Boolean(this.getLmApi());
  }

  async analyze(
    prompt: string,
    context: string,
    systemPrompt = buildSystemPrompt(DEFAULT_AI_LANGUAGE)
  ): Promise<string> {
    const model = await this.selectModel();
    const response = await model.sendRequest([
      this.createUserMessage(
        `${systemPrompt}\n\n${prompt}\n\nContext:\n${context}`
      )
    ]);

    let result = '';
    for await (const chunk of response.text) {
      result += chunk;
    }
    return result.trim() || `No response from ${this.name}.`;
  }

  async analyzeStream(
    prompt: string,
    context: string,
    systemPrompt: string | undefined,
    onChunk: (text: string) => void
  ): Promise<void> {
    const model = await this.selectModel();
    const response = await model.sendRequest([
      this.createUserMessage(
        `${systemPrompt ?? buildSystemPrompt(DEFAULT_AI_LANGUAGE)}\n\n${prompt}\n\nContext:\n${context}`
      )
    ]);
    for await (const chunk of response.text) {
      onChunk(chunk);
    }
  }

  async testConnection(): Promise<AIConnectionResult> {
    const startedAt = Date.now();
    try {
      await this.analyze(
        'Reply with the single word OK.',
        'Connectivity test from KiCad Studio.',
        buildSystemPrompt(DEFAULT_AI_LANGUAGE)
      );
      return {
        ok: true,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  protected getLmApi(): LanguageModelNamespace | undefined {
    return (vscode as unknown as { lm?: LanguageModelNamespace }).lm;
  }

  protected createUserMessage(content: string): unknown {
    const factory = (
      vscode as unknown as { LanguageModelChatMessage?: MessageFactory }
    ).LanguageModelChatMessage;
    return typeof factory?.User === 'function'
      ? factory.User(content)
      : { role: 'user', content };
  }

  private async selectModel(): Promise<LanguageModelChatModel> {
    const lm = this.getLmApi();
    if (!lm) {
      throw new AIRequestTimeoutError(this.name, 0);
    }

    for (const selector of this.selectors) {
      const models = await lm.selectChatModels(selector);
      const [firstModel] = models;
      if (firstModel) {
        return firstModel;
      }
    }

    throw new Error(
      `No ${this.name} model is currently available through the VS Code Language Model API.`
    );
  }
}

export class CopilotProvider extends BaseLanguageModelProvider {
  readonly name = 'GitHub Copilot';
  protected readonly selectors = [
    { vendor: 'copilot', family: 'gpt-4o' },
    { vendor: 'copilot', family: 'gpt-4' },
    { vendor: 'copilot' }
  ];
}

/**
 * VS Code Codex provider — uses the VS Code Language Model API to route
 * requests through GitHub Copilot or other LM extensions installed in VS Code.
 *
 * Selector list is ordered from most-preferred to least-preferred.  We try
 * newer GPT-4.x / Claude families first so the provider still works in 2025+
 * where the legacy "codex" family ID is no longer registered by Copilot.
 */
export class CodexProvider extends BaseLanguageModelProvider {
  readonly name = 'VS Code Codex';
  protected readonly selectors = [
    { vendor: 'copilot', family: 'gpt-4.1' },
    { vendor: 'copilot', family: 'gpt-4o' },
    { vendor: 'copilot', family: 'claude-sonnet' },
    { vendor: 'copilot', family: 'o3' },
    { vendor: 'copilot', family: 'gpt-4' },
    { vendor: 'copilot' }
  ];
}
