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
    sonar.repositoryConfig !== true ||
    sonar.analysisMethod !== "github-actions-lcov" ||
    sonar.workflow !== ".github/workflows/sonarcloud.yml" ||
    sonar.coverageReport !==
      "apps/vscode-extension/coverage/lcov.info,apps/vscode-extension/coverage/sonar-scripts/lcov.info" ||
    sonar.policy !== "advisory-zero-new-issues" ||
    required.includes(sonar.checkContext)
  ) {
    errors.push(
      "SonarCloud must remain advisory with repository-owned CI LCOV analysis and outside branch protection",
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

function readSonarProperties(repoRoot, errors) {
  const filename = "sonar-project.properties";
  const fullPath = path.join(repoRoot, filename);
  if (!existsSync(fullPath)) {
    errors.push(`SonarCloud is missing ${filename}`);
    return new Map();
  }
  const result = new Map();
  for (const line of readFileSync(fullPath, "utf8").split(/\r?\n/u)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const separator = text.indexOf("=");
    if (separator < 1) {
      errors.push(`SonarCloud has malformed ${filename} entry`);
      continue;
    }
    const key = text.slice(0, separator).trim();
    if (result.has(key)) errors.push(`SonarCloud has duplicate ${key}`);
    result.set(key, text.slice(separator + 1).trim());
  }
  return result;
}

function validateSonarCiCoverage(repoRoot, sonar, errors) {
  const properties = readSonarProperties(repoRoot, errors);
  for (const [key, expected] of [
    ["sonar.organization", "oaslananka"],
    ["sonar.projectKey", "oaslananka_kicad-studio-kit"],
    ["sonar.javascript.lcov.reportPaths", sonar.coverageReport],
  ]) {
    if (properties.get(key) !== expected) {
      errors.push(`SonarCloud ${key} must equal ${expected}`);
    }
  }
  const sources = (properties.get("sonar.sources") ?? "").split(",");
  if (!sources.includes("apps/vscode-extension/src")) {
    errors.push("SonarCloud must analyze VS Code extension production sources");
  }
  if (
    !(properties.get("sonar.tests") ?? "")
      .split(",")
      .includes("apps/vscode-extension/test") ||
    !(properties.get("sonar.tests") ?? "").split(",").includes("scripts") ||
    !(properties.get("sonar.test.inclusions") ?? "")
      .split(",")
      .includes("scripts/**/*.test.mjs")
  ) {
    errors.push("SonarCloud must classify VS Code and script tests separately");
  }

  const workflowPath = path.join(repoRoot, ".github/workflows/sonarcloud.yml");
  if (!existsSync(workflowPath)) {
    errors.push("SonarCloud CI coverage workflow is missing");
    return;
  }
  const workflow = parseYaml(readFileSync(workflowPath, "utf8"));
  const job = workflow?.jobs?.sonarcloud;
  const steps = job?.steps ?? [];
  if (
    workflow?.permissions?.contents !== "read" ||
    !Object.hasOwn(workflow?.on ?? {}, "pull_request") ||
    !Object.hasOwn(workflow?.on ?? {}, "push") ||
    !job ||
    !String(job.if ?? "").includes(
      "github.event.pull_request.head.repo.full_name == github.repository",
    )
  ) {
    errors.push("SonarCloud CI coverage must be read-only and fork guarded");
  }
  const checkout = steps.find((step) =>
    String(step.uses ?? "").startsWith("actions/checkout@"),
  );
  if (
    checkout?.with?.["fetch-depth"] !== 0 ||
    checkout?.with?.["persist-credentials"] !== false
  ) {
    errors.push("SonarCloud checkout must be full-history and uncredentialed");
  }
  if (
    !steps.some((step) => String(step.run ?? "").includes("test:unit:coverage"))
  ) {
    errors.push("SonarCloud must generate actual Jest unit LCOV");
  }
  if (
    !steps.some((step) =>
      String(step.run ?? "").includes("node scripts/prepare-sonar-lcov.mjs"),
    )
  ) {
    errors.push("SonarCloud must normalize real Jest LCOV source paths");
  }
  if (
    !steps.some((step) => String(step.run ?? "").includes('test -s "$lcov"'))
  ) {
    errors.push("SonarCloud must verify LCOV exists and is nonempty");
  }
  if (
    !steps.some((step) => {
      const command = String(step.run ?? "");
      return (
        command.includes("node --test") &&
        command.includes("corepack pnpm --filter kicadstudiokit exec node") &&
        command.includes("require.resolve('c8/bin/c8.js')") &&
        command.includes('node "$c8_cli"') &&
        command.includes("scripts/prepare-sonar-lcov.test.mjs")
      );
    })
  ) {
    errors.push(
      "SonarCloud must discover the pnpm-pinned c8 CLI and instrument repository scripts",
    );
  }
  const scanner = steps.find((step) =>
    String(step.uses ?? "").startsWith("SonarSource/sonarqube-scan-action@"),
  );
  if (
    !/^SonarSource\/sonarqube-scan-action@[a-f0-9]{40}$/u.test(
      String(scanner?.uses ?? ""),
    ) ||
    scanner?.env?.SONAR_TOKEN !== "${{ secrets.SONAR_TOKEN }}"
  ) {
    errors.push("SonarCloud scanner must pin a commit and use SONAR_TOKEN");
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
  validateSonarCiCoverage(
    repoRoot,
    policy.externalSignals?.sonarCloud ?? {},
    errors,
  );
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
