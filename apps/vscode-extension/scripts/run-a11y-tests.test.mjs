import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { evaluateA11yTestResult } = require('./run-a11y-tests.cjs');

test('accepts a clean successful accessibility run (#529)', () => {
  assert.deepEqual(
    evaluateA11yTestResult({
      status: 0,
      stdout: 'Tests: 76 passed, 76 total\n',
      stderr: ''
    }),
    { ok: true, exitCode: 0, message: '' }
  );
});

test('fails when Jest reports open handles despite passing assertions (#529)', () => {
  const result = evaluateA11yTestResult({
    status: 0,
    stdout: '',
    stderr:
      'Jest has detected the following 2 open handles potentially keeping Jest from exiting:\n'
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.match(result.message, /open handle diagnostics/u);
});

test('fails when Jest reports a delayed natural exit (#529)', () => {
  const result = evaluateA11yTestResult({
    status: 0,
    stdout: '',
    stderr: 'Jest did not exit one second after the test run has completed.\n'
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.match(result.message, /did not exit naturally/u);
});

test('preserves an existing Jest failure status (#529)', () => {
  assert.deepEqual(
    evaluateA11yTestResult({
      status: 2,
      stdout: '',
      stderr: 'FAIL test/a11y/accessibilityConformance.test.ts\n'
    }),
    { ok: false, exitCode: 2, message: '' }
  );
});
