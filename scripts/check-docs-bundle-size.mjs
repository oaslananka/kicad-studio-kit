#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DOCS_CHUNK_MAX_BYTES = 500_000;
export const DOCS_SEARCH_CHUNK_MAX_BYTES = 625_000;

function walkJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkJavaScriptFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

function isLocalSearchChunk(filePath) {
  return path.basename(filePath).startsWith("@localSearchIndex");
}

export function validateDocsBundle(rootDirectory) {
  const assetsDirectory = path.join(rootDirectory, "assets");
  const assets = walkJavaScriptFiles(assetsDirectory)
    .map((filePath) => ({
      path: path.relative(rootDirectory, filePath).split(path.sep).join("/"),
      bytes: fs.statSync(filePath).size,
      localSearch: isLocalSearchChunk(filePath),
    }))
    .sort((left, right) => right.bytes - left.bytes);
  const errors = [];
  const searchAssets = assets.filter((asset) => asset.localSearch);

  if (searchAssets.length === 0) {
    errors.push("Documentation bundle is missing the local search chunk.");
  }

  for (const asset of assets) {
    const limit = asset.localSearch
      ? DOCS_SEARCH_CHUNK_MAX_BYTES
      : DOCS_CHUNK_MAX_BYTES;
    if (asset.bytes > limit) {
      const category = asset.localSearch
        ? "local search chunk"
        : "documentation chunk";
      errors.push(
        `${asset.path}: ${category} is ${asset.bytes} bytes, above the ${limit}-byte limit.`,
      );
    }
  }

  return { assets, errors };
}

function formatBytes(bytes) {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

function runCli() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDirectory, "..");
  const rootDirectory = path.resolve(
    process.argv[2] ?? path.join(repoRoot, "site"),
  );
  const { assets, errors } = validateDocsBundle(rootDirectory);

  for (const asset of assets.slice(0, 10)) {
    const limit = asset.localSearch
      ? DOCS_SEARCH_CHUNK_MAX_BYTES
      : DOCS_CHUNK_MAX_BYTES;
    console.log(
      `${asset.path}: ${formatBytes(asset.bytes)} / limit ${formatBytes(limit)}`,
    );
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Documentation bundle policy passed: ${assets.length} JavaScript assets.`,
  );
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  runCli();
}
