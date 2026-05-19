import { AI_MAX_TOKENS, AI_STREAM_TIMEOUT_MS } from '../constants';
import {
  AIHttpError,
  AIProviderNotConfiguredError,
  AIRequestTimeoutError,
  AIStreamAbortedError
} from '../errors';
import type { AIConnectionResult, AIProvider } from '../types';
import { redactApiKey } from '../utils/secrets';
import { buildSystemPrompt, DEFAULT_AI_LANGUAGE } from './prompts';
import { createManagedAbortSignal, readEventStream } from './providerUtils';

export type OpenAIApiMode = 'responses' | 'chat-completions';

interface OpenAITextPart {
  text?: string;
}

interface OpenAIResponsesEntry {
  content?: OpenAITextPart[];
}

interface OpenAIResponsesResponse {
  output_text?: string | string[];
  output?: OpenAIResponsesEntry[];
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface OpenAIErrorResponse {
  error?: {
    message?: string;
    type?: string;
  };
}

interface OpenAIStreamEvent {
  type?: string;
  delta?: string;
  text?: string;
}

/**
 * OpenAI provider for KiCad analysis requests.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'OpenAI';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly mode: OpenAIApiMode = 'responses'
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async analyze(
    prompt: string,
    context: string,
    systemPrompt = buildSystemPrompt(DEFAULT_AI_LANGUAGE)
  ): Promise<string> {
    return this.mode === 'chat-completions'
      ? this.analyzeWithChatCompletions(prompt, context, systemPrompt)
      : this.analyzeWithResponses(prompt, context, systemPrompt);
  }

  async analyzeStream(
    prompt: string,
    context: string,
    systemPrompt: string | undefined,
    onChunk: (text: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (this.mode === 'chat-completions') {
      const response = await this.request(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          stream: true,
          messages: [
            {
              role: 'system',
              content: systemPrompt ?? buildSystemPrompt(DEFAULT_AI_LANGUAGE)
            },
            { role: 'user', content: this.buildUserMessage(prompt, context) }
          ]
        },
        signal
      );
      await readEventStream(response, async (_eventName, payload) => {
        if (!payload || payload === '[DONE]') {
          return;
        }
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            onChunk(delta);
          }
        } catch {
          // Ignore malformed chunks.
        }
      });
      return;
    }

    const response = await this.request(
      'https://api.openai.com/v1/responses',
      {
        model: this.model,
        max_output_tokens: AI_MAX_TOKENS,
        stream: true,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: systemPrompt ?? buildSystemPrompt(DEFAULT_AI_LANGUAGE)
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: this.buildUserMessage(prompt, context)
              }
            ]
          }
        ]
      },
      signal
    );

    await readEventStream(response, async (_eventName, payload) => {
      if (!payload || payload === '[DONE]') {
        return;
      }
      let parsed: OpenAIStreamEvent;
      try {
        parsed = JSON.parse(payload) as OpenAIStreamEvent;
      } catch {
        return;
      }
      if (
        parsed.type === 'response.output_text.delta' ||
        parsed.type === 'text.delta' ||
        parsed.type?.endsWith('.delta')
      ) {
        const delta = parsed.delta ?? parsed.text ?? '';
        if (delta) {
          onChunk(delta);
        }
      }
    });
  }

  async testConnection(): Promise<AIConnectionResult> {
    const startedAt = Date.now();
    try {
      await this.analyze(
        'Reply with the single word OK.',
        'Connectivity test from KiCad Studio.',
        buildSystemPrompt(DEFAULT_AI_LANGUAGE)
      );
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async analyzeWithResponses(
    prompt: string,
    context: string,
    systemPrompt: string
  ): Promise<string> {
    const response = await this.request('https://api.openai.com/v1/responses', {
      model: this.model,
      max_output_tokens: AI_MAX_TOKENS,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }]
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: this.buildUserMessage(prompt, context) }
          ]
        }
      ]
    });

    const json = (await response.json()) as OpenAIResponsesResponse;
    if (Array.isArray(json.output_text)) {
      return json.output_text.join('\n').trim() || 'No response from OpenAI.';
    }
    if (typeof json.output_text === 'string') {
      return json.output_text.trim() || 'No response from OpenAI.';
    }

    const output = json.output
      ?.flatMap((entry) => entry.content ?? [])
      .map((part) => part.text)
      .filter((text): text is string => Boolean(text?.trim()))
      .join('\n');
    return output?.trim() || 'No response from OpenAI.';
  }

  private async analyzeWithChatCompletions(
    prompt: string,
    context: string,
    systemPrompt: string
  ): Promise<string> {
    const response = await this.request(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.model,
        // Newer OpenAI models (gpt-4.5, gpt-5, gpt-5-mini, o-series) require
        // max_completion_tokens instead of the deprecated max_tokens parameter.
        max_completion_tokens: AI_MAX_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: this.buildUserMessage(prompt, context) }
        ]
      }
    );

    const json = (await response.json()) as OpenAIChatResponse;
    return (
      json.choices?.[0]?.message?.content?.trim() || 'No response from OpenAI.'
    );
  }

  private async request(
    url: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<Response> {
    if (!this.isConfigured()) {
      throw new AIProviderNotConfiguredError();
    }

    const managedSignal = createManagedAbortSignal(
      this.name,
      AI_STREAM_TIMEOUT_MS,
      signal
    );
    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: managedSignal.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new AIHttpError(await this.formatHttpError(response));
      }

      return response;
    } catch (error) {
      if (managedSignal.wasTimeoutTriggered()) {
        throw new AIRequestTimeoutError(this.name, AI_STREAM_TIMEOUT_MS);
      }
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new AIStreamAbortedError();
      }
      if (error instanceof AIHttpError) {
        throw error;
      }
      if (
        error instanceof AIRequestTimeoutError ||
        error instanceof AIStreamAbortedError
      ) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AIRequestTimeoutError(this.name, AI_STREAM_TIMEOUT_MS);
      }
      throw error instanceof Error
        ? new Error(redactApiKey(error.message, this.apiKey), { cause: error })
        : new Error('OpenAI request failed due to an unknown network error.', {
            cause: error
          });
    } finally {
      managedSignal.cleanup();
    }
  }

  private async formatHttpError(response: Response): Promise<string> {
    const bodyText = redactApiKey(
      await response.text().catch(() => ''),
      this.apiKey
    );
    let apiMessage = bodyText.trim();
    try {
      const parsed = JSON.parse(bodyText) as OpenAIErrorResponse;
      apiMessage = parsed.error?.message || parsed.error?.type || apiMessage;
    } catch {
      // Preserve raw body text when it is not JSON.
    }

    const prefix =
      response.status === 401
        ? 'OpenAI authentication failed. Check the stored API key.'
        : response.status === 429
          ? 'OpenAI rate limit reached. Wait and try again, or choose a different model.'
          : response.status >= 500
            ? 'OpenAI service returned a server error.'
            : `OpenAI request failed with HTTP ${response.status}.`;
    return apiMessage
      ? `${prefix} ${redactApiKey(apiMessage, this.apiKey)}`
      : prefix;
  }

  private buildUserMessage(prompt: string, context: string): string {
    return `${prompt}\n\nContext:\n${context}`;
  }
}
