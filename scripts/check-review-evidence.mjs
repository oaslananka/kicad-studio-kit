#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  classifyReviewArtifacts,
  validateReviewEvidence,
} from "./lib/review-evidence.mjs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE_DIRECTORY = path.join("scripts", "fixtures", "review-evidence");
const ROOT_SCRIPT =
  "node scripts/check-review-evidence.mjs --all-fixtures && node --test scripts/check-review-evidence.test.mjs scripts/check-review-evidence-policy.test.mjs";

function readText(root, relativePath) {
  const filePath = resolve(root, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function readJson(root, relativePath) {
  const text = readText(root, relativePath);
  return text ? JSON.parse(text) : {};
}

function requireIncludes(errors, text, phrase, source) {
  if (!text.includes(phrase)) {
    errors.push(`${source} must include ${JSON.stringify(phrase)}`);
  }
}

export function loadReviewEvidenceSurfaces(root = REPO_ROOT) {
  return {
    template: readText(root, ".github/PULL_REQUEST_TEMPLATE.md"),
    policy: readText(root, "docs/architecture/review-evidence-policy.md"),
    governance: readText(root, "GOVERNANCE.md"),
    contributing: readText(root, "CONTRIBUTING.md"),
    architectureIndex: readText(root, "docs/architecture/index.md"),
    definitionOfDone: readText(root, "docs/architecture/definition-of-done.md"),
    testingStrategy: readText(root, "docs/testing-strategy.md"),
    packageJson: readJson(root, "package.json"),
    ci: readText(root, ".github/workflows/ci.yml"),
  };
}

export function validateReviewEvidenceSurfaces(surfaces) {
  const errors = [];

  for (const phrase of [
    "## Review evidence",
    "Select exactly one automated-review outcome",
    "Completed with findings",
    "Completed with no findings",
    "Unavailable; compensating evidence recorded below",
    "Not applicable; reason:",
    "Select exactly one change risk",
    "Every bot and agent comment is classified",
    "actionable, resolved, informational, duplicate, or unavailable",
    "Focused second-agent review",
    "Architecture/security checklist",
    "Additional regression tests",
    "Documented manual review",
    "Evidence links/notes:",
    "An availability, quota, rate-limit, or capacity notice is not a completed review.",
  ]) {
    requireIncludes(
      errors,
      surfaces.template,
      phrase,
      ".github/PULL_REQUEST_TEMPLATE.md",
    );
  }

  for (const phrase of [
    "# Review Evidence Policy",
    "completed-findings",
    "completed-no-findings",
    "unavailable",
    "not-applicable",
    "missing",
    "Availability, quota, rate-limit, and capacity notices are not completed reviews.",
    "actionable",
    "resolved",
    "informational",
    "duplicate",
    "focused-second-agent-review",
    "architecture-security-checklist",
    "additional-regression-tests",
    "documented-manual-review",
    "Solo-maintainer exception",
    "required checks",
    "review-thread resolution",
    "corepack pnpm run check:review-evidence",
  ]) {
    requireIncludes(
      errors,
      surfaces.policy,
      phrase,
      "docs/architecture/review-evidence-policy.md",
    );
  }

  requireIncludes(
    errors,
    surfaces.governance,
    "review evidence policy](docs/architecture/review-evidence-policy.md)",
    "GOVERNANCE.md",
  );
  requireIncludes(
    errors,
    surfaces.governance,
    "solo-maintainer",
    "GOVERNANCE.md",
  );
  requireIncludes(
    errors,
    surfaces.contributing,
    "docs/architecture/review-evidence-policy.md",
    "CONTRIBUTING.md",
  );
  requireIncludes(
    errors,
    surfaces.architectureIndex,
    "Review evidence policy](review-evidence-policy.md)",
    "docs/architecture/index.md",
  );
  requireIncludes(
    errors,
    surfaces.definitionOfDone,
    "review evidence policy](review-evidence-policy.md)",
    "docs/architecture/definition-of-done.md",
  );
  requireIncludes(
    errors,
    surfaces.testingStrategy,
    "Review evidence gate",
    "docs/testing-strategy.md",
  );
  requireIncludes(
    errors,
    surfaces.testingStrategy,
    "corepack pnpm run check:review-evidence",
    "docs/testing-strategy.md",
  );

  const scripts = surfaces.packageJson?.scripts ?? {};
  if (scripts["check:review-evidence"] !== ROOT_SCRIPT) {
    errors.push(
      `package.json must define check:review-evidence as ${JSON.stringify(ROOT_SCRIPT)}`,
    );
  }
  if (!scripts.check?.includes("pnpm run check:review-evidence")) {
    errors.push("package.json root check must run check:review-evidence");
  }
  if (!surfaces.ci.includes("corepack pnpm run check:review-evidence")) {
    errors.push("ci.yml metadata job must run check:review-evidence");
  }

  return errors;
}

function validateFixture(fixture, source) {
  const errors = [];
  const outcome = classifyReviewArtifacts(fixture);
  const evidenceErrors = validateReviewEvidence(fixture);
  const expected = fixture.expected ?? {};

  if (outcome !== expected.outcome) {
    errors.push(
      `${source} classified ${outcome}; expected ${expected.outcome}`,
    );
  }
  if ((evidenceErrors.length === 0) !== expected.valid) {
    errors.push(
      `${source} validity was ${evidenceErrors.length === 0}; expected ${expected.valid}`,
    );
  }
  if (
    expected.errorIncludes &&
    !evidenceErrors.some((error) => error.includes(expected.errorIncludes))
  ) {
    errors.push(
      `${source} errors must include ${JSON.stringify(expected.errorIncludes)}`,
    );
  }
  return { errors, outcome, evidenceErrors };
}

export function validateReviewEvidenceFixtures(root = REPO_ROOT) {
  const directory = resolve(root, FIXTURE_DIRECTORY);
  const errors = [];
  if (!existsSync(directory)) {
    return {
      errors: [
        `missing review-evidence fixture directory ${FIXTURE_DIRECTORY}`,
      ],
      total: 0,
      expectedValid: 0,
      expectedInvalid: 0,
    };
  }

  const fixtureNames = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
  let expectedValid = 0;
  let expectedInvalid = 0;

  for (const fixtureName of fixtureNames) {
    const relativePath = path.join(FIXTURE_DIRECTORY, fixtureName);
    let fixture;
    try {
      fixture = readJson(root, relativePath);
    } catch (error) {
      errors.push(`${relativePath} is invalid JSON: ${error.message}`);
      continue;
    }
    if (fixture.expected?.valid) {
      expectedValid += 1;
    } else {
      expectedInvalid += 1;
    }
    const result = validateFixture(fixture, relativePath);
    errors.push(...result.errors);
  }

  return {
    errors,
    total: fixtureNames.length,
    expectedValid,
    expectedInvalid,
  };
}

export function validateReviewEvidencePolicy(root = REPO_ROOT) {
  const surfaceErrors = validateReviewEvidenceSurfaces(
    loadReviewEvidenceSurfaces(root),
  );
  const fixtureResult = validateReviewEvidenceFixtures(root);
  return [...surfaceErrors, ...fixtureResult.errors];
}

function runFixture(root, fixturePath) {
  const fixture = readJson(root, fixturePath);
  const result = validateFixture(fixture, fixturePath);
  const evidenceErrors = validateReviewEvidence(fixture);
  const evidenceStatus =
    evidenceErrors.length === 0
      ? "valid"
      : `invalid (${evidenceErrors.join("; ")})`;
  process.stdout.write(
    `${fixturePath}: ${result.outcome}; ${evidenceStatus}\n`,
  );
  return result.errors;
}

function runCli() {
  const fixtureFlag = process.argv.indexOf("--fixture");
  if (fixtureFlag !== -1) {
    const fixturePath = process.argv[fixtureFlag + 1];
    if (!fixturePath) {
      throw new Error("--fixture requires a repository-relative path");
    }
    const errors = runFixture(REPO_ROOT, fixturePath);
    if (errors.length > 0) {
      process.stderr.write(
        `Review evidence fixture failed:\n- ${errors.join("\n- ")}\n`,
      );
      process.exitCode = 1;
    }
    return;
  }

  const errors = validateReviewEvidencePolicy(REPO_ROOT);
  const fixtureResult = validateReviewEvidenceFixtures(REPO_ROOT);
  if (errors.length > 0) {
    process.stderr.write(
      `Review evidence policy failed:\n- ${errors.join("\n- ")}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Review evidence policy is valid: ${fixtureResult.total} fixtures (${fixtureResult.expectedValid} valid, ${fixtureResult.expectedInvalid} expected-invalid).\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCli();
}
