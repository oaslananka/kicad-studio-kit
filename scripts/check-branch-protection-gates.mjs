#!/usr/bin/env node

// Keeps the documented branch-protection policy and checked-in ruleset in
// sync with the repository-owned default-branch governance contract. In
// addition to exact required-check contexts, the static policy stays fail-closed
// on squash-only merges, strict checks, conversation resolution, linear history,
// and deletion/non-fast-forward protection.

import fs from "node:fs";
import { pathToFileURL } from "node:url";

import { normalizeRuleset } from "./lib/github-governance-evidence.mjs";

const RULESET_PATH = ".github/rulesets/main.json";
const DOC_PATH = "docs/architecture/branch-protection.md";

function readRuleset() {
  return JSON.parse(
    fs.readFileSync(
      new URL("../.github/rulesets/main.json", import.meta.url),
      "utf8",
    ),
  );
}

export function rulesetRequiredChecks(ruleset = readRuleset()) {
  const rule = (ruleset.rules ?? []).find(
    (entry) => entry.type === "required_status_checks",
  );
  const checks = rule?.parameters?.required_status_checks ?? [];
  return checks
    .map((check) => check.context)
    .filter((context) => typeof context === "string");
}

export function documentedRequiredChecks() {
  const doc = fs.readFileSync(
    new URL("../docs/architecture/branch-protection.md", import.meta.url),
    "utf8",
  );
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

function governanceContractDifferences(ruleset = readRuleset()) {
  const normalized = normalizeRuleset(ruleset);
  const differences = [];
  const exact = (condition, message) => {
    if (!condition) differences.push(message);
  };

  exact(
    normalized.pullRequest.allowedMergeMethods.length === 1 &&
      normalized.pullRequest.allowedMergeMethods[0] === "squash",
    "default-branch allowed merge methods must remain squash-only",
  );
  exact(
    normalized.requiredStatusChecks.strict === true,
    "required status checks must remain strict",
  );
  exact(
    normalized.pullRequest.requiredReviewThreadResolution === true,
    "pull requests must require conversation resolution",
  );
  exact(
    normalized.protections.requiredLinearHistory === true,
    "default branch must require linear history",
  );
  exact(
    normalized.protections.deletion === true,
    "default branch deletion protection must remain enabled",
  );
  exact(
    normalized.protections.nonFastForward === true,
    "default branch non-fast-forward protection must remain enabled",
  );
  exact(
    normalized.pullRequest.requireExtraApprovalForUnattributedChanges === true,
    "pull requests must require extra approval for unattributed changes",
  );
  return differences;
}

export function diffChecks({
  ruleset = readRuleset(),
  documentedChecks = documentedRequiredChecks(),
} = {}) {
  const required = new Set(rulesetRequiredChecks(ruleset));
  const documented = new Set(documentedChecks);
  const missingFromDoc = [...required].filter((c) => !documented.has(c));
  const missingFromRuleset = [...documented].filter((c) => !required.has(c));
  const governanceDifferences = governanceContractDifferences(ruleset);
  return { missingFromDoc, missingFromRuleset, governanceDifferences };
}

function main() {
  const documented = documentedRequiredChecks();
  if (documented.length === 0) {
    console.error(
      `${DOC_PATH}: no required status checks are documented under "## Required status checks".`,
    );
    process.exit(1);
  }
  const { missingFromDoc, missingFromRuleset, governanceDifferences } =
    diffChecks();
  if (
    missingFromDoc.length > 0 ||
    missingFromRuleset.length > 0 ||
    governanceDifferences.length > 0
  ) {
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
    for (const difference of governanceDifferences) {
      console.error(`- ${difference}`);
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
