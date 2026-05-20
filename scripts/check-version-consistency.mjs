#!/usr/bin/env node
import fs from "node:fs";

const baseline = "1.0.0";
const branchName =
  process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "";
const isReleasePleaseBranch = branchName.startsWith(
  "release-please--branches--",
);
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

const pyproject = fs.readFileSync("packages/mcp-server/pyproject.toml", "utf8");
add(
  "packages/mcp-server/pyproject.toml",
  "[project].version",
  pyproject.match(/^version = "([^"]+)"/m)?.[1],
);

const init = fs.readFileSync(
  "packages/mcp-server/src/kicad_mcp/__init__.py",
  "utf8",
);
add(
  "packages/mcp-server/src/kicad_mcp/__init__.py",
  "__version__",
  init.match(/^__version__ = "([^"]+)"/m)?.[1],
);

for (const file of [
  "packages/mcp-server/mcp.json",
  "packages/mcp-server/server.json",
]) {
  const data = readJson(file);
  add(file, "$.version", data.version);
  data.packages.forEach((pkg, index) =>
    add(file, `$.packages[${index}].version`, pkg.version),
  );
}

add(
  "packages/mcp-npm/package.json",
  "$.version",
  readJson("packages/mcp-npm/package.json").version,
);
const manifest = readJson(".release-please-manifest.json");
const releasePlease = readJson("release-please-config.json");
for (const [key, value] of Object.entries(manifest)) {
  add(".release-please-manifest.json", key, value);
}

const expectedByField = new Map(
  isReleasePleaseBranch
    ? [
        [
          "apps/vscode-extension/package.json $.version",
          manifest["apps/vscode-extension"],
        ],
        [
          "packages/mcp-server/pyproject.toml [project].version",
          manifest["packages/mcp-server"],
        ],
        [
          "packages/mcp-server/src/kicad_mcp/__init__.py __version__",
          manifest["packages/mcp-server"],
        ],
        [
          "packages/mcp-server/mcp.json $.version",
          manifest["packages/mcp-server"],
        ],
        [
          "packages/mcp-server/server.json $.version",
          manifest["packages/mcp-server"],
        ],
        [
          "packages/mcp-npm/package.json $.version",
          manifest["packages/mcp-npm"],
        ],
      ]
    : [],
);

function expectedFor(check) {
  if (!isReleasePleaseBranch) {
    return baseline;
  }
  const key = `${check.file} ${check.field}`;
  if (expectedByField.has(key)) {
    return expectedByField.get(key);
  }
  if (
    check.file === "packages/mcp-server/mcp.json" &&
    check.field.startsWith("$.packages[")
  ) {
    return manifest["packages/mcp-server"];
  }
  if (
    check.file === "packages/mcp-server/server.json" &&
    check.field.startsWith("$.packages[")
  ) {
    return manifest["packages/mcp-server"];
  }
  if (check.file === ".release-please-manifest.json") {
    return manifest[check.field];
  }
  return baseline;
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
if (manifest["packages/mcp-server"] !== manifest["packages/mcp-npm"]) {
  console.error(
    "MCP server and npm launcher manifest versions must stay linked.",
  );
  console.error(`- packages/mcp-server: ${manifest["packages/mcp-server"]}`);
  console.error(`- packages/mcp-npm: ${manifest["packages/mcp-npm"]}`);
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

if (isReleasePleaseBranch) {
  console.log("Release Please branch versions are internally consistent.");
} else {
  console.log(`All release surfaces are ${baseline}.`);
}
