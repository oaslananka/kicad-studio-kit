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

interface ClaudeMessageBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{
    role: 'user';
    content: string;
  }>;
  stream?: boolean;
}

interface ClaudeResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface ClaudeStreamDelta {
  delta?: {
    text?: string;
  };
  type?: string;
}

interface ClaudeErrorResponse {
  error?: {
    message?: string;
    type?: string;
  };
}

/**
 * Anthropic Claude provider for KiCad analysis requests.
 */
export class ClaudeProvider implements AIProvider {
  readonly name = 'Claude';

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async analyze(
    prompt: string,
    context: string,
    systemPrompt = buildSystemPrompt(DEFAULT_AI_LANGUAGE)
  ): Promise<string> {
    const response = await this.request(
      this.buildRequestBody(prompt, context, systemPrompt),
      undefined
    );
    const json = (await response.json()) as ClaudeResponse;
    return (
      json.content
        ?.map((item) => item.text)
        .filter((text): text is string => Boolean(text?.trim()))
        .join('\n\n')
        .trim() || 'No response from Claude.'
    );
  }

  async analyzeStream(
    prompt: string,
    context: string,
    systemPrompt: string | undefined,
    onChunk: (text: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await this.request(
      {
        ...this.buildRequestBody(
          prompt,
          context,
          systemPrompt ?? buildSystemPrompt(DEFAULT_AI_LANGUAGE)
        ),
        stream: true
      },
      signal
    );

    await readEventStream(response, async (eventName, payload) => {
      if (!payload || payload === '[DONE]') {
        return;
      }
      if (eventName === 'message_stop') {
        return;
      }
      let parsed: ClaudeStreamDelta;
      try {
        parsed = JSON.parse(payload) as ClaudeStreamDelta;
      } catch {
        return;
      }
      if (parsed.delta?.text) {
        onChunk(parsed.delta.text);
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

  private buildRequestBody(
    prompt: string,
    context: string,
    systemPrompt: string
  ): ClaudeMessageBody {
    return {
      model: this.model,
      max_tokens: AI_MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\nContext:\n${context}`
        }
      ]
    };
  }

  private async request(
    body: ClaudeMessageBody,
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
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: managedSignal.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
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
        : new Error('Claude request failed due to an unknown network error.', {
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
      const parsed = JSON.parse(bodyText) as ClaudeErrorResponse;
      apiMessage = parsed.error?.message || parsed.error?.type || apiMessage;
    } catch {
      // Preserve non-JSON body text.
    }

    const prefix =
      response.status === 401
        ? 'Claude authentication failed. Check the stored API key.'
        : response.status === 429
          ? 'Claude rate limit reached. Wait and try again, or choose a different model.'
          : response.status >= 500
            ? 'Claude service returned a server error.'
            : `Claude request failed with HTTP ${response.status}.`;
    return apiMessage
      ? `${prefix} ${redactApiKey(apiMessage, this.apiKey)}`
      : prefix;
  }
}
