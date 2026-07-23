#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function fail(message) {
  throw new Error(message);
}

function requireIncludes(file, contents, phrase) {
  if (!contents.includes(phrase)) {
    fail(`${file}: missing required Best Practices evidence phrase: ${phrase}`);
  }
}

function validateCoveragePolicy(root) {
  const configPath = path.join(
    root,
    "apps",
    "vscode-extension",
    "jest.config.js",
  );
  const configText = fs.readFileSync(configPath, "utf8");
  const globalMatch = /global:\s*\{([\s\S]*?)\n\s*\}/u.exec(configText);
  if (!globalMatch || !globalMatch[1]) {
    fail(
      "apps/vscode-extension/jest.config.js must define coverageThreshold.global for Best Practices evidence",
    );
  }

  const globalBlock = globalMatch[1];
  const statementsMatch = /statements:\s*(\d+)/u.exec(globalBlock);
  const linesMatch = /lines:\s*(\d+)/u.exec(globalBlock);
  const functionsMatch = /functions:\s*(\d+)/u.exec(globalBlock);

  if (!statementsMatch || !statementsMatch[1]) {
    fail("coverageThreshold.global.statements must be defined");
  }
  if (!linesMatch || !linesMatch[1]) {
    fail("coverageThreshold.global.lines must be defined");
  }
  if (!functionsMatch || !functionsMatch[1]) {
    fail("coverageThreshold.global.functions must be defined");
  }

  const globalThreshold = {
    statements: Number.parseInt(statementsMatch[1], 10),
    lines: Number.parseInt(linesMatch[1], 10),
    functions: Number.parseInt(functionsMatch[1], 10),
  };

  assert.ok(
    globalThreshold.statements >= 80,
    "apps/vscode-extension/jest.config.js must enforce at least 80% global statement coverage for Best Practices evidence",
  );
  assert.ok(
    globalThreshold.lines >= 80,
    "apps/vscode-extension/jest.config.js must enforce at least 80% global line coverage for Best Practices evidence",
  );
  assert.ok(
    globalThreshold.functions >= 80,
    "apps/vscode-extension/jest.config.js must enforce at least 80% global function coverage for Best Practices evidence",
  );
  return globalThreshold;
}

