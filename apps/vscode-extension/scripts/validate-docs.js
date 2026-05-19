#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const docs = [
  'README.md',
  'SECURITY.md',
  ...walk(path.join(root, 'docs'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
];

const forbidden = [
  'Canonical Repository:** `https://github.com/oaslananka/kicad-studio-kit`',
  'canonical public repository',
  'CI/CD runner mirror',
  'Sync from canonical',
  'marketplace environment'
];

for (const file of docs) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const phrase of forbidden) {
    if (text.includes(phrase)) {
      throw new Error(
        `${file} contains stale repository-model wording: ${phrase}`
      );
    }
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}
