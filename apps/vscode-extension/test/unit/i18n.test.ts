type I18nModule = typeof import('../../src/i18n');

/**
 * The locale is resolved once at module load from VSCODE_NLS_CONFIG, so each
 * case re-imports the module in isolation with the env configured up front.
 */
function loadI18n(nlsConfig?: string): I18nModule {
  jest.resetModules();
  const previous = process.env['VSCODE_NLS_CONFIG'];
  if (nlsConfig === undefined) {
    delete process.env['VSCODE_NLS_CONFIG'];
  } else {
    process.env['VSCODE_NLS_CONFIG'] = nlsConfig;
  }
  let mod: I18nModule | undefined;
  jest.isolateModules(() => {
    // Module isolation requires a synchronous re-import; jest.isolateModules
    // cannot use an async dynamic import().
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../../src/i18n') as I18nModule;
  });
  if (previous === undefined) {
    delete process.env['VSCODE_NLS_CONFIG'];
  } else {
    process.env['VSCODE_NLS_CONFIG'] = previous;
  }
  return mod as I18nModule;
}

describe('i18n', () => {
  describe('locale detection', () => {
    it('defaults to English when VSCODE_NLS_CONFIG is absent', () => {
      const { localize } = loadI18n(undefined);
      expect(localize('restart')).toBe('Restart');
    });

    it('uses Turkish messages when the locale is tr', () => {
      const { localize } = loadI18n('{"locale":"tr"}');
      expect(localize('restart')).toBe('Yeniden Başlat');
    });

    it('falls back to English for a locale without translations', () => {
      const { localize } = loadI18n('{"locale":"de"}');
      expect(localize('restart')).toBe('Restart');
    });

    it('falls back to English when the config has no locale field', () => {
      const { localize } = loadI18n('{"foo":"bar"}');
      expect(localize('restart')).toBe('Restart');
    });

    it('falls back to English when the config is invalid JSON', () => {
      const { localize } = loadI18n('not-json');
      expect(localize('restart')).toBe('Restart');
    });
  });

  describe('localize interpolation', () => {
    it('returns the raw message when no args are given', () => {
      const { localize } = loadI18n(undefined);
      expect(localize('workspaceTrustRequired')).toContain('{feature}');
    });

    it('replaces a single placeholder', () => {
      const { localize } = loadI18n(undefined);
      expect(localize('runValidation', { label: 'DRC' })).toBe('Run DRC');
    });

    it('replaces multiple placeholders and coerces non-string args', () => {
      const { localize } = loadI18n(undefined);
      expect(
        localize('diagnosticSummary', {
          status: 'FAIL',
          errors: 2,
          warnings: 1
        })
      ).toBe('FAIL - 2 errors, 1 warnings');
    });

    it('interpolates into a Turkish message', () => {
      const { localize } = loadI18n('{"locale":"tr"}');
      expect(localize('runValidation', { label: 'DRC' })).toBe('DRC çalıştır');
    });
  });
});
