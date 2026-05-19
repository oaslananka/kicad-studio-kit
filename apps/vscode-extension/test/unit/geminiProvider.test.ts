import { AI_MAX_TOKENS } from '../../src/constants';
import { AIStreamAbortedError } from '../../src/errors';
import { GeminiProvider } from '../../src/ai/geminiProvider';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
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

describe('GeminiProvider', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  it('calls the Gemini REST generateContent endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: 'gemini analysis' }] } }]
      })
    );

    const provider = new GeminiProvider(
      'AIzaSyExampleSecret123456',
      'gemini-2.5-pro'
    );
    const result = await provider.analyze('Explain', 'context', 'system');

    expect(result).toBe('gemini analysis');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
    );
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'AIzaSyExampleSecret123456'
    );
    const body = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: Array<{ text: string }> };
      generationConfig: { maxOutputTokens: number };
    };
    expect(body.systemInstruction.parts[0]?.text).toBe('system');
    expect(body.generationConfig.maxOutputTokens).toBe(AI_MAX_TOKENS);
  });

  it('reports configuration and empty model responses', async () => {
    const unconfigured = new GeminiProvider('', 'gemini-2.5-pro');
    expect(unconfigured.isConfigured()).toBe(false);
    await expect(
      unconfigured.analyze('Explain', 'context', 'system')
    ).rejects.toThrow(/not configured/);

    fetchMock.mockResolvedValue(jsonResponse({ candidates: [] }));
    const provider = new GeminiProvider('key', 'gemini-2.5-pro');

    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).resolves.toBe('No response from Gemini.');
  });

  it('streams Gemini SSE chunks', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n',
        'data: not-json\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":""}]}}]}\n\n',
        'data: [DONE]\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"world"}]}}]}\n\n'
      ])
    );

    const provider = new GeminiProvider('key', 'gemini-2.0-flash');
    const chunks: string[] = [];

    await provider.analyzeStream('Explain', 'context', 'system', (text) =>
      chunks.push(text)
    );

    expect(chunks).toEqual(['Hello ', 'world']);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse'
    );
  });

  it('maps Gemini HTTP status branches to user-facing errors', async () => {
    const provider = new GeminiProvider('key', 'gemini-2.5-pro');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { status: 'RATE_LIMIT' } }, 429)
    );
    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).rejects.toThrow(/rate limit/);

    fetchMock.mockResolvedValueOnce(
      new Response('server down', { status: 503 })
    );
    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).rejects.toThrow(/server error/);

    fetchMock.mockResolvedValueOnce(new Response('', { status: 400 }));
    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).rejects.toThrow(/HTTP 400/);
  });

  it('returns connection test latency and redacted failures', async () => {
    const provider = new GeminiProvider(
      'AIzaSyExampleSecret123456',
      'gemini-2.5-pro'
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: 'OK' }] } }]
      })
    );
    await expect(provider.testConnection()).resolves.toEqual(
      expect.objectContaining({ ok: true })
    );

    fetchMock.mockRejectedValueOnce(
      new Error('network AIzaSyExampleSecret123456')
    );
    await expect(provider.testConnection()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining('AIza...3456')
      })
    );
  });

  it('redacts API keys from error messages', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'bad AIzaSyExampleSecret123456' } }, 403)
    );

    const provider = new GeminiProvider(
      'AIzaSyExampleSecret123456',
      'gemini-2.5-pro'
    );

    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).rejects.toThrow(/AIza\.\.\.3456/);
  });

  it('aborts an in-flight stream when the signal fires', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n'
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

    const provider = new GeminiProvider('key', 'gemini-2.5-pro');
    const controller = new AbortController();
    const promise = provider.analyzeStream(
      'Explain',
      'context',
      'system',
      () => undefined,
      controller.signal
    );

    controller.abort(new AIStreamAbortedError());

    await expect(promise).rejects.toThrow('AI stream was cancelled');
  });
});
