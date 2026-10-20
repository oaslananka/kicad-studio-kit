jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

import {
  WEBVIEW_MESSAGES,
  buildWebviewMessageMap,
  injectWebviewLocalization,
  webviewLocale,
  localizeWebviewMessage
} from '../../src/webviewI18n';

describe('webview localization', () => {
  it('builds exact-key identity webview map', () => {
    const map = buildWebviewMessageMap();

    expect(Object.keys(map).sort()).toEqual([...WEBVIEW_MESSAGES].sort());
    for (const message of WEBVIEW_MESSAGES) {
      expect(map[message]).toBe(message);
    }
  });

  it('never translates messages or webview document language for other locales', () => {
    const previous = process.env['VSCODE_NLS_CONFIG'];
    try {
      for (const locale of ['tr', 'de', 'fr', 'ja']) {
        process.env['VSCODE_NLS_CONFIG'] = JSON.stringify({ locale });
        expect(webviewLocale()).toBe('en');
        expect(localizeWebviewMessage('KiCad Studio Settings')).toBe(
          'KiCad Studio Settings'
        );
        expect(buildWebviewMessageMap()['KiCad Studio Settings']).toBe(
          'KiCad Studio Settings'
        );
        expect(
          injectWebviewLocalization(
            '<html lang="en"><body></body></html>',
            'nonce'
          )
        ).toContain('<html lang="en">');
      }
    } finally {
      if (previous === undefined) {
        delete process.env['VSCODE_NLS_CONFIG'];
      } else {
        process.env['VSCODE_NLS_CONFIG'] = previous;
      }
    }
  });

  it('injects a nonce-scoped script and sets lang to en', () => {
    const html = injectWebviewLocalization(
      '<!DOCTYPE html><html lang="en"><body><button aria-label="Save Rule">Save Rule</button></body></html>',
      'test-nonce'
    );

    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<script nonce="test-nonce">');
    expect(html).toContain('globalThis.kicadStudioL10n');
    expect(html).not.toContain('</body><script');
  });
});
