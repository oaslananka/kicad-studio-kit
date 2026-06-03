import { LocalProvider } from '../../src/ai/localProvider';
import { OpenAIProvider } from '../../src/ai/openaiProvider';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

jest.mock('../../src/ai/openaiProvider');

describe('LocalProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extends OpenAIProvider with empty apiKey', () => {
    new LocalProvider('http://localhost:8080', 'test-model');
    expect(OpenAIProvider).toHaveBeenCalledWith(
      '',
      'test-model',
      'chat-completions',
      {
        chatCompletionsUrl: 'http://localhost:8080/chat/completions',
        name: 'Local',
        requiresApiKey: false
      }
    );
  });

  it('normalizes endpoint URL without /chat/completions', () => {
    new LocalProvider('http://localhost:8080/v1', 'model');
    expect(OpenAIProvider).toHaveBeenCalledWith(
      '',
      'model',
      'chat-completions',
      expect.objectContaining({
        chatCompletionsUrl: 'http://localhost:8080/v1/chat/completions'
      })
    );
  });

  it('does not double-add /chat/completions when already present', () => {
    new LocalProvider('http://localhost:8080/chat/completions', 'model');
    expect(OpenAIProvider).toHaveBeenCalledWith(
      '',
      'model',
      'chat-completions',
      expect.objectContaining({
        chatCompletionsUrl: 'http://localhost:8080/chat/completions'
      })
    );
  });

  it('trims trailing slashes from the endpoint', () => {
    new LocalProvider('http://localhost:8080/v1///', 'model');
    expect(OpenAIProvider).toHaveBeenCalledWith(
      '',
      'model',
      'chat-completions',
      expect.objectContaining({
        chatCompletionsUrl: 'http://localhost:8080/v1/chat/completions'
      })
    );
  });
});
