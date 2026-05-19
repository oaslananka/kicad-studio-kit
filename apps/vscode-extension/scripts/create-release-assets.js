#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
);
const vsixName = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(root, vsixName);

if (!fs.existsSync(vsixPath)) {
  throw new Error(`Missing VSIX artifact: ${vsixName}`);
}

const digest = crypto
  .createHash('sha256')
  .update(fs.readFileSync(vsixPath))
  .digest('hex');
fs.writeFileSync(
  path.join(root, 'SHA256SUMS.txt'),
  `${digest}  ${vsixName}\n`,
  'utf8'
);

const pnpmArgs = [
  '--silent',
  'sbom',
  '--sbom-format',
  'cyclonedx',
  '--sbom-type',
  'application'
];
const pnpmInvocation =
  process.platform === 'win32'
    ? {
        command: process.env.ComSpec ?? 'cmd.exe',
        args: ['/d', '/s', '/c', 'pnpm', ...pnpmArgs]
      }
    : { command: 'pnpm', args: pnpmArgs };
const sbom = spawnSync(pnpmInvocation.command, pnpmInvocation.args, {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'inherit']
});

if (sbom.error) {
  console.error(sbom.error.message);
  process.exit(1);
}

if (sbom.status !== 0) {
  process.exit(sbom.status ?? 1);
}

const parsedSbom = parseJsonOutput(sbom.stdout);

fs.writeFileSync(
  path.join(root, 'sbom.cdx.json'),
  `${JSON.stringify(parsedSbom, null, 2)}\n`,
  'utf8'
);

function parseJsonOutput(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error('pnpm sbom returned empty output.');
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const parsed = parseJsonDocumentFromNoisyOutput(output);
    if (parsed) {
      return parsed;
    }
    throw new Error(
      `pnpm sbom did not return valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function parseJsonDocumentFromNoisyOutput(output) {
  const lines = output.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const column = lines[index].indexOf('{');
    if (column === -1) {
      continue;
    }

    const candidate = [lines[index].slice(column), ...lines.slice(index + 1)]
      .join('\n')
      .trim();
    const end = candidate.lastIndexOf('}');
    if (end === -1) {
      continue;
    }

    try {
      return JSON.parse(candidate.slice(0, end + 1));
    } catch {
      continue;
    }
  }
  return null;
}
