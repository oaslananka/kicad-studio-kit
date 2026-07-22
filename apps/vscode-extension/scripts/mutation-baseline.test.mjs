import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  renderMutationSummaryMarkdown,
  validateMutationPolicy,
  validateMutationReport
} = require('./mutation-baseline.cjs');

const extensionRoot = path.resolve(import.meta.dirname, '..');
const config = require('../stryker.config.json');
const baseline = require('../mutation-baseline.json');

function location(line) {
  return {
    start: { line, column: 0 },
    end: { line, column: 1 }
  };
}

function reportFixture() {
  const files = {};
  for (const [file, expected] of Object.entries(baseline.files)) {
    const allowed = baseline.allowedSurvivors.filter(
      (item) => item.file === file
    );
    const mutants = allowed.map((item) => ({
      id: item.id,
      mutatorName: item.mutatorName,
      replacement: item.replacement,
      static: item.static,
      location: item.location,
      status: 'Survived'
    }));
    for (
      let index = mutants.length;
      index < expected.minimumMutants;
      index += 1
    ) {
      mutants.push({
        id: `killed-${index}`,
        mutatorName: 'BooleanLiteral',
        replacement: 'false',
        static: false,
        location: location(index + 100),
        status: 'Killed'
      });
    }
    files[file] = { language: 'typescript', mutants, source: '' };
  }
  return {
    schemaVersion: '1.0',
    thresholds: config.thresholds,
    config,
    files,
    testFiles: {}
  };
}

test('current mutation policy is complete and blocking (#496)', () => {
  const result = validateMutationPolicy(extensionRoot);
  assert.deepEqual(result.errors, []);
  assert.equal(result.config.thresholds.break, 96.3);
  assert.equal(result.baseline.scope.mutate.length, 7);
  assert.equal(result.baseline.scope.minimumMutants, 166);
  assert.equal(result.baseline.allowedSurvivors.length, 6);
});

test('baseline report passes with documented survivors and module scores (#496)', () => {
  const result = validateMutationReport(extensionRoot, reportFixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.overall.score, 96.3855);
  assert.equal(result.overall.survived, 6);
  assert.equal(result.overall.noCoverage, 0);
  assert.match(
    renderMutationSummaryMarkdown(result),
    /Deferred expensive shards/u
  );
});

test('an undocumented survivor fails even when the overall score remains high (#496)', () => {
  const report = reportFixture();
  const mutant =
    report.files['src/mcp/protocol/mcp2025ProtocolAdapter.ts'].mutants[0];
  mutant.status = 'Survived';

  const result = validateMutationReport(extensionRoot, report);
  assert.ok(
    result.errors.some((error) =>
      error.includes('undocumented surviving mutant')
    )
  );
  assert.ok(result.errors.some((error) => error.includes('mutation score')));
});

test('scope shrinkage and no-coverage regressions fail closed (#496)', () => {
  const report = reportFixture();
  report.files['src/mcp/toolCallParser.ts'].mutants.pop();
  report.files['src/utils/workspaceTrust.ts'].mutants[0].status = 'NoCoverage';

  const result = validateMutationReport(extensionRoot, report);
  assert.ok(
    result.errors.some((error) => error.includes('baseline requires at least'))
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes('no-coverage mutants regressed')
    )
  );
});
