#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function requireIncludes(text, needle, source) {
  if (!text.includes(needle)) {
    failures.push(`${source} must include ${JSON.stringify(needle)}`);
  }
}

const template = read(".github/PULL_REQUEST_TEMPLATE.md");
const protocolDoc = read("docs/architecture/protocol-change-checklist.md");
const definitionOfDone = read("docs/architecture/definition-of-done.md");
const productBoundaries = read("docs/architecture/product-boundaries.md");
const architectureIndex = read("docs/architecture/index.md");
const rootContributing = read("CONTRIBUTING.md");
const contributing = read("docs/contributing.md");
const testingStrategy = read("docs/testing-strategy.md");
const packageJson = readJson("package.json");

const requiredTemplatePhrases = [
  "## Protocol / MCP impact",
  "Not applicable; reason:",
  "Protocol schema updated",
  "MCP server implementation updated",
  "Extension MCP adapter updated",
  "Contract tests updated",
  "Compatibility matrix updated",
  "Server-info/capabilities payload updated",
  "Docs updated",
  "Release notes considered for both products",
  "Backward compatibility impact documented",
  "tool names",
  "tool schemas",
  "capability metadata",
  "transport behavior",
  "server-info payloads",
  "extension adapter behavior",
  "docs/architecture/protocol-change-checklist.md",
];

for (const phrase of requiredTemplatePhrases) {
  requireIncludes(
    template,
    phrase,
    ".github/PULL_REQUEST_TEMPLATE.md",
  );
}

const requiredDocPhrases = [
  "# Protocol Change Checklist",
  "OASLANA-76",
  "When It Applies",
  "Required Evidence",
  "CI And Review Visibility",
  "corepack pnpm run check:protocol-pr-template",
  "corepack pnpm run check:protocol-schemas",
  "corepack pnpm run check:compatibility-contract",
  "Definition of done",
  "Product boundaries",
  "Release model",
  "Testing strategy",
];

for (const phrase of requiredDocPhrases) {
  requireIncludes(protocolDoc, phrase, "docs/architecture/protocol-change-checklist.md");
}

requireIncludes(
  definitionOfDone,
  "protocol change checklist](protocol-change-checklist.md)",
  "docs/architecture/definition-of-done.md",
);
requireIncludes(
  productBoundaries,
  "protocol change checklist](protocol-change-checklist.md)",
  "docs/architecture/product-boundaries.md",
);
requireIncludes(
  architectureIndex,
  "Protocol change checklist](protocol-change-checklist.md)",
  "docs/architecture/index.md",
);
requireIncludes(
  rootContributing,
  "docs/architecture/protocol-change-checklist.md",
  "CONTRIBUTING.md",
);
requireIncludes(
  contributing,
  "protocol change checklist](architecture/protocol-change-checklist.md)",
  "docs/contributing.md",
);
requireIncludes(
  testingStrategy,
  "OASLANA-76",
  "docs/testing-strategy.md",
);
requireIncludes(
  testingStrategy,
  "corepack pnpm run check:protocol-pr-template",
  "docs/testing-strategy.md",
);

const scripts = packageJson.scripts ?? {};
if (
  scripts["check:protocol-pr-template"] !==
  "node scripts/check-protocol-pr-template.mjs"
) {
  failures.push("package.json must define check:protocol-pr-template");
}

if (!scripts.check?.includes("pnpm run check:protocol-pr-template")) {
  failures.push("package.json check must run check:protocol-pr-template");
}

if (failures.length > 0) {
  console.error("Protocol PR template check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Protocol PR template check passed.");
