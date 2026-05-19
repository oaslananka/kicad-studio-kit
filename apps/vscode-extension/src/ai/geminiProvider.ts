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

interface GeminiContentPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiContentPart[];
    };
  }>;
}

interface GeminiErrorResponse {
  error?: {
    message?: string;
    status?: string;
  };
}

export class GeminiProvider implements AIProvider {
  readonly name = 'Gemini';

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
      'generateContent',
      this.buildRequestBody(prompt, context, systemPrompt)
    );
    const json = (await response.json()) as GeminiResponse;
    return this.extractText(json) || 'No response from Gemini.';
  }

  async analyzeStream(
    prompt: string,
    context: string,
    systemPrompt: string | undefined,
    onChunk: (text: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await this.request(
      'streamGenerateContent',
      this.buildRequestBody(
        prompt,
        context,
        systemPrompt ?? buildSystemPrompt(DEFAULT_AI_LANGUAGE)
      ),
      signal,
      true
    );

    await readEventStream(response, async (_eventName, payload) => {
      if (!payload || payload === '[DONE]') {
        return;
      }
      try {
        const parsed = JSON.parse(payload) as GeminiResponse;
        const text = this.extractText(parsed, false);
        if (text) {
          onChunk(text);
        }
      } catch {
        // Ignore malformed stream chunks.
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
  ): unknown {
    return {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `${prompt}\n\nContext:\n${context}` }]
        }
      ],
      generationConfig: {
        maxOutputTokens: AI_MAX_TOKENS
      }
    };
  }

  private async request(
    method: 'generateContent' | 'streamGenerateContent',
    body: unknown,
    signal?: AbortSignal,
    stream = false
  ): Promise<Response> {
    if (!this.isConfigured()) {
      throw new AIProviderNotConfiguredError();
    }

    const managedSignal = createManagedAbortSignal(
      this.name,
      AI_STREAM_TIMEOUT_MS,
      signal
    );
    const model = encodeURIComponent(this.model);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}${stream ? '?alt=sse' : ''}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: managedSignal.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey
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
        : new Error('Gemini request failed due to an unknown network error.', {
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
      const parsed = JSON.parse(bodyText) as GeminiErrorResponse;
      apiMessage = parsed.error?.message || parsed.error?.status || apiMessage;
    } catch {
      // Preserve raw body text when it is not JSON.
    }

    const prefix =
      response.status === 401 || response.status === 403
        ? 'Gemini authentication failed. Check the stored API key.'
        : response.status === 429
          ? 'Gemini rate limit reached. Wait and try again, or choose a different model.'
          : response.status >= 500
            ? 'Gemini service returned a server error.'
            : `Gemini request failed with HTTP ${response.status}.`;
    return apiMessage
      ? `${prefix} ${redactApiKey(apiMessage, this.apiKey)}`
      : prefix;
  }

  private extractText(response: GeminiResponse, trim = true): string {
    const text =
      response.candidates
        ?.flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => part.text)
        .filter((text): text is string => Boolean(text?.trim()))
        .join('\n') ?? '';
    return trim ? text.trim() : text;
  }
}
