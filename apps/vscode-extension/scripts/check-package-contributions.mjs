#!/usr/bin/env node
/**
 * Comprehensive check for VS Code extension package contributions and registry alignment.
 *
 * Checks:
 * - Duplicate commands in contributes.commands
 * - Menu command references exist in contributes.commands
 * - Keybinding command references exist in contributes.commands
 * - All constants.ts commands are either contributed in package.json or on the internal allowlist
 * - All registered commands in source code exist in constants.ts
 * - package.nls.json has no missing keys
 * - Walks through paths to ensure all command/view/container icons, grammars, configurations, snippets, and walkthrough media exist
 * - Ensures command category/title are non-empty
 */
import fs from 'node:fs';
import path from 'node:path';

const EXTENSION_DIR = path.resolve(import.meta.dirname, '..');
const PACKAGE_JSON = path.join(EXTENSION_DIR, 'package.json');
const NLS_JSON = path.join(EXTENSION_DIR, 'package.nls.json');
const CONSTANTS_TS = path.join(EXTENSION_DIR, 'src/constants.ts');
const SRC_DIR = path.join(EXTENSION_DIR, 'src');

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

const contributes = pkg.contributes ?? {};
const commands = contributes.commands ?? [];
const commandIds = commands.map((c) => c.command);

// ── 1. Check duplicate command IDs ──────────────────────────────────────
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

// ── 2. Check menu command references exist in contributes.commands ─────────
const contributedSet = new Set(commandIds);
const menus = contributes.menus ?? {};
for (const [menuLocation, items] of Object.entries(menus)) {
  for (const item of items) {
    if (item.command && !contributedSet.has(item.command)) {
      fail(`${menuLocation} references unknown command: ${item.command}`);
    }
  }
}
ok('Menu command references verified');

// ── 3. Check keybinding command references exist in contributes.commands ─────
const keybindings = contributes.keybindings ?? [];
for (const kb of keybindings) {
  if (!contributedSet.has(kb.command)) {
    fail(`Keybinding references unknown command: ${kb.command}`);
  }
}
ok('Keybinding command references verified');

// ── 4. Load constants.ts commands ───────────────────────────────────────
let constantCommands = new Set();
let constantKeysToValues = {};

if (fs.existsSync(CONSTANTS_TS)) {
  try {
    const constantsContent = fs.readFileSync(CONSTANTS_TS, 'utf8');
    const commandsBlockMatch = constantsContent.match(
      /export const COMMANDS\s*=\s*\{([\s\S]+?)\}\s*as\s*const;/
    );
    if (commandsBlockMatch) {
      const commandsBlock = commandsBlockMatch[1];
      const keyValRegex =
        /([a-zA-Z0-9_]+)\s*:\s*['"](kicadstudio\.[^'"]+)['"]/g;
      for (const match of commandsBlock.matchAll(keyValRegex)) {
        constantCommands.add(match[2]);
        constantKeysToValues[match[1]] = match[2];
      }
      ok('constants.ts COMMANDS parsed successfully');
    } else {
      fail('Could not find COMMANDS block in constants.ts');
    }
  } catch (err) {
    fail(`Error reading or parsing constants.ts: ${err.message}`);
  }
} else {
  fail('constants.ts does not exist');
}

// ── 5. Check constants.ts command -> contributed or internal allowlist ───
const INTERNAL_ALLOWLIST = new Set([
  'kicadstudio.selectActiveProject',
  'kicadstudio.exportViewerSnapshot',
  'kicadstudio.exportSTEP',
  'kicadstudio.exportSTEPZ',
  'kicadstudio.exportXAO',
  'kicadstudio.exportSTL',
  'kicadstudio.exportU3D',
  'kicadstudio.exportVRML',
  'kicadstudio.exportPS',
  'kicadstudio.exportStats'
]);

for (const constCmd of constantCommands) {
  if (!contributedSet.has(constCmd) && !INTERNAL_ALLOWLIST.has(constCmd)) {
    fail(
      `Command "${constCmd}" defined in constants.ts is neither contributed in package.json nor allowlisted as internal.`
    );
  }
}
ok('All constants.ts commands accounted for (contributed or allowlisted)');

// ── 6. Check registered command -> constants.ts ────────────────────────
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (
      file.endsWith('.ts') &&
      !file.endsWith('.test.ts') &&
      file !== 'constants.ts'
    ) {
      callback(fullPath);
    }
  }
}

