#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function requireIncludes(text, needle, source) {
  if (!text.includes(needle)) {
    failures.push(`${source} must include ${JSON.stringify(needle)}`);
  }
}

const rootContributing = read("CONTRIBUTING.md");
const docsContributing = read("docs/contributing.md");
const testingStrategy = read("docs/testing-strategy.md");
const definitionOfDone = read("docs/architecture/definition-of-done.md");
const pullRequestTemplate = read(".github/PULL_REQUEST_TEMPLATE.md");
const docsGenerator = read("scripts/generate-docs-site.mjs");
const packageJson = JSON.parse(read("package.json"));

const contributingPolicyPhrases = [
  "Bug-fix pull requests must include automated regression coverage before the\nrelated issue is closed, when practical.",
  "A test that fails against the pre-fix behavior and passes after the fix.",
  "A reference to the related issue ID in the test name or test metadata.",
  "Manual screenshots alone are not sufficient to close\nrepeatable bugs.",
];

for (const phrase of contributingPolicyPhrases) {
  requireIncludes(rootContributing, phrase, "CONTRIBUTING.md");
  requireIncludes(docsContributing, phrase, "docs/contributing.md");
  requireIncludes(docsGenerator, phrase, "scripts/generate-docs-site.mjs");
}

for (const phrase of [
  "## Bug-Fix Regression Requirement",
  "OASLANA-61 / GitHub issue #62",
  "Known Repeatable Bug Areas",
  "Manual screenshots alone are not\nsufficient for repeatable bugs",
  "OASLANA-68, OASLANA-69",
  "OASLANA-16, OASLANA-70",
  "OASLANA-34, OASLANA-43, OASLANA-71",
]) {
  requireIncludes(testingStrategy, phrase, "docs/testing-strategy.md");
}

for (const phrase of [
  "## Issue-closing checklist",
  "The linked PR includes a regression test or a documented maintainer-approved\n  exception.",
  "Manual screenshots alone are not sufficient to close repeatable bugs.",
]) {
  requireIncludes(
    definitionOfDone,
    phrase,
    "docs/architecture/definition-of-done.md",
  );
}

for (const phrase of [
  "For bug fixes, name the regression test that fails before the fix and passes after it.",
  "Bug fixes include automated regression coverage that references the related issue in the test name or metadata",
  "Bug-fix exceptions explain why automation is not practical and have maintainer approval",
]) {
  requireIncludes(
    pullRequestTemplate,
    phrase,
    ".github/PULL_REQUEST_TEMPLATE.md",
  );
}

const scripts = packageJson.scripts ?? {};
if (
  scripts["check:regression-policy"] !==
  "node scripts/check-regression-policy.mjs"
) {
  failures.push("package.json must define check:regression-policy");
}

if (!scripts.check?.includes("pnpm run check:regression-policy")) {
  failures.push("package.json check must run check:regression-policy");
}

if (failures.length > 0) {
  console.error("Regression policy check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Regression policy check passed.");
