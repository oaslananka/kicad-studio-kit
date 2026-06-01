#!/usr/bin/env node
import fs from "node:fs";

const checks = [];
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function add(file, field, value) {
  checks.push({ file, field, value });
}

add(
  "apps/vscode-extension/package.json",
  "$.version",
  readJson("apps/vscode-extension/package.json").version,
);

const manifest = readJson(".release-please-manifest.json");
const releasePlease = readJson("release-please-config.json");
for (const [key, value] of Object.entries(manifest)) {
  add(".release-please-manifest.json", key, value);
}

const expectedByField = new Map([
  [
    "apps/vscode-extension/package.json $.version",
    manifest["apps/vscode-extension"],
  ],
]);

function expectedFor(check) {
  const key = `${check.file} ${check.field}`;
  if (expectedByField.has(key)) {
    return expectedByField.get(key);
  }
  if (check.file === ".release-please-manifest.json") {
    return manifest[check.field];
  }
  return undefined;
}

const drift = checks
  .map((check) => ({ ...check, expected: expectedFor(check) }))
  .filter((check) => check.value !== check.expected);
const expectedManifestKeys = new Set(Object.keys(releasePlease.packages ?? {}));
const manifestKeys = new Set(Object.keys(manifest));
const unexpectedManifestKeys = [...manifestKeys].filter(
  (key) => !expectedManifestKeys.has(key),
);
const missingManifestKeys = [...expectedManifestKeys].filter(
  (key) => !manifestKeys.has(key),
);
if (unexpectedManifestKeys.length > 0 || missingManifestKeys.length > 0) {
  console.error("Release Please manifest paths are not product-scoped:");
  for (const key of unexpectedManifestKeys) {
    console.error(`- unexpected manifest path: ${key}`);
  }
  for (const key of missingManifestKeys) {
    console.error(`- missing manifest path: ${key}`);
  }
  process.exit(1);
}
if (drift.length > 0) {
  console.error("Version drift detected:");
  for (const check of drift) {
    console.error(
      `- ${check.file} ${check.field}: expected ${check.expected}, found ${String(check.value)}`,
    );
  }
  process.exit(1);
}

console.log("All release surfaces match .release-please-manifest.json.");
