#!/usr/bin/env node

const path = require('node:path');
const process = require('node:process');
const { spawnSync } = require('node:child_process');

const OPEN_HANDLE_DIAGNOSTIC =
  /Jest has detected the following \d+ open handles? potentially keeping Jest from exiting:/u;
const DELAYED_EXIT_DIAGNOSTIC =
  /Jest did not exit one second after the test run has completed\./u;

function evaluateA11yTestResult(result) {
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  const output = `${stdout}\n${stderr}`;

  if (result.error) {
    return {
      ok: false,
      exitCode: 1,
      message: `Unable to start the accessibility suite: ${result.error.message ?? String(result.error)}`
    };
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    return { ok: false, exitCode: result.status, message: '' };
  }

  if (result.signal) {
    return {
      ok: false,
      exitCode: 1,
      message: `Accessibility suite terminated by signal ${result.signal}`
    };
  }

  if (OPEN_HANDLE_DIAGNOSTIC.test(output)) {
    return {
      ok: false,
      exitCode: 1,
      message:
        'Accessibility suite passed assertions but emitted open handle diagnostics.'
    };
  }

  if (DELAYED_EXIT_DIAGNOSTIC.test(output)) {
    return {
      ok: false,
      exitCode: 1,
      message: 'Accessibility suite did not exit naturally after teardown.'
    };
  }

  return { ok: true, exitCode: 0, message: '' };
}

function runAccessibilityTests() {
  const scriptRoot = path.dirname(require.resolve('./run-a11y-tests.cjs'));
  const extensionRoot = path.resolve(scriptRoot, '..');
  const jestBin = require.resolve('jest/bin/jest', {
    paths: [extensionRoot]
  });
  const result = spawnSync(
    process.execPath,
    [
      jestBin,
      '--config',
      'jest.config.js',
      '--runInBand',
      '--detectOpenHandles',
      '--coverage=false',
      '--testMatch',
      '<rootDir>/test/a11y/**/*.test.ts'
    ],
    {
      cwd: extensionRoot,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
      shell: false
    }
  );

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  const evaluation = evaluateA11yTestResult(result);
  if (evaluation.message) {
    process.stderr.write(`\n[a11y-resource-guard] ${evaluation.message}\n`);
  }
  process.exitCode = evaluation.exitCode;
}

module.exports = {
  evaluateA11yTestResult,
  runAccessibilityTests
};

if (require.main === module) {
  runAccessibilityTests();
}
