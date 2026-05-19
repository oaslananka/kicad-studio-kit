import { AI_MAX_TOKENS } from '../../src/constants';
import { AIStreamAbortedError } from '../../src/errors';
import { ClaudeProvider } from '../../src/ai/claudeProvider';

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

describe('ClaudeProvider streaming', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  it('calls onChunk for each delta text event', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'event: content_block_delta\ndata: {"delta":{"text":"Hello "}}\n\n',
        'event: content_block_delta\ndata: {"delta":{"text":"world"}}\n\n',
        'event: message_stop\ndata: {}\n\n'
      ])
    );

    const provider = new ClaudeProvider('key', 'claude-sonnet-4-6');
    const chunks: string[] = [];

    await provider.analyzeStream?.('Explain', 'context', 'system', (text) =>
      chunks.push(text)
    );

    expect(chunks).toEqual(['Hello ', 'world']);
  });

  it('aborts when signal is fired', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'event: content_block_delta\ndata: {"delta":{"text":"Hello"}}\n\n'
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

    const provider = new ClaudeProvider('key', 'claude-sonnet-4-6');
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

  it('throws on 401 with auth message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'bad key' } }, 401)
    );
    const provider = new ClaudeProvider('key', 'claude-sonnet-4-6');
    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).rejects.toThrow('Claude authentication failed');
  });

  it('throws on 429 with rate limit message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'slow down' } }, 429)
    );
    const provider = new ClaudeProvider('key', 'claude-sonnet-4-6');
    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).rejects.toThrow('Claude rate limit reached');
  });

  it('handles empty content array gracefully', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: [] }));
    const provider = new ClaudeProvider('key', 'claude-sonnet-4-6');
    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).resolves.toBe('No response from Claude.');
  });

  it('uses AI_MAX_TOKENS=4096 in request body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: [{ text: 'ok' }] }));
    const provider = new ClaudeProvider('key', 'claude-sonnet-4-6');
    await provider.analyze('Explain', 'context', 'system');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { max_tokens: number };
    expect(body.max_tokens).toBe(AI_MAX_TOKENS);
  });
});
