import { AI_MAX_TOKENS } from '../../src/constants';
import { NvidiaBuildProvider } from '../../src/ai/nvidiaBuildProvider';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function streamResponse(): Response {
  return new Response(
    [
      'data: {"choices":[{"delta":{"reasoning_content":"private steps"}}]}',
      'data: {"choices":[{"delta":{"content":"DRC "}}]}',
      'data: {"choices":[{"delta":{"content":"check passed"}}]}',
      'data: [DONE]'
    ].join('\n\n'),
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
}

describe('NVIDIA Build cloud chat provider', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;
  const key = 'nvapi-' + 'a'.repeat(24);

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  it('uses the hosted HTTPS endpoint, Bearer key, NVIDIA max_tokens and custom model', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'manufacturing risk' } }]
      })
    );
    const provider = new NvidiaBuildProvider(key, 'vendor/new-catalog-model');
    const reply = await provider.analyze(
      'Explain',
      'clearance rules',
      'system'
    );

    expect(reply).toBe('manufacturing risk');
    expect(provider.name).toBe('NVIDIA Build');
    expect(provider.capabilities).toEqual({
      requiresApiKey: true,
      supportsStreaming: true
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'vendor/new-catalog-model',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'Explain\n\nContext:\nclearance rules' }
      ]
    });
    expect(Object.keys(body).sort()).toEqual(
      ['max_tokens', 'messages', 'model'].sort()
    );
    expect(body['max_tokens']).toBe(AI_MAX_TOKENS);
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('input');
  });

  it('streams only visible answer content and caps output tokens', async () => {
    fetchMock.mockResolvedValue(streamResponse());
    const provider = new NvidiaBuildProvider(
      key,
      'nvidia/nemotron-3-super-120b-a12b'
    );
    const chunks: string[] = [];

    await provider.analyzeStream('Inspect', 'board', undefined, (chunk) =>
      chunks.push(chunk)
    );

    expect(chunks.join('')).toBe('DRC check passed');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body['stream']).toBe(true);
    expect(body['max_tokens']).toBe(AI_MAX_TOKENS);
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('api_key');
  });

  it('never sends a request without a key', async () => {
    const provider = new NvidiaBuildProvider(
      '',
      'nvidia/nemotron-3-super-120b-a12b'
    );
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.analyze('Explain', 'context')).rejects.toThrow(
      'AI provider not configured'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts the known API key and handles auth and quota errors', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'invalid key ' + key } }, 401)
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'credits exceeded' } }, 429)
      );
    const provider = new NvidiaBuildProvider(key, 'openai/gpt-oss-20b');

    await expect(provider.analyze('Explain', 'context')).rejects.toThrow(
      'NVIDIA Build authentication failed'
    );
    try {
      await provider.analyze('Explain', 'context');
      throw new Error('expected rate limit rejection');
    } catch (error) {
      expect(String(error)).toContain('NVIDIA Build rate limit');
      expect(String(error)).not.toContain(key);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports connection status without exposing credentials', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'token ' + key + ' expired' } }, 401)
    );
    const result = await new NvidiaBuildProvider(
      key,
      'openai/gpt-oss-20b'
    ).testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain(key);
  });
});
