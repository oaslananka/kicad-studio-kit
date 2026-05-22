import * as fs from 'node:fs';
import * as path from 'node:path';
import { SOURCE_MESSAGES } from '../../src/i18n';

type JsonObject = Record<string, unknown>;

const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');
const PACKAGE_JSON_PATH = path.join(EXTENSION_ROOT, 'package.json');
const PACKAGE_NLS_PATH = path.join(EXTENSION_ROOT, 'package.nls.json');
const PACKAGE_NLS_TR_PATH = path.join(EXTENSION_ROOT, 'package.nls.tr.json');
const BUNDLE_TR_PATH = path.join(EXTENSION_ROOT, 'l10n', 'bundle.l10n.tr.json');

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

function collectContributedCommands(packageJson: {
  contributes?: { commands?: Array<{ command?: unknown }> };
}): Set<string> {
  return new Set(
    (packageJson.contributes?.commands ?? [])
      .map((command) => command.command)
      .filter((command): command is string => typeof command === 'string')
  );
}

function collectUnknownCommandLinks(
  messages: Record<string, string>,
  contributedCommands: Set<string>
): string[] {
  const findings: string[] = [];
  const commandLinkPattern = /\(command:([^)]+)\)/gu;

  for (const [key, message] of Object.entries(messages)) {
    for (const match of message.matchAll(commandLinkPattern)) {
      const commandId = match[1];
      if (!commandId) {
        continue;
      }
      const knownBuiltIn = commandId.startsWith('workbench.action.');
      if (!knownBuiltIn && !contributedCommands.has(commandId)) {
        findings.push(`${key}: ${commandId}`);
      }
    }
  }

  return findings;
}

describe('extension localization manifest', () => {
  it('declares package and source-code localization bundles', () => {
    const packageJson = readJson<JsonObject>(PACKAGE_JSON_PATH);

    expect(packageJson['l10n']).toBe('./l10n');
    expect(fs.existsSync(PACKAGE_NLS_PATH)).toBe(true);
    expect(fs.existsSync(PACKAGE_NLS_TR_PATH)).toBe(true);
    expect(fs.existsSync(BUNDLE_TR_PATH)).toBe(true);
    expect(fs.existsSync(path.join(EXTENSION_ROOT, 'src', 'i18n.ts'))).toBe(
      true
    );
  });

  it('has complete English and Turkish strings for every package.json localization key', () => {
    const packageJson = readJson<JsonObject>(PACKAGE_JSON_PATH);
    const english = readJson<Record<string, string>>(PACKAGE_NLS_PATH);
    const turkish = readJson<Record<string, string>>(PACKAGE_NLS_TR_PATH);
    const keys = [...collectManifestLocalizationKeys(packageJson)].sort();

    expect(keys.length).toBeGreaterThan(50);
    for (const key of keys) {
      const englishMessage = english[key];
      const turkishMessage = turkish[key];
      expect(englishMessage).toEqual(expect.any(String));
      expect(englishMessage?.trim()).not.toBe('');
      expect(turkishMessage).toEqual(expect.any(String));
      expect(turkishMessage?.trim()).not.toBe('');
    }
    expect(Object.keys(turkish).sort()).toEqual(Object.keys(english).sort());
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

  it('keeps localized markdown command links pointed at real commands', () => {
    const packageJson = readJson<{
      contributes?: { commands?: Array<{ command?: unknown }> };
    }>(PACKAGE_JSON_PATH);
    const contributedCommands = collectContributedCommands(packageJson);

    expect(
      collectUnknownCommandLinks(
        readJson<Record<string, string>>(PACKAGE_NLS_PATH),
        contributedCommands
      )
    ).toEqual([]);
    expect(
      collectUnknownCommandLinks(
        readJson<Record<string, string>>(PACKAGE_NLS_TR_PATH),
        contributedCommands
      )
    ).toEqual([]);
  });

  it('has Turkish translations for source-code localization messages', () => {
    const turkish = readJson<Record<string, string>>(BUNDLE_TR_PATH);

    for (const message of Object.values(SOURCE_MESSAGES)) {
      expect(turkish[message]).toEqual(expect.any(String));
      expect(turkish[message]?.trim()).not.toBe('');
    }
  });
});