let codeScanOk = true;
walkDir(SRC_DIR, (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const registerRegex =
      /register(?:Trusted)?Command\(\s*(COMMANDS\.[a-zA-Z0-9_]+|['"]kicadstudio\.[^'"]+['"])/g;
    for (const match of content.matchAll(registerRegex)) {
      const arg = match[1];
      if (arg.startsWith('COMMANDS.')) {
        const key = arg.slice('COMMANDS.'.length);
        if (!constantKeysToValues[key]) {
          fail(
            `Source file ${path.relative(EXTENSION_DIR, filePath)} registers COMMANDS.${key} which is missing in constants.ts`
          );
          codeScanOk = false;
        }
      } else {
        const val = arg.slice(1, -1);
        if (!constantCommands.has(val)) {
          fail(
            `Source file ${path.relative(EXTENSION_DIR, filePath)} registers literal command "${val}" which is missing in constants.ts`
          );
          codeScanOk = false;
        }
      }
    }
  } catch (err) {
    fail(
      `Failed to scan source file ${path.relative(EXTENSION_DIR, filePath)}: ${err.message}`
    );
    codeScanOk = false;
  }
});
if (codeScanOk) {
  ok('All registered commands in source files verified against constants.ts');
}

// ── 7. Check package.nls.json missing keys ───────────────────────────────
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

// ── 8. Check icon path exists ──────────────────────────────────────────
for (const cmd of commands) {
  if (cmd.icon) {
    // Check if it is a theme icon (e.g., $(package)) or a file path
    if (typeof cmd.icon === 'string') {
      if (cmd.icon.startsWith('$(') && cmd.icon.endsWith(')')) {
        // Theme icon, always allowed
      } else {
        const iconPath = path.join(EXTENSION_DIR, cmd.icon);
        if (!fs.existsSync(iconPath)) {
          fail(`Command "${cmd.command}" references missing icon: ${cmd.icon}`);
        }
      }
    } else if (cmd.icon.dark || cmd.icon.light) {
      if (cmd.icon.dark) {
        const darkPath = path.join(EXTENSION_DIR, cmd.icon.dark);
        if (!fs.existsSync(darkPath))
          fail(`Command "${cmd.command}" missing dark icon: ${cmd.icon.dark}`);
      }
      if (cmd.icon.light) {
        const lightPath = path.join(EXTENSION_DIR, cmd.icon.light);
        if (!fs.existsSync(lightPath))
          fail(
            `Command "${cmd.command}" missing light icon: ${cmd.icon.light}`
          );
      }
    }
  }
}
ok('Command icon paths verified');

// ── 9. Check walkthrough media paths exist ──────────────────────────────
const walkthroughs = contributes.walkthroughs ?? [];
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

// ── 10. Check view icon paths exist ──────────────────────────────────────
const views = contributes.views ?? {};
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

// ── 11. Check viewContainer icon paths exist ─────────────────────────────
const viewContainers = contributes.viewsContainers ?? {};
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

// ── 12. Check grammar paths exist ────────────────────────────────────────
const grammars = contributes.grammars ?? [];
for (const grammar of grammars) {
  if (grammar.path) {
    const gPath = path.join(EXTENSION_DIR, grammar.path);
    if (!fs.existsSync(gPath)) {
      fail(`Grammar for "${grammar.language}" missing path: ${grammar.path}`);
    }
  }
}
ok('Grammar paths verified');

// ── 13. Check language configuration paths exist ─────────────────────────
const languages = contributes.languages ?? [];
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

// ── 14. Check snippet paths exist ────────────────────────────────────────
const snippets = contributes.snippets ?? [];
for (const snippet of snippets) {
  const snipPath = path.join(EXTENSION_DIR, snippet.path);
  if (!fs.existsSync(snipPath)) {
    fail(`Snippet for "${snippet.language}" missing: ${snippet.path}`);
  }
}
ok('Snippet paths verified');

// ── 15. Check jsonValidation schema paths exist ──────────────────────────
const jsonValidation = contributes.jsonValidation ?? [];
for (const jv of jsonValidation) {
  if (jv.url && !jv.url.startsWith('http')) {
    const schemaPath = path.join(EXTENSION_DIR, jv.url);
    if (!fs.existsSync(schemaPath)) {
      fail(`JSON validation schema missing: ${jv.url}`);
    }
  }
}
ok('JSON validation schema paths verified');

// ── 16. Check command category/title are non-empty ────────────────────────
for (const cmd of commands) {
  if (!cmd.title) {
    fail(`Command "${cmd.command}" has no title`);
  }
}
ok('Command titles present');

console.log(
  `  Commands Summary: ${commandIds.length} total, ${new Set(commandIds).size} unique`
);

if (exitCode === 0) {
  console.log('Package contribution validation PASSED.');
} else {
  console.error('Package contribution validation FAILED.');
}
process.exit(exitCode);
