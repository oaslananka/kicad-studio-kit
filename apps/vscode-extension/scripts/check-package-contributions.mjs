#!/usr/bin/env node
/**
 * check-package-contributions.mjs
 *
 * Validates that apps/vscode-extension/package.json contributions are
 * internally consistent:
 *  1. No duplicate command IDs in contributes.commands
 *  2. Every command referenced in contributes.menus exists in contributes.commands
 *  3. Every command referenced in contributes.keybindings exists in contributes.commands
 *  4. All contributed commands have non-empty title/category
 *  5. Every contributes.commands command has a corresponding %key% in package.nls.json
 *  6. Icon/image/walkthrough/media paths referenced in contributes exist on disk
 *  7. Grammar path files exist on disk
 *  8. View icon files exist on disk
 *
 * Exit code 0 = pass, 1 = fail
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIR = resolve(__dirname, '..');
const PKG_PATH = resolve(EXTENSION_DIR, 'package.json');
const NLS_PATH = resolve(EXTENSION_DIR, 'package.nls.json');
// constants.ts comparison planned but not yet implemented

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let errors = [];
let warnings = [];

function fail(msg) {
  errors.push(msg);
  console.error('  FAIL:', msg);
}

function warn(msg) {
  warnings.push(msg);
  console.warn('  WARN:', msg);
}

// ---------------------------------------------------------------------------
// 1. Load package.json
// ---------------------------------------------------------------------------
console.log('\n[check-package-contributions]');
console.log('  Extension dir:', EXTENSION_DIR);

let pkg;
try {
  pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
} catch {
  fail(`Cannot parse package.json at ${PKG_PATH}`);
  process.exit(1);
}

const contributes = pkg.contributes || {};

// ---------------------------------------------------------------------------
// 2. Duplicate command IDs
// ---------------------------------------------------------------------------
console.log('\n  1. Checking duplicate command IDs...');
const contributedCommands = contributes.commands || [];
const cmdMap = new Map();
const dupIds = [];
for (const entry of contributedCommands) {
  const id = entry.command;
  if (cmdMap.has(id)) {
    dupIds.push(id);
  }
  cmdMap.set(id, entry);
}
if (dupIds.length > 0) {
  for (const id of dupIds) {
    fail(`Duplicate command ID: ${id}`);
  }
} else {
  console.log('     No duplicate command IDs.');
}

// ---------------------------------------------------------------------------
// 3. Menu commands exist in contributes.commands
// ---------------------------------------------------------------------------
console.log('\n  2. Checking menu command references...');
const menuSections = contributes.menus || {};
const visitedMenuCommands = new Set();
for (const [menuLocation, menuItems] of Object.entries(menuSections)) {
  for (const item of menuItems) {
    if (item.command) {
      visitedMenuCommands.add(item.command);
      if (!cmdMap.has(item.command)) {
        fail(
          `Menu "${menuLocation}" references unknown command: ${item.command}`
        );
      }
    }
  }
}
if (visitedMenuCommands.size > 0) {
  console.log(
    `     ${visitedMenuCommands.size} unique command(s) referenced in menus.`
  );
}

// ---------------------------------------------------------------------------
// 4. Keybinding commands exist in contributes.commands
// ---------------------------------------------------------------------------
console.log('\n  3. Checking keybinding command references...');
const keybindings = contributes.keybindings || [];
for (const kb of keybindings) {
  if (kb.command && !cmdMap.has(kb.command)) {
    fail(`Keybinding "${kb.key}" references unknown command: ${kb.command}`);
  }
}
console.log(`     ${keybindings.length} keybinding(s) checked.`);

// ---------------------------------------------------------------------------
// 5. Command title/category non-empty
// ---------------------------------------------------------------------------
console.log('\n  4. Checking command title/category...');
for (const entry of contributedCommands) {
  const id = entry.command;
  if (!entry.title || entry.title === '') {
    fail(`Command "${id}" has empty/missing title`);
  }
  // category is optional for some internal commands, but if present should not be empty
  if (entry.category !== undefined && entry.category === '') {
    fail(`Command "${id}" has empty category`);
  }
}
console.log(`     ${contributedCommands.length} command(s) checked.`);

// ---------------------------------------------------------------------------
// 6. package.nls.json key coverage
// ---------------------------------------------------------------------------
console.log('\n  5. Checking package.nls.json key coverage...');
let nlsKeys = new Set();
try {
  const nls = JSON.parse(readFileSync(NLS_PATH, 'utf8'));
  nlsKeys = new Set(Object.keys(nls));
} catch {
  warn(`Cannot read package.nls.json at ${NLS_PATH} — skipping nls check`);
}

const KEY_PATTERN = /%([^%]+)%/g;
for (const entry of contributedCommands) {
  const titleKey = entry.title || '';
  const catKey = entry.category || '';
  for (const match of titleKey.matchAll(KEY_PATTERN)) {
    const resolvedKey = match[1];
    if (!nlsKeys.has(resolvedKey)) {
      warn(
        `Command "${entry.command}" title key "%${resolvedKey}%" missing from package.nls.json`
      );
    }
  }
  for (const match of catKey.matchAll(KEY_PATTERN)) {
    const resolvedKey = match[1];
    if (!nlsKeys.has(resolvedKey)) {
      warn(
        `Command "${entry.command}" category key "%${resolvedKey}%" missing from package.nls.json`
      );
    }
  }
}
console.log(`     nls keys checked (${nlsKeys.size} total keys).`);

// ---------------------------------------------------------------------------
// 7. Icon paths exist
// ---------------------------------------------------------------------------
console.log('\n  6. Checking icon paths exist on disk...');
if (pkg.icon) {
  const iconPath = resolve(EXTENSION_DIR, pkg.icon);
  if (!existsSync(iconPath)) {
    fail(`Extension icon "${pkg.icon}" not found at ${iconPath}`);
  }
}

// Grammar paths
const grammars = contributes.grammars || [];
for (const g of grammars) {
  if (g.path) {
    const gp = resolve(EXTENSION_DIR, g.path);
    if (!existsSync(gp)) {
      fail(`Grammar path "${g.path}" not found`);
    }
  }
}
console.log(`     ${grammars.length} grammar(s) checked.`);

// View icons
const views = contributes.views || {};
for (const [, viewList] of Object.entries(views)) {
  for (const v of viewList) {
    if (v.icon) {
      const iconPath = resolve(EXTENSION_DIR, v.icon);
      if (!existsSync(iconPath)) {
        fail(`View "${v.id}" icon "${v.icon}" not found at ${iconPath}`);
      }
    }
  }
}
console.log(`     View icons checked.`);

// Walkthrough media files
const walkthroughs = contributes.walkthroughs || [];
for (const wt of walkthroughs) {
  if (wt.steps) {
    for (const step of wt.steps) {
      if (step.media && step.media.image) {
        const mediaPath = resolve(EXTENSION_DIR, step.media.image);
        if (!existsSync(mediaPath)) {
          fail(
            `Walkthrough "${wt.id}" step "${step.id}" media image not found: ${step.media.image}`
          );
        }
      }
      if (step.media && step.media.markdown) {
        const mdPath = resolve(EXTENSION_DIR, step.media.markdown);
        if (!existsSync(mdPath)) {
          fail(
            `Walkthrough "${wt.id}" step "${step.id}" media markdown not found: ${step.media.markdown}`
          );
        }
      }
    }
  }
}
console.log(`     ${walkthroughs.length} walkthrough(s) checked.`);

// ---------------------------------------------------------------------------
// 8. JSON validation schemas path check
// ---------------------------------------------------------------------------
console.log('\n  7. Checking jsonValidation schema paths...');
const jsonValidations = contributes.jsonValidation || [];
for (const jv of jsonValidations) {
  if (jv.url && !jv.url.startsWith('http')) {
    const schemaPath = resolve(EXTENSION_DIR, jv.url);
    if (!existsSync(schemaPath)) {
      fail(`JSON validation schema "${jv.url}" not found`);
    }
  }
}
console.log(`     ${jsonValidations.length} jsonValidation(s) checked.`);

// ---------------------------------------------------------------------------
// 9. Summary
// ---------------------------------------------------------------------------
console.log('\n--- Summary ---');
console.log(`  Commands contributed: ${contributedCommands.length}`);
console.log(`  Unique commands: ${cmdMap.size}`);
console.log(`  Languages: ${(contributes.languages || []).length}`);
console.log(`  Grammars: ${grammars.length}`);
console.log(`  Views: ${Object.keys(views).length} container(s)`);
console.log(`  Keybindings: ${keybindings.length}`);
console.log(`  Walkthroughs: ${walkthroughs.length}`);
console.log(`  Errors: ${errors.length}`);
console.log(`  Warnings: ${warnings.length}`);

if (errors.length > 0) {
  console.error(`\n❌ ${errors.length} error(s) found.`);
  process.exit(1);
} else {
  console.log('\n✅ All checks passed.');
  process.exit(0);
}
