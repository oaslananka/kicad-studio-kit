import * as fs from 'node:fs';
import * as path from 'node:path';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

import {
  WEBVIEW_MESSAGES,
  buildPseudoLocaleMessageMap,
  buildWebviewMessageMap,
  injectWebviewLocalization
} from '../../src/webviewI18n';

const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');
const BUNDLE_TR_PATH = path.join(EXTENSION_ROOT, 'l10n', 'bundle.l10n.tr.json');

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

describe('webview localization bundles', () => {
  it('has a Turkish translation for every webview source message', () => {
    const turkish = readJson<Record<string, string>>(BUNDLE_TR_PATH);

    expect(WEBVIEW_MESSAGES.length).toBeGreaterThan(70);
    for (const message of WEBVIEW_MESSAGES) {
      expect(turkish[message]).toEqual(expect.any(String));
      expect(turkish[message]?.trim()).not.toBe('');
    }
  });

  it('builds exact-key webview maps and a pseudo-locale smoke map', () => {
    const translated = buildWebviewMessageMap((message) => `tr:${message}`);
    const pseudo = buildPseudoLocaleMessageMap();

    expect(Object.keys(translated).sort()).toEqual(
      [...WEBVIEW_MESSAGES].sort()
    );
    expect(Object.keys(pseudo).sort()).toEqual([...WEBVIEW_MESSAGES].sort());
    for (const message of WEBVIEW_MESSAGES) {
      expect(translated[message]).toBe(`tr:${message}`);
      expect(pseudo[message]).toMatch(/^\[!! .+ !!\]$/u);
      if (/[A-Za-z]/u.test(message)) {
        expect(pseudo[message]).not.toBe(message);
      }
    }
  });

  it('injects a nonce-scoped localization script and updates the webview lang', () => {
    const html = injectWebviewLocalization(
      '<!DOCTYPE html><html lang="en"><body><button aria-label="Save Rule">Save Rule</button></body></html>',
      'test-nonce'
    );

    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<script nonce="test-nonce">');
    expect(html).toContain('"Save Rule"');
    expect(html).toContain('localizableAttributes');
    expect(html).not.toContain('</body><script');
  });
});
