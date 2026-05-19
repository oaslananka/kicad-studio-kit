import { ClaudeProvider } from '../../src/ai/claudeProvider';
import { CopilotProvider } from '../../src/ai/copilotProvider';
import { OpenAIProvider } from '../../src/ai/openaiProvider';
import { lm } from './vscodeMock';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('AI providers', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
    delete (lm as { selectChatModels?: unknown }).selectChatModels;
  });

  it('uses OpenAI Responses payloads by default', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ output_text: 'analysis' }));

    const provider = new OpenAIProvider('key', 'gpt-4.1');
    const result = await provider.analyze('Explain', '(kicad_sch)', 'system');

    expect(result).toBe('analysis');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init.body)) as {
      input: Array<{
        role: string;
        content: Array<{ type: string; text: string }>;
      }>;
    };
    expect(body.input.at(0)?.content.at(0)).toEqual({
      type: 'input_text',
      text: 'system'
    });
    expect(body.input.at(1)?.content.at(0)?.text).toContain('(kicad_sch)');
  });

  it('supports OpenAI Chat Completions compatibility mode', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'chat analysis' } }] })
    );

    const provider = new OpenAIProvider('key', 'gpt-4.1', 'chat-completions');
    const result = await provider.analyze('Explain', 'context', 'system');

    expect(result).toBe('chat analysis');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]).toEqual({ role: 'system', content: 'system' });
  });

  it('surfaces OpenAI rate limit details', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'slow down' } }, 429)
    );

    const provider = new OpenAIProvider('key', 'gpt-4.1');

    await expect(
      provider.analyze('Explain', 'context', 'system')
    ).rejects.toThrow('OpenAI rate limit reached');
  });

  it('parses Claude text responses', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ content: [{ type: 'text', text: 'claude analysis' }] })
    );

    const provider = new ClaudeProvider('key', 'claude-sonnet-4-6');
    const result = await provider.analyze('Explain', 'context', 'system');

    expect(result).toBe('claude analysis');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(String(init.body)) as {
      system: string;
      messages: Array<{ content: string }>;
    };
    expect(body.system).toBe('system');
    expect(body.messages.at(0)?.content).toContain('context');
  });

  it('streams Copilot language model chunks through the VS Code LM API', async () => {
    const provider = new CopilotProvider();
    const model = {
      sendRequest: jest.fn().mockResolvedValue({
        text: streamChunks(['alpha ', 'beta'])
      })
    };
    (lm as { selectChatModels?: jest.Mock }).selectChatModels = jest
      .fn()
      .mockResolvedValue([model]);
    const chunks: string[] = [];

    await provider.analyzeStream('Explain', 'context', 'system', (chunk) =>
      chunks.push(chunk)
    );

    expect(
      (lm as unknown as { selectChatModels: jest.Mock }).selectChatModels
    ).toHaveBeenCalledWith({ vendor: 'copilot', family: 'gpt-4o' });
    expect(chunks).toEqual(['alpha ', 'beta']);
    expect(model.sendRequest).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('Context:\ncontext')
      })
    ]);
  });
});

async function* streamChunks(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}
