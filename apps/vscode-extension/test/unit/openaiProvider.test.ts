import { AI_MAX_TOKENS } from '../../src/constants';
import { AIStreamAbortedError } from '../../src/errors';
import { OpenAIProvider } from '../../src/ai/openaiProvider';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' }
  });
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      }
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    }
  );
}

describe('OpenAIProvider', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  it('streams response deltas in Responses API mode', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'data: {"type":"response.output_text.delta","delta":"Hello "}\n\n',
        'data: {"type":"text.delta","text":"world"}\n\n',
        'data: [DONE]\n\n'
      ])
    );

    const provider = new OpenAIProvider('key', 'gpt-4.1');
    const chunks: string[] = [];

    await provider.analyzeStream?.('Explain', 'context', 'system', (text) =>
      chunks.push(text)
    );

    expect(chunks).toEqual(['Hello ', 'world']);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      max_output_tokens: number;
      stream: boolean;
    };
    expect(body.max_output_tokens).toBe(AI_MAX_TOKENS);
    expect(body.stream).toBe(true);
  });

  it('streams chat completion deltas in compatibility mode', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"I"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    );

    const provider = new OpenAIProvider('key', 'gpt-4.1', 'chat-completions');
    const chunks: string[] = [];

    await provider.analyzeStream?.('Explain', 'context', 'system', (text) =>
      chunks.push(text)
    );

    expect(chunks.join('')).toBe('AI');
  });

  it('aborts an in-flight stream when the signal fires', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n'
              )
            );
            init?.signal?.addEventListener('abort', () => {
              controller.error(
                init.signal?.reason ?? new AIStreamAbortedError()
              );
            });
          }
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    });

    const provider = new OpenAIProvider('key', 'gpt-4.1');
    const controller = new AbortController();
    const promise = provider.analyzeStream?.(
      'Explain',
      'context',
      'system',
      () => undefined,
      controller.signal
    );

    controller.abort(new AIStreamAbortedError());

    await expect(promise).rejects.toThrow('AI stream was cancelled');
  });

  it('throws a configuration error when no API key is present', async () => {
    const provider = new OpenAIProvider('', 'gpt-4.1');

    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).rejects.toThrow('AI provider not configured');
  });

  it('returns a fallback message when the Responses API payload is empty', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ output: [{ content: [] }] }));

    const provider = new OpenAIProvider('key', 'gpt-4.1');

    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).resolves.toBe('No response from OpenAI.');
  });

  it('uses AI_MAX_TOKENS in chat-completions requests', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    );

    const provider = new OpenAIProvider('key', 'gpt-4.1', 'chat-completions');
    await provider.analyze('Explain', 'context', 'system');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      max_completion_tokens: number;
    };
    expect(body.max_completion_tokens).toBe(AI_MAX_TOKENS);
  });

  it('formats auth and server errors with helpful messages', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'bad key' } }, 401)
      )
      .mockResolvedValueOnce(textResponse('gateway failure', 500));

    const provider = new OpenAIProvider('key', 'gpt-4.1');

    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).rejects.toThrow('OpenAI authentication failed');
    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).rejects.toThrow('OpenAI service returned a server error');
  });

  it('reports failed testConnection attempts with latency and message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'slow down' } }, 429)
    );
    const provider = new OpenAIProvider('key', 'gpt-4.1');

    const result = await provider.testConnection();

    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toContain('OpenAI rate limit reached');
  });
});
