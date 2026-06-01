#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function read(path) {
  return readFileSync(resolve(REPO_ROOT, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function requireCondition(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function arrayIncludesAll(values, expected) {
  return expected.every((value) => values?.includes(value));
}

function hasPackageRule(rules, predicate) {
  return rules.some((rule) => predicate(rule));
}

function hasExactLine(text, expectedLine) {
  return text.split(/\r?\n/).includes(expectedLine);
}

function validateRenovate() {
  const renovate = readJson("renovate.json");
  const rules = renovate.packageRules ?? [];

  requireCondition(
    renovate.$schema === "https://docs.renovatebot.com/renovate-schema.json",
    "renovate.json must use the official Renovate JSON schema",
  );
  requireCondition(
    renovate.dependencyDashboard === true,
    "renovate.json must enable the Dependency Dashboard",
  );
  requireCondition(
    renovate.dependencyDashboardTitle === "Dependency Dashboard",
    "renovate.json must keep the configured Dependency Dashboard title",
  );
  requireCondition(
    renovate.separateMajorMinor === true &&
      renovate.separateMinorPatch === false,
    "Renovate must separate majors while grouping patch/minor lanes by surface",
  );

  requireCondition(
    hasPackageRule(
      rules,
      (rule) =>
        arrayIncludesAll(rule.matchUpdateTypes, ["major"]) &&
        rule.dependencyDashboardApproval === true &&
        rule.automerge === false,
    ),
    "Major dependency updates must require dashboard approval and manual review",
  );

  const patchMinorSurfaces = [
    {
      groupName: "root workspace tooling",
      files: ["package.json", "pnpm-workspace.yaml"],
      scope: "root-tooling",
    },
    {
      groupName: "vscode extension npm dependencies",
      files: ["apps/vscode-extension/package.json"],
      scope: "vscode-extension",
    },
  ];

  for (const surface of patchMinorSurfaces) {
    requireCondition(
      hasPackageRule(
        rules,
        (rule) =>
          rule.groupName === surface.groupName &&
          rule.semanticCommitScope === surface.scope &&
          arrayIncludesAll(rule.matchFileNames, surface.files) &&
          arrayIncludesAll(rule.matchUpdateTypes, ["minor", "patch"]),
      ),
      `Renovate must group patch/minor updates for ${surface.groupName}`,
    );
  }

  requireCondition(
    hasPackageRule(
      rules,
      (rule) =>
        arrayIncludesAll(rule.matchDepTypes, ["devDependencies"]) &&
        arrayIncludesAll(rule.matchUpdateTypes, ["patch"]) &&
        rule.automerge === true &&
        rule.automergeType === "pr" &&
        rule.platformAutomerge === true,
    ),
    "Low-risk dev-dependency patch updates must be eligible for PR automerge",
  );
}

function validateCanonicalPolicy() {
  const canonical = read("CANONICAL.md");
  const rootPackage = readJson("package.json");

  requireCondition(
    hasExactLine(canonical, "https://github.com/oaslananka/kicad-studio-kit"),
    "CANONICAL.md must name the canonical repository URL",
  );
  requireCondition(
    rootPackage.repository?.url ===
      "https://github.com/oaslananka/kicad-studio-kit.git",
    "package.json repository URL must match the canonical repository",
  );
}

function validateReusableWorkflowGap() {
  const docs = read("docs/reusable-workflows.md");

  requireCondition(
    docs.includes("oaslananka-lab/.github") &&
      docs.includes("404 Not Found") &&
      docs.includes("Code scanning") &&
      docs.includes("Supply-chain health") &&
      docs.includes("Secret scanning") &&
      docs.includes("Dependency review and audit"),
    "docs/reusable-workflows.md must document the current reusable-workflow gap",
  );
  requireCondition(
    docs.includes("Do not move PyPI publishing into a reusable workflow"),
    "docs/reusable-workflows.md must preserve PyPI Trusted Publishing locally",
  );
}

function validateRepoHealth() {
  const health = read(".repo-health.yaml");
  const requiredWorkflows = [
    "ci.yml",
    "security.yml",
    "codeql.yml",
    "gitleaks.yml",
    "scorecard.yml",
    "docs.yml",
    "release-please.yml",
    "publish-extension.yml",
  ];

  requireCondition(
    health.includes("classification: product-monorepo") &&
      health.includes("support_tier: tier-1") &&
      hasExactLine(
        health,
        "  canonical_url: https://github.com/oaslananka/kicad-studio-kit",
      ),
    ".repo-health.yaml must declare classification, support tier, and canonical URL",
  );

  for (const workflow of requiredWorkflows) {
    requireCondition(
      health.includes(`- ${workflow}`),
      `.repo-health.yaml must require ${workflow}`,
    );
  }
}

validateRenovate();
validateCanonicalPolicy();
validateReusableWorkflowGap();
validateRepoHealth();

if (failures.length > 0) {
  console.error("Repository governance check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Repository governance check passed.");
