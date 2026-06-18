#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_ROOT, '..');
const EXTENSION_DIR = path.join(REPO_ROOT, 'apps', 'vscode-extension');
const BASE_FILE = path.join(EXTENSION_DIR, 'package.nls.json');

// Supported locales for GA are English (base) + Turkish. Beyond key parity, we
// also guard against *new* user-facing strings that were copied into a locale
// file but never translated (value identical to the base locale).
//
// A value that is legitimately identical across locales is allowed when it is a
// proper noun, brand name, palette category label, or file-format alias. The
// 57 currently-identical tr values were triaged and all fall into these
// buckets, captured by the patterns below. Anything else identical to the base
// is treated as a missed translation and fails the gate; if a new string is
// genuinely meant to be identical, add it here with that justification.
const IDENTICAL_ALLOWED_KEYS = new Set([
  'kicadstudio.displayName', // "KiCad Studio Kit" (product name)
  'kicadstudio.contributes.viewsContainers.activitybar.0.title', // "KiCad Studio"
  'kicadstudio.contributes.views.kicadstudio-sidebar.4.name', // "Netlist" (accepted term)
  'kicadstudio.contributes.configuration.title', // "KiCad Studio"
  'kicadstudio.contributes.languageModelChatProviders.0.displayName' // "KiCad Studio"
]);

/** Whether a key may legitimately carry the same value in every locale. */
function identicalValueAllowed(key) {
  return (
    key.endsWith('.category') || // command palette categories ("KiCad", "KiCad AI", …)
    key.includes('.aliases.') || // language/file-format aliases ("kicad_sch", "Gerber RS-274X", …)
    IDENTICAL_ALLOWED_KEYS.has(key)
  );
}

let exitCode = 0;

/** Parse a JSON file, returning the parsed object or null on failure. */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`\x1b[31m✗\x1b[0m Failed to read ${filePath}: ${err.message}`);
    exitCode = 1;
    return null;
  }
}

/** Get the locale name from a package.nls.*.json filename. */
function localeName(file) {
  const match = file.match(/^package\.nls\.(.+)\.json$/);
  return match ? match[1] : null;
}

// Read base key set
const base = readJson(BASE_FILE);
if (!base) process.exit(1);

const baseKeys = new Set(Object.keys(base));

// Find all locale NLS files
let localeFiles;
try {
  localeFiles = fs.readdirSync(EXTENSION_DIR).filter(
    (f) => f !== 'package.nls.json' && /^package\.nls\..+\.json$/.test(f)
  );
} catch (err) {
  console.error(`\x1b[31m✗\x1b[0m Failed to read ${EXTENSION_DIR}: ${err.message}`);
  process.exit(1);
}

if (localeFiles.length === 0) {
  console.log('No locale NLS files found to check.');
  process.exit(0);
}

for (const file of localeFiles) {
  const loc = localeName(file);
  const filePath = path.join(EXTENSION_DIR, file);
  const localeData = readJson(filePath);
  if (!localeData) continue;

  const localeKeys = new Set(Object.keys(localeData));
  let fileOk = true;

  // Check for missing keys (in base but not in locale)
  const missing = [];
  for (const key of baseKeys) {
    if (!localeKeys.has(key)) missing.push(key);
  }

  if (missing.length > 0) {
    console.error(`\x1b[31m✗ ${loc}\x1b[0m missing ${missing.length} key(s): ${missing.join(', ')}`);
    exitCode = 1;
    fileOk = false;
  }

  // Check for extra keys (in locale but not in base)
  const extra = [];
  for (const key of localeKeys) {
    if (!baseKeys.has(key)) extra.push(key);
  }

  if (extra.length > 0) {
    console.error(`\x1b[31m✗ ${loc}\x1b[0m has ${extra.length} extra key(s): ${extra.join(', ')}`);
    exitCode = 1;
    fileOk = false;
  }

  // Flag user-facing strings that were copied verbatim from the base locale and
  // never translated (excluding proper nouns / brand / category / aliases).
  const untranslated = [];
  for (const key of localeKeys) {
    if (!baseKeys.has(key)) continue;
    if (base[key] === localeData[key] && !identicalValueAllowed(key)) {
      untranslated.push(key);
    }
  }

  if (untranslated.length > 0) {
    console.error(
      `\x1b[31m✗ ${loc}\x1b[0m has ${untranslated.length} value(s) identical to the base locale (likely untranslated): ${untranslated.join(', ')}`
    );
    console.error(
      '  If a value is intentionally identical (proper noun, brand, category, or alias), add the key to IDENTICAL_ALLOWED_KEYS in scripts/check-nls-parity.mjs.'
    );
    exitCode = 1;
    fileOk = false;
  }

  if (fileOk) {
    console.log(`\x1b[32m✓ ${loc}\x1b[0m`);
  }
}

process.exit(exitCode);
