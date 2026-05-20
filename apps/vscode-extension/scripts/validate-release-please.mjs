#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');
const PACKAGE_PATH = 'apps/vscode-extension';

main();

function main() {
  const pkg = readJson(APP_ROOT, 'package.json');
  const config = readJson('release-please-config.json');
  const manifest = readJson('.release-please-manifest.json');
  const packageConfig = config.packages?.[PACKAGE_PATH];

  assert(
    config['separate-pull-requests'] === true,
    'release-please must create product-scoped release PRs'
  );
  assert(
    config['include-component-in-tag'] === true,
    'release tags must include product components'
  );
  assert(
    packageConfig,
    `release-please config must define package "${PACKAGE_PATH}"`
  );
  assert(packageConfig['release-type'] === 'node', 'release type must be node');
  assert(
    packageConfig['package-name'] === pkg.name,
    'release package name must match package.json name'
  );
  assert(
    packageConfig.component === 'vscode-extension',
    'release component must be vscode-extension'
  );
  assert(
    packageConfig['changelog-path'] === 'CHANGELOG.md',
    'release changelog path must be CHANGELOG.md'
  );
  assert(
    manifest[PACKAGE_PATH] === pkg.version,
    'release-please manifest version must match package.json version'
  );
  assert(
    !linkedVersionComponents(config).includes('vscode-extension'),
    'extension version must not be linked to MCP server releases'
  );
  assert(
    typeof pkg.packageManager === 'string' &&
      pkg.packageManager.startsWith('pnpm@'),
    'packageManager must pin pnpm'
  );
  assert(
    fs.existsSync(path.join(REPO_ROOT, 'pnpm-lock.yaml')),
    'pnpm-lock.yaml missing'
  );
  assert(
    !fs.existsSync(path.join(APP_ROOT, 'package-lock.json')),
    'package-lock.json must not be committed after pnpm migration'
  );

  console.log('Extension release-please manifest mode is valid.');
}

function readJson(rootOrFile, maybeFile) {
  const root = maybeFile ? rootOrFile : REPO_ROOT;
  const file = maybeFile ?? rootOrFile;
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function linkedVersionComponents(config) {
  return (config.plugins ?? [])
    .filter((plugin) => plugin && plugin.type === 'linked-versions')
    .flatMap((plugin) => plugin.components ?? []);
}

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
