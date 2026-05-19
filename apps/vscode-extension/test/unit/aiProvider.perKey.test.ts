import { AIProviderRegistry } from '../../src/ai/aiProvider';
import { AI_SECRET_KEY_LEGACY } from '../../src/constants';
import { getAiSecretKey } from '../../src/utils/secrets';
import { __setConfiguration, createExtensionContextMock } from './vscodeMock';

describe('AIProviderRegistry per-provider keys', () => {
  beforeEach(() => {
    __setConfiguration({});
  });

  it('stores, reads, checks, and clears provider-specific keys', async () => {
    const context = createExtensionContextMock();
    const registry = new AIProviderRegistry(context as never);

    await registry.setApiKey('openai', 'openai-key');

    await expect(registry.getApiKey('openai')).resolves.toBe('openai-key');
    await expect(registry.hasApiKey('openai')).resolves.toBe(true);
    await expect(registry.hasApiKey('claude')).resolves.toBe(false);

    await registry.clearApiKey('openai');

    await expect(registry.hasApiKey('openai')).resolves.toBe(false);
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
});
