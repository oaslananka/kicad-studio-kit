import { AIProviderRegistry } from '../../src/ai/aiProvider';
import { AI_SECRET_KEY_LEGACY, SETTINGS } from '../../src/constants';
import { getAiSecretKey } from '../../src/utils/secrets';
import { __setConfiguration, createExtensionContextMock } from './vscodeMock';

describe('AIProviderRegistry per-provider keys', () => {
  beforeEach(() => {
    __setConfiguration({});
  });

  it('stores, reads, checks, and clears provider-specific keys', async () => {
    const context = createExtensionContextMock();
    const registry = new AIProviderRegistry(context as never);

    await registry.setApiKey('openrouter', 'openrouter-key');

    await expect(registry.getApiKey('openrouter')).resolves.toBe(
      'openrouter-key'
    );
    await expect(registry.hasApiKey('openrouter')).resolves.toBe(true);
    await expect(registry.hasApiKey('claude')).resolves.toBe(false);

    await registry.clearApiKey('openrouter');

    await expect(registry.hasApiKey('openrouter')).resolves.toBe(false);
  });

  it('stores NVIDIA keys independently and never steals the legacy shared key', async () => {
    const context = createExtensionContextMock();
    await context.secrets.store(AI_SECRET_KEY_LEGACY, 'old-openai-key');
    const registry = new AIProviderRegistry(context as never);

    await expect(
      registry.getProviderForSelection('nvidia')
    ).resolves.toBeUndefined();
    await expect(context.secrets.get(AI_SECRET_KEY_LEGACY)).resolves.toBe(
      'old-openai-key'
    );
    await expect(
      context.secrets.get(getAiSecretKey('nvidia'))
    ).resolves.toBeUndefined();

    await registry.setApiKey('nvidia', 'nvapi-independent-secret');
    await expect(registry.hasApiKey('nvidia')).resolves.toBe(true);
    const provider = await registry.getProviderForSelection(
      'nvidia',
      'new-model/custom'
    );
    expect(provider?.name).toBe('NVIDIA Build');
    expect(registry.getDefaultModel('nvidia')).toBe(
      'nvidia/nemotron-3-super-120b-a12b'
    );
    expect(registry.isKeyedProvider('nvidia')).toBe(true);

    await registry.clearApiKey('nvidia');
    await expect(registry.hasApiKey('nvidia')).resolves.toBe(false);
    await expect(context.secrets.get(AI_SECRET_KEY_LEGACY)).resolves.toBe(
      'old-openai-key'
    );
  });

  it('migrates the legacy shared key only to the selected provider secret', async () => {
    const context = createExtensionContextMock();
    await context.secrets.store(AI_SECRET_KEY_LEGACY, 'legacy-key');
    const registry = new AIProviderRegistry(context as never);

    await expect(registry.getApiKey('gemini')).resolves.toBe('legacy-key');

    await expect(context.secrets.get(getAiSecretKey('gemini'))).resolves.toBe(
      'legacy-key'
    );
    await expect(
      context.secrets.get(AI_SECRET_KEY_LEGACY)
    ).resolves.toBeUndefined();
    await expect(
      context.secrets.get(getAiSecretKey('openai'))
    ).resolves.toBeUndefined();
  });

  it('uses the OpenAI gpt-5 default and Gemini provider key', async () => {
    const context = createExtensionContextMock();
    const registry = new AIProviderRegistry(context as never);
    await registry.setApiKey('openai', 'openai-key');
    await registry.setApiKey('gemini', 'gemini-key');

    const openai = await registry.getProviderForSelection('openai');
    const gemini = await registry.getProviderForSelection('gemini');

    expect(openai?.name).toBe('OpenAI');
    expect(gemini?.name).toBe('Gemini');
    expect(registry.getDefaultModel('openai')).toBe('gpt-5');
  });

  it('handles provider selection branches without leaking shared keys', async () => {
    const context = createExtensionContextMock();
    const registry = new AIProviderRegistry(context as never);

    await expect(
      registry.getProviderForSelection('none')
    ).resolves.toBeUndefined();
    await expect(
      registry.getProviderForSelection('unknown')
    ).resolves.toBeUndefined();
    await expect(
      registry.getProviderForSelection('claude')
    ).resolves.toBeUndefined();
    await expect(
      registry.getProviderForSelection('openai')
    ).resolves.toBeUndefined();
    await expect(
      registry.getProviderForSelection('gemini')
    ).resolves.toBeUndefined();

    await registry.setApiKey('claude', 'claude-key');
    const claude = await registry.getProviderForSelection(
      'claude',
      'claude-opus-4-5'
    );
    const copilot = await registry.getProviderForSelection('copilot');

    expect(claude?.name).toBe('Claude');
    expect(copilot?.name).toBe('GitHub Copilot');
    expect(registry.getDefaultModel('gemini')).toBe('gemini-2.5-pro');
    expect(registry.getDefaultModel('missing')).toBe('');
    expect(registry.isKeyedProvider('openai')).toBe(true);
    expect(registry.isKeyedProvider('copilot')).toBe(false);

    await context.secrets.store(AI_SECRET_KEY_LEGACY, 'legacy-key');
    await registry.clearAllApiKeys();

    await expect(
      context.secrets.get(getAiSecretKey('claude'))
    ).resolves.toBeUndefined();
    await expect(
      context.secrets.get(AI_SECRET_KEY_LEGACY)
    ).resolves.toBeUndefined();
  });

  it('selects OpenRouter and falls back when local configuration is absent', async () => {
    const context = createExtensionContextMock();
    const registry = new AIProviderRegistry(context as never);
    await registry.setApiKey('openrouter', 'openrouter-key');

    const openRouter = await registry.getProviderForSelection('openrouter');
    const missingLocal = await registry.getProviderForSelection('local');

    __setConfiguration({
      [SETTINGS.aiLocalEndpoint]: 'http://127.0.0.1:11434/v1'
    });
    const local = await registry.getProviderForSelection('local', 'qwen3');

    expect(openRouter?.name).toBe('OpenRouter');
    expect(openRouter?.capabilities).toEqual(
      expect.objectContaining({
        supportsStreaming: true,
        requiresApiKey: true
      })
    );
    expect(missingLocal).toBeUndefined();
    expect(local?.name).toBe('Local');
    expect(local?.capabilities).toEqual(
      expect.objectContaining({
        supportsStreaming: true,
        requiresApiKey: false
      })
    );
    expect(registry.isKeyedProvider('openrouter')).toBe(true);
    expect(registry.isKeyedProvider('local')).toBe(false);
  });
});
