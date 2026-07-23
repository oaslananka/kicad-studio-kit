import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  buildCoverageInventory,
  matchGlob,
  renderCoverageInventoryMarkdown,
  validateCoverageScope
} = require('./coverage-scope.cjs');

const extensionRoot = path.resolve(import.meta.dirname, '..');

test('current coverage scope is complete and deterministic (#528)', () => {
  const result = validateCoverageScope(extensionRoot);
  assert.deepEqual(result.errors, []);
  assert.equal(result.inventory.schemaVersion, 1);
  assert.equal(result.inventory.summary.excludedFiles, 18);
  assert.equal(
    result.inventory.excluded.filter((item) => !item.path.endsWith('.d.ts'))
      .length,
    16
  );
  assert.equal(result.inventory.ratchet.files.length, 8);
  assert.ok(result.inventory.summary.excludedLines > 0);
  assert.ok(result.inventory.summary.includedFiles > 0);

  const markdown = renderCoverageInventoryMarkdown(result.inventory);
  assert.match(markdown, /Measured unit-coverage denominator/u);
  assert.match(markdown, /Targeted ratchet/u);
  assert.doesNotMatch(markdown, /generated at/iu);
});

test('GitHub Ubuntu ratchet baseline is frozen for the base viewer provider (#528)', () => {
  const ratchetConfig = require('../jest.coverage-ratchet.config.js');
  assert.deepEqual(
    ratchetConfig.coverageThreshold[
      'src/providers/baseKiCanvasEditorProvider.ts'
    ],
    {
      statements: -120,
      branches: -105,
      functions: -19,
      lines: -115
    }
  );
});

test('glob matching expands directory exclusions predictably (#528)', () => {
  assert.equal(
    matchGlob('src/activation/activationState.ts', 'src/activation/**/*.ts'),
    true
  );
  assert.equal(
    matchGlob('src/activation/nested/controller.ts', 'src/activation/**/*.ts'),
    true
  );
  assert.equal(
    matchGlob('src/activationState.ts', 'src/activation/**/*.ts'),
    false
  );
  assert.equal(matchGlob('src/types.d.ts', 'src/**/*.d.ts'), true);
});

test('missing and stale exclusion ownership are rejected (#528)', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-scope-'));
  try {
    fs.mkdirSync(path.join(tempRoot, 'src', 'activation'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'src', 'included.ts'),
      'export const included = 1;\n'
    );
    fs.writeFileSync(
      path.join(tempRoot, 'src', 'activation', 'excluded.ts'),
      'export const excluded = 1;\n'
    );
    fs.writeFileSync(
      path.join(tempRoot, 'jest.config.js'),
      "module.exports={collectCoverageFrom:['src/**/*.ts','!src/activation/**/*.ts'],coverageThreshold:{global:{lines:80,statements:80,branches:70,functions:80}}};\n"
    );
    fs.writeFileSync(
      path.join(tempRoot, 'jest.coverage-ratchet.config.js'),
      'module.exports={collectCoverageFrom:[],coverageThreshold:{},testMatch:[]};\n'
    );
    fs.writeFileSync(
      path.join(tempRoot, 'coverage-scope.json'),
      JSON.stringify({
        schemaVersion: 1,
        declarationExclusion: {
          pattern: '!src/**/*.d.ts',
          category: 'generated',
          owner: 'TypeScript',
          strategy: 'Declaration-only source',
          rationale: 'No executable statements.',
          evidence: ['tsconfig.json']
        },
        exclusions: {
          'src/activation/stale.ts': {
            category: 'integration-owned',
            owner: 'Extension host',
            strategy: 'Host integration',
            rationale: 'Requires a VS Code host.',
            evidence: ['test/integration/extension.test.ts']
          }
        },
        ratchet: { files: [], tests: [] }
      })
    );

    const result = validateCoverageScope(tempRoot);
    assert.ok(
      result.errors.some((error) => error.includes('missing classification'))
    );
    assert.ok(
      result.errors.some((error) => error.includes('stale classification'))
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('inventory line totals are derived from source content (#528)', () => {
  const inventory = buildCoverageInventory({
    sourceFiles: [
      { path: 'src/included.ts', lines: 4, excludedBy: [] },
      { path: 'src/excluded.ts', lines: 7, excludedBy: ['!src/excluded.ts'] }
    ],
    manifest: {
      schemaVersion: 1,
      exclusions: {
        'src/excluded.ts': {
          category: 'explicitly-justified',
          coverageMode: 'targeted-ratchet',
          owner: 'Unit tests',
          strategy: 'Focused Jest coverage',
          rationale: 'Protected outside the headline denominator.',
          evidence: ['test/unit/excluded.test.ts']
        }
      },
      ratchet: {
        files: ['src/excluded.ts'],
        tests: ['test/unit/excluded.test.ts']
      }
    },
    globalThresholds: {
      lines: 83,
      statements: 83,
      branches: 70,
      functions: 88
    },
    ratchetThresholds: {
      'src/excluded.ts': {
        lines: -2,
        statements: -2,
        branches: -1,
        functions: -1
      }
    }
  });

  assert.equal(inventory.summary.sourceFiles, 2);
  assert.equal(inventory.summary.includedLines, 4);
  assert.equal(inventory.summary.excludedLines, 7);
  assert.equal(inventory.excluded[0].coverageMode, 'targeted-ratchet');
});