export function validateBestPracticesEvidence(root = repoRoot) {
  const readFromRoot = (relativePath) =>
    fs.readFileSync(path.join(root, relativePath), "utf8");
  const readme = readFromRoot("README.md");
  const evidence = readFromRoot("docs/best-practices-evidence.md");
  const docsConfig = readFromRoot("docs/.vitepress/config.mts");
  const questionnaire = readFromRoot("docs/best-practices-questionnaire.md");
  const contributing = readFromRoot("CONTRIBUTING.md");
  const prTemplate = readFromRoot(".github/PULL_REQUEST_TEMPLATE.md");
  const extensionPackage = JSON.parse(
    readFromRoot("apps/vscode-extension/package.json"),
  );
  const repeatableVsix = readFromRoot("scripts/check-repeatable-vsix.mjs");
  const governance = readFromRoot("GOVERNANCE.md");
  const roadmap = readFromRoot("ROADMAP.md");
  const support = readFromRoot("SUPPORT.md");
  const security = readFromRoot("SECURITY.md");
  const statusReporter = readFromRoot(
    "scripts/report-best-practices-status.mjs",
  );
  const dockerfile = readFromRoot(".devcontainer/Dockerfile");
  const devDoctor = readFromRoot("scripts/dev-doctor.mjs");
  const ruleset = JSON.parse(readFromRoot(".github/rulesets/main.json"));
  const scorecardPolicy = JSON.parse(
    readFromRoot(".github/scorecard-residual-risk.json"),
  );
  const scorecardEvidenceCli = readFromRoot(
    "scripts/check-scorecard-evidence.mjs",
  );
  const governanceWorkflow = readFromRoot(
    ".github/workflows/governance-evidence.yml",
  );
  const rootPackage = JSON.parse(readFromRoot("package.json"));
  const coverageThreshold = validateCoveragePolicy(root);

  requireIncludes(
    "README.md",
    readme,
    "https://www.bestpractices.dev/projects/13405/badge",
  );
  requireIncludes("README.md", readme, "docs/best-practices-evidence.md");
  requireIncludes("README.md", readme, "GOVERNANCE.md");
  requireIncludes(
    "docs/.vitepress/config.mts",
    docsConfig,
    "Best Practices Evidence",
  );
  requireIncludes(
    "docs/.vitepress/config.mts",
    docsConfig,
    "Best Practices Questionnaire",
  );

  for (const phrase of [
    "Best Practices project",
    "`13405`",
    "Scorecard remediation mapping",
    "CII-Best-Practices",
    "Branch-Protection",
    "Pinned-Dependencies",
    "Signed-Releases",
    "A strict main-branch ruleset with stable required checks is versioned in the repo.",
    ".github/scorecard-residual-risk.json",
    "30/30",
    "quarterly",
    "No finding is dismissed solely to improve a score",
  ]) {
    requireIncludes("docs/best-practices-evidence.md", evidence, phrase);
  }

  for (const phrase of [
    "Developer Certificate of Origin",
    "developercertificate.org",
    "git commit -s",
    "test:dynamic-analysis",
  ]) {
    requireIncludes("CONTRIBUTING.md", contributing, phrase);
  }
  requireIncludes(
    ".github/PULL_REQUEST_TEMPLATE.md",
    prTemplate,
    "Developer Certificate of Origin sign-off",
  );
  assert.equal(
    extensionPackage.scripts?.["test:dynamic-analysis"],
    "pnpm run test:security && pnpm run test:webview && pnpm run test:a11y",
  );
  for (const phrase of [
    "compareVsixContent",
    "SOURCE_DATE_EPOCH",
    "VSIX repeatable content check passed",
  ]) {
    requireIncludes(
      "scripts/check-repeatable-vsix.mjs",
      repeatableVsix,
      phrase,
    );
  }

  for (const phrase of [
    "Roles and responsibilities",
    "Access continuity",
    "Bus-factor policy",
  ]) {
    requireIncludes("GOVERNANCE.md", governance, phrase);
  }
  for (const phrase of ["Current priorities", "Milestones", "Update policy"]) {
    requireIncludes("ROADMAP.md", roadmap, phrase);
  }
  for (const phrase of ["Expected handling", "Active vulnerability"]) {
    requireIncludes("SUPPORT.md", support, phrase);
  }
  for (const phrase of [
    "Private vulnerability handling",
    "7 calendar days",
    "Reporter credit is supported",
  ]) {
    requireIncludes("SECURITY.md", security, phrase);
  }
  for (const phrase of [
    "Best Practices Questionnaire Fill Guide",
    "best-practices:status",
    "High-impact Passing fields",
    "Security and Silver-level fields",
    "Fields that should remain cautious",
  ]) {
    requireIncludes(
      "docs/best-practices-questionnaire.md",
      questionnaire,
      phrase,
    );
  }

  for (const phrase of [
    "BEST_PRACTICES_PROJECT_ID = 13405",
    "Highest-impact unanswered fields",
    "Caution fields",
  ]) {
    requireIncludes(
      "scripts/report-best-practices-status.mjs",
      statusReporter,
      phrase,
    );
  }

  requireIncludes(
    ".devcontainer/Dockerfile",
    dockerfile,
    "FROM ghcr.io/astral-sh/uv@sha256:",
  );
  for (const phrase of [
    "BEST_PRACTICES_PROJECT_ID = 13405",
    "Highest-impact unanswered fields",
    "Caution fields",
  ]) {
    requireIncludes(
      "scripts/report-best-practices-status.mjs",
      statusReporter,
      phrase,
    );
  }

  requireIncludes(
    ".devcontainer/Dockerfile",
    dockerfile,
    "COPY --from=uv-bin /uv /uvx /usr/local/bin/",
  );
  if (/pip\s+install[^\n]+uv==/u.test(dockerfile)) {
    fail(
      ".devcontainer/Dockerfile: uv must be installed from a digest-pinned official image, not hashless pip install",
    );
  }

  requireIncludes("scripts/dev-doctor.mjs", devDoctor, "playwright-chromium");

  assert.equal(scorecardPolicy.schemaVersion, 1);
  assert.equal(scorecardPolicy.repository, "oaslananka/kicad-studio-kit");
  assert.equal(scorecardPolicy.sampleSize, 30);
  assert.equal(scorecardPolicy.sast.alertNumber, 19);
  assert.equal(scorecardPolicy.sast.disposition, "false-positive");
  assert.equal(scorecardPolicy.branchProtection.alertNumber, 9);
  assert.equal(scorecardPolicy.branchProtection.disposition, "accepted-risk");
  assert.equal(scorecardPolicy.branchProtection.owner, "oaslananka");
  assert.equal(scorecardPolicy.branchProtection.reviewCadence, "quarterly");
  assert.equal(scorecardPolicy.branchProtection.expectedWarnings.length, 5);
  requireIncludes(
    "scripts/check-scorecard-evidence.mjs",
    scorecardEvidenceCli,
    "buildUnavailableScorecardEvidenceReport",
  );
  requireIncludes(
    ".github/workflows/governance-evidence.yml",
    governanceWorkflow,
    "scorecard-evidence.json",
  );
  requireIncludes(
    ".github/workflows/governance-evidence.yml",
    governanceWorkflow,
    "--governance-json governance-evidence.json",
  );
  assert.match(
    rootPackage.scripts?.["check:best-practices"] ?? "",
    /check:scorecard-evidence/u,
  );

  const requiredStatusRule = (ruleset.rules ?? []).find(
    (entry) => entry.type === "required_status_checks",
  );
  const contexts =
    requiredStatusRule?.parameters?.required_status_checks?.map(
      (entry) => entry.context,
    ) ?? [];
  assert.deepEqual(contexts, [
    "required",
    "analyze (javascript-typescript)",
    "analyze (python)",
    "security",
    "scan",
    "dependency-review",
  ]);

  return {
    projectId: 13405,
    requiredStatusChecks: contexts,
    coverageThreshold,
    scorecard: {
      sampleSize: scorecardPolicy.sampleSize,
      branchWarningCount:
        scorecardPolicy.branchProtection.expectedWarnings.length,
      reviewCadence: scorecardPolicy.branchProtection.reviewCadence,
    },
  };
}

function main() {
  const result = validateBestPracticesEvidence();
  console.log(
    `Best Practices evidence is complete for project ${result.projectId} (${result.requiredStatusChecks.length} required branch checks).`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
