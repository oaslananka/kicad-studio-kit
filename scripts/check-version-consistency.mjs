#!/usr/bin/env node
import fs from "node:fs";

const expected = "1.0.0";
const checks = [];
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function add(file, field, value) {
  checks.push({ file, field, value });
}

add("apps/vscode-extension/package.json", "$.version", readJson("apps/vscode-extension/package.json").version);

const pyproject = fs.readFileSync("packages/mcp-server/pyproject.toml", "utf8");
add("packages/mcp-server/pyproject.toml", "[project].version", pyproject.match(/^version = "([^"]+)"/m)?.[1]);

const init = fs.readFileSync("packages/mcp-server/src/kicad_mcp/__init__.py", "utf8");
add("packages/mcp-server/src/kicad_mcp/__init__.py", "__version__", init.match(/^__version__ = "([^"]+)"/m)?.[1]);

for (const file of ["packages/mcp-server/mcp.json", "packages/mcp-server/server.json"]) {
  const data = readJson(file);
  add(file, "$.version", data.version);
  data.packages.forEach((pkg, index) => add(file, `$.packages[${index}].version`, pkg.version));
}

add("packages/mcp-npm/package.json", "$.version", readJson("packages/mcp-npm/package.json").version);
const manifest = readJson(".release-please-manifest.json");
for (const [key, value] of Object.entries(manifest)) {
  add(".release-please-manifest.json", key, value);
}

const drift = checks.filter((check) => check.value !== expected);
if (drift.length > 0) {
  console.error("Version drift detected:");
  for (const check of drift) {
    console.error(`- ${check.file} ${check.field}: expected ${expected}, found ${String(check.value)}`);
  }
  process.exit(1);
}

console.log(`All release surfaces are ${expected}.`);
