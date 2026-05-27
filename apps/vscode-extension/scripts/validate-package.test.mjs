import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseVsceFileList, validatePackage } = require('./validate-package.js');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(extensionRoot, '..', '..');

test('parseVsceFileList normalizes the plain vsce listing', () => {
  assert.deepEqual(
    parseVsceFileList(`
package.json
dist/extension.js
media/kicanvas/kicanvas.js
assets/screenshots/schematic-viewer.png
`),
    [
      'package.json',
      'dist/extension.js',
      'media/kicanvas/kicanvas.js',
      'assets/screenshots/schematic-viewer.png'
    ]
  );
});

test('validatePackage rejects contributed commands without registered implementation', () => {
  const packageJson = readPackageJson();
  packageJson.contributes.commands = [
    ...(packageJson.contributes.commands ?? []),
    {
      command: 'kicadstudio.unregisteredFixture',
      title: 'Fixture command'
    }
  ];

  assert.throws(
    () =>
      validatePackage({
        root: extensionRoot,
        repoRoot,
        packageJson,
        runVsce: false,
        validatePackageFiles: false
      }),
    /contributed command is not registered: kicadstudio\.unregisteredFixture/
  );
});

test('validatePackage rejects the deleted Marketplace package name', () => {
  const packageJson = readPackageJson();
  packageJson.name = 'kicadstudio';

  assert.throws(
    () =>
      validatePackage({
        root: extensionRoot,
        repoRoot,
        packageJson,
        runVsce: false,
        validatePackageFiles: false
      }),
    /extension package name must be kicadstudiokit/
  );
});

test('validatePackage rejects forbidden packaged files', () => {
  assert.throws(
    () =>
      validatePackage({
        root: extensionRoot,
        repoRoot,
        packageJson: readPackageJson(),
        packageFiles: [
          'package.json',
          'dist/extension.js',
          'media/kicanvas/kicanvas.js',
          'node_modules/cache/index.js'
        ],
        runVsce: false
      }),
    /forbidden packaged file matched node_modules\/\*\*: node_modules\/cache\/index\.js/
  );
});

test('validatePackage allows webview-only test scripts without enabling a web target', () => {
  const packageJson = readPackageJson();
  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
    'test:webview': 'playwright test --config playwright.webview.config.ts'
  };

  assert.doesNotThrow(() =>
    validatePackage({
      root: extensionRoot,
      repoRoot,
      packageJson,
      runVsce: false,
      validatePackageFiles: false
    })
  );
});

test('validatePackage still rejects web build target scripts', () => {
  const packageJson = readPackageJson();
  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
    'build:web': 'webpack --config web.config.js'
  };

  assert.throws(
    () =>
      validatePackage({
        root: extensionRoot,
        repoRoot,
        packageJson,
        runVsce: false,
        validatePackageFiles: false
      }),
    /web build script must not be introduced before ADR-0006 accepts it: build:web/
  );
});

function readPackageJson() {
  return JSON.parse(
    fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')
  );
}
