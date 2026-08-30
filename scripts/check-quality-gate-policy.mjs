#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");
const POLICY_PATH = ".github/quality-gates.json";
const RULESET_PATH = ".github/rulesets/main.json";
const WORKFLOW_DIR = ".github/workflows";
const POLICY_DOC = "docs/architecture/branch-protection.md";

function readJson(repoRoot, relativePath, errors) {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    errors.push(`Missing ${relativePath}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${relativePath} must be strict JSON: ${error.message}`);
    return null;
  }
}

function requiredContexts(ruleset) {
  const rule = ruleset?.rules?.find(
    (entry) => entry?.type === "required_status_checks",
  );
  return (rule?.parameters?.required_status_checks ?? []).map(
    (entry) => entry.context,
  );
}

function validateOwnerGuards(repoRoot, errors) {
  const workflowRoot = path.join(repoRoot, WORKFLOW_DIR);
  for (const name of readdirSync(workflowRoot)) {
    if (!/\.ya?ml$/u.test(name)) continue;
    const source = readFileSync(path.join(workflowRoot, name), "utf8");
    if (/github\.repository_owner/u.test(source)) {
      errors.push(
        `${WORKFLOW_DIR}/${name} retains a redundant repository-owner guard or alias`,
      );
    }
  }
}

function validateExternalSignals(repoRoot, policy, required, errors) {
  const signals = policy?.externalSignals ?? {};
  const sonar = signals.sonarCloud ?? {};
  if (
    sonar.required !== false ||
    sonar.repositoryConfig !== false ||
    sonar.policy !== "advisory-zero-new-issues" ||
    required.includes(sonar.checkContext)
  ) {
    errors.push(
      "SonarCloud must be advisory, externally configured, and outside branch protection",
    );
  }

  const mergify = signals.mergify ?? {};
  if (
    mergify.required !== false ||
    mergify.repositoryConfig !== false ||
    mergify.policy !== "not-a-merge-authority" ||
    required.includes(mergify.checkContext) ||
    existsSync(path.join(repoRoot, ".mergify.yml")) ||
    existsSync(path.join(repoRoot, ".mergify.yaml"))
  ) {
    errors.push(
      "Mergify must remain outside repository merge authority and branch protection",
    );
  }

  const codecov = signals.codecov ?? {};
  const codecovPath = path.join(repoRoot, "codecov.yml");
  const config = existsSync(codecovPath)
    ? parseYaml(readFileSync(codecovPath, "utf8"))
    : null;
  const project = config?.coverage?.status?.project?.default;
  const patch = config?.coverage?.status?.patch?.default;
  if (
    codecov.required !== false ||
    codecov.repositoryConfig !== true ||
    codecov.projectStatus !== "informational" ||
    codecov.patchStatus !== "informational" ||
    codecov.bundleStatus !== "informational" ||
    project?.informational !== true ||
    patch?.informational !== true ||
    config?.bundle_analysis?.status !== "informational"
  ) {
    errors.push(
      "Codecov project, patch, and bundle statuses must stay explicitly informational",
    );
  }
}

function validateDocumentation(repoRoot, errors) {
  const source = readFileSync(path.join(repoRoot, POLICY_DOC), "utf8");
  for (const phrase of [
    "SonarCloud",
    "Mergify",
    "Codecov",
    "advisory",
    "informational",
    "oaslananka",
  ]) {
    if (!source.includes(phrase)) {
      errors.push(`${POLICY_DOC} must document ${phrase}`);
    }
  }
}

export function validateQualityGatePolicy(repoRoot = DEFAULT_REPO_ROOT) {
  const errors = [];
  const policy = readJson(repoRoot, POLICY_PATH, errors);
  const ruleset = readJson(repoRoot, RULESET_PATH, errors);
  if (!policy || !ruleset) return [...new Set(errors)];

  const required = requiredContexts(ruleset);
  if (policy.schemaVersion !== 1 || policy.repositoryOwner !== "oaslananka") {
    errors.push(
      "quality-gate policy must target schemaVersion 1 and repository owner oaslananka",
    );
  }
  if (JSON.stringify(policy.requiredChecks) !== JSON.stringify(required)) {
    errors.push(
      "quality-gate requiredChecks must exactly match .github/rulesets/main.json",
    );
  }

  const packageJson = readJson(repoRoot, "package.json", errors);
  if (
    packageJson?.scripts?.["check:quality-gates"] !==
      "node scripts/check-quality-gate-policy.mjs && node --test scripts/check-quality-gate-policy.test.mjs" ||
    !packageJson?.scripts?.check?.includes("pnpm run check:quality-gates")
  ) {
    errors.push(
      "package.json must expose check:quality-gates and compose it into the root check",
    );
  }

  validateOwnerGuards(repoRoot, errors);
  validateExternalSignals(repoRoot, policy, required, errors);
  validateDocumentation(repoRoot, errors);
  return [...new Set(errors)];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateQualityGatePolicy();
  if (errors.length > 0) {
    console.error("Quality-gate policy check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Repository quality-gate policy is explicit and aligned.");
  }
}
