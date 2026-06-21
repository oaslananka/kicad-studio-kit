#!/usr/bin/env node

// Keeps the documented branch-protection policy and the enforced ruleset in
// sync (#414). The required status checks listed in
// docs/architecture/branch-protection.md must exactly match the contexts in
// .github/rulesets/main.json, so the policy doc can never silently drift from
// what is actually enforced on `main`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const RULESET_PATH = ".github/rulesets/main.json";
const DOC_PATH = "docs/architecture/branch-protection.md";

export function rulesetRequiredChecks(root = repoRoot) {
  const ruleset = JSON.parse(
    fs.readFileSync(path.join(root, RULESET_PATH), "utf8"),
  );
  const rule = (ruleset.rules ?? []).find(
    (entry) => entry.type === "required_status_checks",
  );
  const checks = rule?.parameters?.required_status_checks ?? [];
  return checks
    .map((check) => check.context)
    .filter((context) => typeof context === "string");
}

export function documentedRequiredChecks(root = repoRoot) {
  const doc = fs.readFileSync(path.join(root, DOC_PATH), "utf8");
  const lines = doc.split(/\r?\n/u);
  const start = lines.findIndex((line) =>
    /^##\s+Required status checks/u.test(line),
  );
  if (start === -1) {
    throw new Error(
      `${DOC_PATH}: missing a "## Required status checks" section`,
    );
  }
  const checks = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s/u.test(line)) {
      break;
    }
    const match = line.match(/^-\s+`([^`]+)`\s*$/u);
    if (match) {
      checks.push(match[1]);
    }
  }
  return checks;
}

export function diffChecks(root = repoRoot) {
  const ruleset = new Set(rulesetRequiredChecks(root));
  const documented = new Set(documentedRequiredChecks(root));
  const missingFromDoc = [...ruleset].filter((c) => !documented.has(c));
  const missingFromRuleset = [...documented].filter((c) => !ruleset.has(c));
  return { missingFromDoc, missingFromRuleset };
}

function main() {
  const documented = documentedRequiredChecks();
  if (documented.length === 0) {
    console.error(
      `${DOC_PATH}: no required status checks are documented under "## Required status checks".`,
    );
    process.exit(1);
  }
  const { missingFromDoc, missingFromRuleset } = diffChecks();
  if (missingFromDoc.length > 0 || missingFromRuleset.length > 0) {
    console.error(
      "Branch-protection policy is out of sync with the enforced ruleset:",
    );
    for (const context of missingFromDoc) {
      console.error(
        `- ${context}: required by ${RULESET_PATH} but not documented in ${DOC_PATH}`,
      );
    }
    for (const context of missingFromRuleset) {
      console.error(
        `- ${context}: documented in ${DOC_PATH} but not required by ${RULESET_PATH}`,
      );
    }
    process.exit(1);
  }
  console.log(
    `Branch-protection policy matches the ruleset (${documented.length} required checks).`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
