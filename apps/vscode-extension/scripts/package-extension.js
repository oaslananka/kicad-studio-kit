#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
);
const vsixName = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(root, vsixName);
const isPreRelease =
  process.env.KICAD_STUDIO_EXTENSION_PRE_RELEASE === 'true' ||
  process.argv.includes('--pre-release');

if (fs.existsSync(vsixPath)) {
  fs.rmSync(vsixPath, { force: true });
}

const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules', '@vscode', 'vsce', 'vsce'),
    'package',
    '--no-dependencies',
    '--out',
    vsixName,
    ...(isPreRelease ? ['--pre-release'] : [])
  ],
  {
    cwd: root,
    stdio: 'inherit',
    shell: false
  }
);

if (result.status !== 0) {
  if (result.error) {
    console.error(result.error.message);
  }
  process.exit(result.status ?? 1);
}
