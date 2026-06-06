#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createLinter } = require('actionlint');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..', '..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const ignoredMessages = [
  // The npm WASM build lags GitHub's current permissions list. GitHub's
  // artifact attestation docs require these scopes for provenance metadata.
  /unknown permission scope "attestations"/,
  /unknown permission scope "artifact-metadata"/,
  /label "(ubuntu-24\.04|windows-2025|macos-15)" is unknown/
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const files = fs
    .readdirSync(workflowsDir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort();

  const results = [];
  for (const file of files) {
    const lint = await createLinter();
    const fullPath = path.join(workflowsDir, file);
    const input = fs.readFileSync(fullPath, 'utf8');
    results.push(
      ...lint(input, pathToFileURL(fullPath).pathname)
        .filter(
          (result) =>
            !ignoredMessages.some((pattern) => pattern.test(result.message))
        )
        .map((result) => ({
          ...result,
          file
        }))
    );
  }

  for (const result of results) {
    console.error(
      `${result.file}:${result.line}:${result.column}: ${result.message} [${result.kind}]`
    );
  }

  if (results.length > 0) {
    process.exit(1);
  }
}
