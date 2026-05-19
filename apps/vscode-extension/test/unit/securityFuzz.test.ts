import fc from 'fast-check';
import { SExpressionParser } from '../../src/language/sExpressionParser';
import { redactApiKey } from '../../src/utils/secrets';

describe('security fuzz checks', () => {
  it('parses arbitrary short S-expression-like input without throwing', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 512 }), (source) => {
        const parser = new SExpressionParser();
        const root = parser.parse(source);

        expect(root.type).toBe('list');
        expect(Array.isArray(parser.getErrors(root))).toBe(true);
      }),
      { numRuns: 250 }
    );
  });

  it('redacts arbitrary API-key-like tokens without leaking the original token', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/sk-[A-Za-z0-9_-]{16,64}/),
        fc.string({ maxLength: 256 }),
        fc.string({ maxLength: 256 }),
        (apiKey, prefix, suffix) => {
          const redacted = redactApiKey(`${prefix}${apiKey}${suffix}`, apiKey);

          expect(redacted).not.toContain(apiKey);
          expect(redacted.length).toBeLessThan(
            prefix.length + apiKey.length + suffix.length
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
