import {
  MODEL_CATALOG,
  getDefaultModel,
  getProviderModels,
  getRecommendedModel
} from '../../src/ai/modelCatalog';

describe('AI model catalog', () => {
  it('uses gpt-5 as the recommended OpenAI default', () => {
    expect(getDefaultModel('openai')).toBe('gpt-5');
    expect(getRecommendedModel('openai')).toEqual(
      expect.objectContaining({
        id: 'gpt-5',
        provider: 'openai',
        recommended: true
      })
    );
  });

  it('lists provider-specific model metadata', () => {
    expect(getProviderModels('gemini')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gemini-2.5-pro',
          provider: 'gemini',
          default: true
        })
      ])
    );
  });

  it('does not advertise Codex as a direct extension model provider', () => {
    expect(Object.keys(MODEL_CATALOG)).not.toContain('codex');
    expect(() => getProviderModels('codex' as never)).toThrow();
  });
});
