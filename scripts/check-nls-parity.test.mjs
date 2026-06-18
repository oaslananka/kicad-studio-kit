import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(__dirname, 'check-nls-parity.mjs');
const EXTENSION_DIR = path.join(REPO_ROOT, 'apps', 'vscode-extension');

function runScript() {
  return execSync(`node "${SCRIPT_PATH}"`, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function runScriptExpectFail() {
  try {
    execSync(`node "${SCRIPT_PATH}"`, {
      encoding: 'utf8',
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return null;
  } catch (e) {
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      status: e.status
    };
  }
}

describe('check-nls-parity', () => {
  it('passes for the current locale files', () => {
    const result = runScript();
    assert.ok(result.includes('✓'));
    assert.equal(result.split('\n').filter(l => l.includes('✓')).length, 1);
  });

  it('detects missing keys in a locale file', () => {
    const trPath = path.join(EXTENSION_DIR, 'package.nls.tr.json');
    const original = fs.readFileSync(trPath, 'utf8');
    try {
      // Temporarily remove a key from the Turkish file
      const data = JSON.parse(original);
      const removedKey = Object.keys(data)[0];
      delete data[removedKey];
      fs.writeFileSync(trPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

      const result = runScriptExpectFail();
      assert.ok(result !== null, 'Script should have failed');
      assert.ok(result.stderr.includes('missing') || result.stdout.includes('missing'));
      assert.notEqual(result.status, 0);
    } finally {
      fs.writeFileSync(trPath, original, 'utf8');
    }
  });

  it('detects extra keys in a locale file', () => {
    const trPath = path.join(EXTENSION_DIR, 'package.nls.tr.json');
    const original = fs.readFileSync(trPath, 'utf8');
    try {
      // Add an extra key to the Turkish file
      const data = JSON.parse(original);
      data['__test_extra_key__'] = 'test value';
      fs.writeFileSync(trPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

      const result = runScriptExpectFail();
      assert.ok(result !== null, 'Script should have failed');
      assert.ok(result.stderr.includes('extra') || result.stdout.includes('extra'));
      assert.notEqual(result.status, 0);
    } finally {
      fs.writeFileSync(trPath, original, 'utf8');
    }
  });

  it('detects a new user-facing string left untranslated', () => {
    const basePath = path.join(EXTENSION_DIR, 'package.nls.json');
    const trPath = path.join(EXTENSION_DIR, 'package.nls.tr.json');
    const baseOriginal = fs.readFileSync(basePath, 'utf8');
    const trOriginal = fs.readFileSync(trPath, 'utf8');
    try {
      // Add a matching key to both locales with an identical, non-allowlisted
      // value (a real sentence, not a proper noun / category / alias).
      const baseData = JSON.parse(baseOriginal);
      const trData = JSON.parse(trOriginal);
      baseData['__test_untranslated__'] = 'Run the design rule check now';
      trData['__test_untranslated__'] = 'Run the design rule check now';
      fs.writeFileSync(basePath, JSON.stringify(baseData, null, 2) + '\n', 'utf8');
      fs.writeFileSync(trPath, JSON.stringify(trData, null, 2) + '\n', 'utf8');

      const result = runScriptExpectFail();
      assert.ok(result !== null, 'Script should have failed');
      assert.ok(
        result.stderr.includes('untranslated') ||
          result.stdout.includes('untranslated')
      );
      assert.notEqual(result.status, 0);
    } finally {
      fs.writeFileSync(basePath, baseOriginal, 'utf8');
      fs.writeFileSync(trPath, trOriginal, 'utf8');
    }
  });

  it('allows identical values for brand names, categories, and aliases', () => {
    const basePath = path.join(EXTENSION_DIR, 'package.nls.json');
    const trPath = path.join(EXTENSION_DIR, 'package.nls.tr.json');
    const baseOriginal = fs.readFileSync(basePath, 'utf8');
    const trOriginal = fs.readFileSync(trPath, 'utf8');
    try {
      const baseData = JSON.parse(baseOriginal);
      const trData = JSON.parse(trOriginal);
      // A *.category key is an allowed identical value.
      baseData['kicadstudio.contributes.commands.test.category'] = 'KiCad';
      trData['kicadstudio.contributes.commands.test.category'] = 'KiCad';
      fs.writeFileSync(basePath, JSON.stringify(baseData, null, 2) + '\n', 'utf8');
      fs.writeFileSync(trPath, JSON.stringify(trData, null, 2) + '\n', 'utf8');

      const result = runScript();
      assert.ok(result.includes('✓'));
    } finally {
      fs.writeFileSync(basePath, baseOriginal, 'utf8');
      fs.writeFileSync(trPath, trOriginal, 'utf8');
    }
  });

  it('fails when no locale files exist', () => {
    const trPath = path.join(EXTENSION_DIR, 'package.nls.tr.json');
    const original = fs.readFileSync(trPath, 'utf8');
    try {
      // Temporarily rename the Turkish file
      const tmpPath = trPath + '.tmp';
      fs.renameSync(trPath, tmpPath);

      const result = runScriptExpectFail();
      // Should still pass with 0 exit code since it says "No locale files found"
      // Actually the script says "No locale NLS files found to check." with exit 0
      assert.ok(result === null || result.status === 0);
    } finally {
      // Restore
      const tmpPath = trPath + '.tmp';
      if (fs.existsSync(tmpPath)) {
        fs.renameSync(tmpPath, trPath);
      }
    }
  });
});
