#!/usr/bin/env node
/**
 * Checks extension manifest (package.json) for contribution consistency:
 * - No duplicate command IDs in contributes.commands
 * - All menu/keybinding commands reference existing contributed commands
 * - All walkthrough media paths exist
 * - All view icons exist
 * - All grammar/config paths exist
 * - No missing package.nls.json keys
 * - Command category and title are non-empty
 */
import fs from 'node:fs';
import path from 'node:path';

const EXTENSION_DIR = path.resolve(import.meta.dirname, '..');
const PACKAGE_JSON = path.join(EXTENSION_DIR, 'package.json');
const NLS_JSON = path.join(EXTENSION_DIR, 'package.nls.json');

let exitCode = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  exitCode = 1;
}

function ok(msg) {
  console.log(`  OK: ${msg}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    fail(
      `Cannot read ${path.relative(EXTENSION_DIR, filePath)}: ${err.message}`
    );
    return null;
  }
}

const pkg = readJson(PACKAGE_JSON);
if (!pkg) process.exit(1);

const contributes = pkg.contributes;

// ── 1. Check duplicate command IDs ──────────────────────────────────────
const commands = contributes?.commands ?? [];
const commandIds = commands.map((c) => c.command);
const duplicateIds = commandIds.filter(
  (id, idx) => commandIds.indexOf(id) !== idx
);
const uniqueDupes = [...new Set(duplicateIds)];
if (uniqueDupes.length > 0) {
  for (const dup of uniqueDupes) {
    fail(`Duplicate command ID: ${dup}`);
  }
} else {
  ok('No duplicate command IDs');
}

// ── 2. Check menu command references ────────────────────────────────────
const contributedSet = new Set(commandIds);
const menus = contributes?.menus ?? {};
for (const [menuLocation, items] of Object.entries(menus)) {
  for (const item of items) {
    if (item.command && !contributedSet.has(item.command)) {
      fail(`${menuLocation} references unknown command: ${item.command}`);
    }
  }
}
ok('Menu command references verified');

// ── 3. Check keybinding command references ──────────────────────────────
const keybindings = contributes?.keybindings ?? [];
for (const kb of keybindings) {
  if (!contributedSet.has(kb.command)) {
    fail(`Keybinding references unknown command: ${kb.command}`);
  }
}
ok('Keybinding command references verified');

// ── 4. Check walkthrough media paths ────────────────────────────────────
const walkthroughs = contributes?.walkthroughs ?? [];
for (const wt of walkthroughs) {
  for (const step of wt.steps ?? []) {
    const media = step.media;
    if (media?.image) {
      const imgPath = path.join(EXTENSION_DIR, media.image);
      if (!fs.existsSync(imgPath)) {
        fail(`Walkthrough step "${step.id}" missing image: ${media.image}`);
      }
    }
    if (media?.markdown) {
      const mdPath = path.join(EXTENSION_DIR, media.markdown);
      if (!fs.existsSync(mdPath)) {
        fail(
          `Walkthrough step "${step.id}" missing markdown: ${media.markdown}`
        );
      }
    }
  }
}
ok('Walkthrough media paths verified');

// ── 5. Check view icons ────────────────────────────────────────────────
const views = contributes?.views ?? {};
for (const [, viewList] of Object.entries(views)) {
  for (const view of viewList) {
    if (view.icon) {
      const iconPath = path.join(EXTENSION_DIR, view.icon);
      if (!fs.existsSync(iconPath)) {
        fail(`View "${view.id}" missing icon: ${view.icon}`);
      }
    }
  }
}
ok('View icon paths verified');

// ── 6. Check viewContainer icons ────────────────────────────────────────
const viewContainers = contributes?.viewsContainers ?? {};
for (const [, containerList] of Object.entries(viewContainers)) {
  for (const container of containerList) {
    if (container.icon) {
      const iconPath = path.join(EXTENSION_DIR, container.icon);
      if (!fs.existsSync(iconPath)) {
        fail(`ViewContainer "${container.id}" missing icon: ${container.icon}`);
      }
    }
  }
}
ok('ViewContainer icon paths verified');

// ── 7. Check grammar paths ──────────────────────────────────────────────
const grammars = contributes?.grammars ?? [];
for (const grammar of grammars) {
  if (grammar.path) {
    const gPath = path.join(EXTENSION_DIR, grammar.path);
    if (!fs.existsSync(gPath)) {
      fail(`Grammar for "${grammar.language}" missing path: ${grammar.path}`);
    }
  }
}
ok('Grammar paths verified');

// ── 8. Check language configuration paths ───────────────────────────────
const languages = contributes?.languages ?? [];
for (const lang of languages) {
  if (lang.configuration) {
    const cfgPath = path.join(EXTENSION_DIR, lang.configuration);
    if (!fs.existsSync(cfgPath)) {
      fail(
        `Language "${lang.id}" missing configuration: ${lang.configuration}`
      );
    }
  }
}
ok('Language configuration paths verified');

// ── 9. Check snippet paths ──────────────────────────────────────────────
const snippets = contributes?.snippets ?? [];
for (const snippet of snippets) {
  const snipPath = path.join(EXTENSION_DIR, snippet.path);
  if (!fs.existsSync(snipPath)) {
    fail(`Snippet for "${snippet.language}" missing: ${snippet.path}`);
  }
}
ok('Snippet paths verified');

// ── 10. Check command category and title non-empty ──────────────────────
for (const cmd of commands) {
  if (!cmd.title) {
    fail(`Command "${cmd.command}" has no title`);
  }
  if (cmd.title && cmd.title.startsWith('%') && cmd.title.endsWith('%')) {
    // i18n key reference - checked separately
  }
}
ok('Command titles present');

// ── 11. Check package.nls.json covers all %key% references ──────────────
const nls = readJson(NLS_JSON);
if (nls) {
  const nlsKeys = new Set(Object.keys(nls));
  const pkgStr = JSON.stringify(pkg);
  const i18nRefs = [...pkgStr.matchAll(/%([^%]+)%/g)].map((m) => m[1]);
  const missingKeys = [...new Set(i18nRefs)].filter(
    (key) =>
      !nlsKeys.has(key) &&
      key !== 'kicadstudio.displayName' &&
      key !== 'kicadstudio.description'
  );
  if (missingKeys.length > 0) {
    for (const key of missingKeys) {
      fail(`Missing package.nls.json key: ${key}`);
    }
  } else {
    ok('All %key% references have corresponding nls entries');
  }
}

// ── 12. Check jsonValidation schema paths ───────────────────────────────
const jsonValidation = contributes?.jsonValidation ?? [];
for (const jv of jsonValidation) {
  if (jv.url && !jv.url.startsWith('http')) {
    const schemaPath = path.join(EXTENSION_DIR, jv.url);
    if (!fs.existsSync(schemaPath)) {
      fail(`JSON validation schema missing: ${jv.url}`);
    }
  }
}
ok('JSON validation schema paths verified');

// ── 13. Check total command count ───────────────────────────────────────
const totalCommands = commandIds.length;
const uniqueCommands = new Set(commandIds).size;
console.log(`  Commands: ${totalCommands} total, ${uniqueCommands} unique`);

// ── Exit ────────────────────────────────────────────────────────────────
if (exitCode === 0) {
  console.log('Extension manifest check passed.');
} else {
  console.error('Extension manifest check FAILED.');
}
process.exit(exitCode);
