import * as fs from 'node:fs';
import * as path from 'node:path';

type JsonObject = Record<string, unknown>;

const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');
const PACKAGE_JSON_PATH = path.join(EXTENSION_ROOT, 'package.json');
const PACKAGE_NLS_PATH = path.join(EXTENSION_ROOT, 'package.nls.json');

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function collectManifestLocalizationKeys(
  value: unknown,
  keys = new Set<string>()
): Set<string> {
  if (typeof value === 'string') {
    const match = value.match(/^%([^%]+)%$/u);
    const key = match?.[1];
    if (key) {
      keys.add(key);
    }
    return keys;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectManifestLocalizationKeys(item, keys);
    }
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as JsonObject)) {
      collectManifestLocalizationKeys(item, keys);
    }
  }
  return keys;
}

function collectHardCodedContributionStrings(
  value: unknown,
  pathParts: string[] = [],
  findings: string[] = []
): string[] {
  if (typeof value === 'string') {
    const key = pathParts.at(-1) ?? '';
    const parentKey = pathParts.at(-2) ?? '';
    const ignoredKeys = new Set([
      'id',
      'command',
      'view',
      'viewType',
      'when',
      'group',
      'icon',
      'path',
      'url',
      'type',
      'default',
      'extensions',
      'extensionKind',
      'key',
      'mac',
      'enum',
      'scopeName',
      'language',
      'toolReferenceName',
      'filenamePattern',
      'fileMatch',
      'completionEvents',
      'name',
      'tags',
      'managementCommand'
    ]);
    const ignoredParentKeys = new Set(['default', 'extensions']);
    const ignoredPrefixes = [
      '$',
      './',
      'assets/',
      'media/',
      '**/',
      '*.',
      'onCommand:',
      'onContext:'
    ];
    const ignored =
      ignoredKeys.has(key) ||
      ignoredParentKeys.has(parentKey) ||
      ignoredPrefixes.some((prefix) => value.startsWith(prefix)) ||
      /^%[^%]+%$/u.test(value) ||
      /^kicadstudio\./u.test(value) ||
      /^cmd\+|^ctrl\+/u.test(value) ||
      /^[a-z]{2}(?:-[A-Z]{2})?$/u.test(value) ||
      /^[a-z][a-z0-9._-]*$/u.test(value) ||
      /^[A-Z][A-Z0-9_+.-]*$/u.test(value);
    if (!ignored && /[A-Za-z][A-Za-z ]+/u.test(value)) {
      findings.push(`${pathParts.join('.')}: ${value}`);
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectHardCodedContributionStrings(
        item,
        [...pathParts, String(index)],
        findings
      )
    );
    return findings;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as JsonObject)) {
      collectHardCodedContributionStrings(item, [...pathParts, key], findings);
    }
  }
  return findings;
}

describe('extension localization manifest', () => {
  it('restricts the AI language setting and its description to English', () => {
    const manifest = readJson<{
      contributes: {
        configuration: {
          properties: Record<string, { default?: string; enum?: string[] }>;
        };
      };
    }>(PACKAGE_JSON_PATH);
    const aiLanguage =
      manifest.contributes.configuration.properties['kicadstudio.ai.language'];
    expect(aiLanguage).toEqual(
      expect.objectContaining({ default: 'en', enum: ['en'] })
    );
    const english = readJson<Record<string, string>>(PACKAGE_NLS_PATH);
    expect(
      english[
        'kicadstudio.contributes.configuration.properties.kicadstudio.ai.language.description'
      ]
    ).toContain('English-only');
  });

  it('has a package.nls.json with English strings for every package.json localization key', () => {
    const packageJson = readJson<JsonObject>(PACKAGE_JSON_PATH);
    const english = readJson<Record<string, string>>(PACKAGE_NLS_PATH);
    const keys = [...collectManifestLocalizationKeys(packageJson)].sort();

    expect(keys.length).toBeGreaterThan(50);
    for (const key of keys) {
      const englishMessage = english[key];
      expect(englishMessage).toEqual(expect.any(String));
      expect(englishMessage?.trim()).not.toBe('');
    }
  });

  it('renders welcome actions on separate lines without escaped literal newlines', () => {
    for (const filename of ['package.nls.json']) {
      const messages = readJson<Record<string, string>>(
        path.join(EXTENSION_ROOT, filename)
      );
      for (const [key, value] of Object.entries(messages)) {
        if (
          !/^kicadstudio\.contributes\.viewsWelcome\.\d+\.contents$/u.test(key)
        ) {
          continue;
        }
        expect({
          filename,
          key,
          hasLiteralNewline: value.includes('\\n')
        }).toEqual({
          filename,
          key,
          hasLiteralNewline: false
        });
        const lines = value.split('\n');
        for (let i = 1; i < lines.length; i += 1) {
          const previousIsAction = /^\[[^\]]+\]\(command:[^)]+\)$/u.test(
            lines[i - 1] ?? ''
          );
          const currentIsAction = /^\[[^\]]+\]\(command:[^)]+\)$/u.test(
            lines[i] ?? ''
          );
          expect({
            filename,
            key,
            adjacentActions: previousIsAction && currentIsAction
          }).toEqual({
            filename,
            key,
            adjacentActions: false
          });
        }
      }
    }
  });

  it('keeps package contribution labels and descriptions behind localization keys', () => {
    const packageJson = readJson<{ contributes?: JsonObject }>(
      PACKAGE_JSON_PATH
    );
    const findings = collectHardCodedContributionStrings(
      packageJson.contributes ?? {}
    );

    expect(findings).toEqual([]);
  });
});
