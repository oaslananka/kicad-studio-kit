import {
  createLanguageModelTextPart,
  createLanguageModelToolResult,
  createMarkdownString,
  flattenLanguageModelMessages,
  estimateLanguageModelTokens
} from '../../src/lm/api';

describe('language model API helpers', () => {
  it('creates VS Code-compatible wrapper objects when constructors are available', () => {
    const textPart = createLanguageModelTextPart('hello') as { value: string };
    const result = createLanguageModelToolResult([textPart]) as {
      content: unknown[];
    };
    const markdown = createMarkdownString('**hello**') as { value: string };

    expect(textPart.value).toBe('hello');
    expect(result.content).toHaveLength(1);
    expect(markdown.value).toBe('**hello**');
  });

  it('flattens chat request messages into a readable transcript', () => {
    const transcript = flattenLanguageModelMessages([
      {
        role: 'user',
        content: [{ value: 'Run DRC' }]
      },
      {
        role: 'assistant',
        content: [{ text: 'Working on it.' }]
      }
    ]);

    expect(transcript).toContain('user: Run DRC');
    expect(transcript).toContain('assistant: Working on it.');
  });

  it('estimates token counts from strings and structured messages', () => {
    expect(estimateLanguageModelTokens('abcd')).toBe(1);
    expect(
      estimateLanguageModelTokens({
        role: 'user',
        content: [{ value: 'abcdefgh' }]
      })
    ).toBeGreaterThanOrEqual(2);
  });
});
