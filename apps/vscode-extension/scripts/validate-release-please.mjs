#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

main();

function main() {
  const pkg = readJson('package.json');
  const config = readJson('release-please-config.json');
  const manifest = readJson('.release-please-manifest.json');
  const packageConfig = config.packages?.['.'];

  assert(config['release-type'] === 'node', 'release type must be node');
  assert(packageConfig, 'release-please config must define package "."');
  assert(
    packageConfig['package-name'] === pkg.name,
    'release package name must match package.json name'
  );
  assert(
    packageConfig['changelog-path'] === 'CHANGELOG.md',
    'release changelog path must be CHANGELOG.md'
  );
  assert(
    manifest['.'] === pkg.version,
    'release-please manifest version must match package.json version'
  );
  assert(
    typeof pkg.packageManager === 'string' &&
      pkg.packageManager.startsWith('pnpm@'),
    'packageManager must pin pnpm'
  );
  assert(
    fs.existsSync(path.join(ROOT, 'pnpm-lock.yaml')),
    'pnpm-lock.yaml missing'
  );
  assert(
    !fs.existsSync(path.join(ROOT, 'package-lock.json')),
    'package-lock.json must not be committed after pnpm migration'
  );

  console.log('Release-please manifest mode is valid.');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
