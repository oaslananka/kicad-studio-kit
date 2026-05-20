#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..', '..');
const pkg = readJson('package.json');

const expected = {
  repository: 'https://github.com/oaslananka/kicad-studio-kit',
  bugs: 'https://github.com/oaslananka/kicad-studio-kit/issues',
  homepage:
    'https://github.com/oaslananka/kicad-studio-kit/tree/main/apps/vscode-extension',
  publisher: 'oaslananka'
};

assert(
  pkg.repository?.url === expected.repository,
  'repository.url must point to the org repository'
);
assert(pkg.bugs?.url === expected.bugs, 'bugs.url must point to org issues');
assert(
  pkg.homepage === expected.homepage,
  'homepage must point to the extension package in the monorepo'
);
assert(
  pkg.publisher === expected.publisher,
  'publisher must remain oaslananka'
);
assert(
  pkg.engines?.vscode === '^1.99.0',
  'VS Code engine drifted unexpectedly'
);
assert(pkg.engines?.node === '24.x', 'Node runtime drifted unexpectedly');
assert(
  pkg.main === './dist/extension.js',
  'extension entrypoint drifted unexpectedly'
);

const requiredRuntimeFiles = [
  'dist/extension.js',
  'package.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'assets/icon.png',
  'assets/icon-light.png',
  'assets/icon-dark.png',
  'language-configuration.json',
  'schemas/kicad-project.schema.json',
  'schemas/vscode-mcp.kicad.json',
  'syntaxes/kicad-schematic.tmLanguage.json',
  'syntaxes/kicad-pcb.tmLanguage.json',
  'media/kicanvas/kicanvas.js'
];

for (const file of requiredRuntimeFiles) {
  assert(
    fs.existsSync(path.join(root, file)),
    `required runtime file is missing: ${file}`
  );
}

const vscodeignore = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8');
for (const pattern of [
  '.github/**',
  'scripts/**',
  'src/**',
  'test/**',
  'coverage/**',
  'node_modules/**',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'release-please-config.json',
  '.release-please-manifest.json',
  'stryker.config.json',
  '*.vsix'
]) {
  assert(
    vscodeignore.includes(pattern),
    `.vscodeignore must exclude ${pattern}`
  );
}
assert(
  !vscodeignore.includes('dist/**'),
  '.vscodeignore must not exclude dist/**'
);
assert(
  !vscodeignore.includes('media/**'),
  '.vscodeignore must not exclude runtime media assets'
);

assert(pkg.packageManager?.startsWith('pnpm@'), 'packageManager must pin pnpm');
assert(
  fs.existsSync(path.join(repoRoot, 'pnpm-lock.yaml')),
  'root pnpm-lock.yaml must be committed'
);
assert(
  !fs.existsSync(path.join(root, 'package-lock.json')),
  'package-lock.json must not be committed'
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
