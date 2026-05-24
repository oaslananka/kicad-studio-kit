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

function readPackageJson() {
  return JSON.parse(
    fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')
  );
}
