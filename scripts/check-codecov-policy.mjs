#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");
const CODECOV_ACTION =
  "codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f";
const CODECOV_CLI_VERSION = "v11.3.1";

function readText(repoRoot, relativePath, errors) {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    errors.push(`Missing ${relativePath}`);
    return "";
  }
  return readFileSync(filePath, "utf8");
}

function readJson(repoRoot, relativePath, errors) {
  const source = readText(repoRoot, relativePath, errors);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch (error) {
    errors.push(`${relativePath} must be strict JSON: ${error.message}`);
    return null;
  }
}

function readYaml(repoRoot, relativePath, errors) {
  const source = readText(repoRoot, relativePath, errors);
  if (!source) return null;
  try {
    return parse(source);
  } catch (error) {
    errors.push(`${relativePath} must be valid YAML: ${error.message}`);
    return null;
  }
}

function requireCondition(errors, condition, message) {
  if (!condition) errors.push(message);
}

function validateWorkflow(errors, workflow) {
  requireCondition(
    errors,
    workflow.split(CODECOV_ACTION).length - 1 === 2,
    "ci.yml must pin both coverage and test-result uploads to codecov/codecov-action v7.0.0 commit fb8b3582c8e4def4969c97caa2f19720cb33a72f",
  );
  requireCondition(
    errors,
    !workflow.includes("codecov/test-results-action@"),
    "ci.yml must not use the deprecated codecov/test-results-action",
  );
  requireCondition(
    errors,
    workflow.match(/version:\s*v11\.3\.1/gu)?.length === 2,
    `ci.yml must pin both Codecov uploads to CLI ${CODECOV_CLI_VERSION}`,
  );
  requireCondition(
    errors,
    workflow.includes("apps/vscode-extension/coverage/lcov.info") &&
      workflow.includes("apps/vscode-extension/test-results/junit.xml") &&
      workflow.includes("disable_search: true"),
    "ci.yml must upload explicit LCOV and JUnit report paths with discovery disabled",
  );
  requireCondition(
    errors,
    workflow.includes(
      "github.event.pull_request.head.repo.full_name == github.repository",
    ),
    "ci.yml must skip token-backed Codecov work for fork pull requests",
  );
  requireCondition(
    errors,
    workflow.includes("!cancelled() && matrix.os == 'ubuntu-24.04'"),
    "ci.yml must retain Ubuntu reports with !cancelled() failed-test semantics",
  );
  requireCondition(
    errors,
    workflow.includes("hashFiles('codecov-reports/test-results/junit.xml')") &&
      workflow.includes("report_type: test_results") &&
      workflow.includes("files: codecov-reports/test-results/junit.xml"),
    "ci.yml must upload JUnit results through codecov-action when a failed test report is available",
  );
  requireCondition(
    errors,
    !workflow.includes("CODECOV_BUNDLE_ANALYSIS") &&
      !workflow.includes("Build production bundle with Codecov analysis"),
    "Bundle Analysis must remain deferred to #514 until the default-branch baseline is processed",
  );

  const requiredJobStart = workflow.indexOf("\n  required:\n");
  const requiredJob =
    requiredJobStart >= 0 ? workflow.slice(requiredJobStart) : "";
  const requiredNeedsStart = requiredJob.indexOf("\n    needs:\n");
  const requiredNeedsEnd =
    requiredNeedsStart >= 0
      ? requiredJob.indexOf("\n    runs-on:", requiredNeedsStart)
      : -1;
  const requiredNeeds =
    requiredNeedsStart >= 0 && requiredNeedsEnd > requiredNeedsStart
      ? requiredJob.slice(requiredNeedsStart, requiredNeedsEnd)
      : "";
  requireCondition(
    errors,
    !requiredNeeds.includes("\n      - codecov\n"),
    "Codecov must not be part of the aggregate required job during baseline establishment",
  );
}

function validateCodecovYaml(errors, config) {
  const project = config?.coverage?.status?.project?.default;
  const patch = config?.coverage?.status?.patch?.default;
  requireCondition(
    errors,
    project?.informational === true,
    "Codecov project coverage status must be informational during baseline establishment",
  );
  requireCondition(
    errors,
    patch?.informational === true,
    "Codecov patch coverage status must be informational during baseline establishment",
  );
  requireCondition(
    errors,
    project?.target === "auto" && patch?.target === "auto",
    "Codecov project and patch targets must use the existing coverage baseline (auto)",
  );
  requireCondition(
    errors,
    project?.threshold === "1%" && patch?.threshold === "1%",
    "Codecov project and patch thresholds must allow at most 1% baseline drift",
  );
  requireCondition(
    errors,
    config?.flags?.["vscode-extension-unit"]?.paths?.includes(
      "apps/vscode-extension/src/",
    ) && config?.flags?.["vscode-extension-unit"]?.carryforward === false,
    "codecov.yml must scope the vscode-extension-unit flag to extension source without carry-forward",
  );
  requireCondition(
    errors,
    config?.bundle_analysis === undefined,
    "codecov.yml must defer Bundle Analysis configuration to #514",
  );
}

function validateJest(errors, jestConfig) {
  requireCondition(
    errors,
    jestConfig.includes("if (process.env.CI)") &&
      jestConfig.includes("'jest-junit'") &&
      jestConfig.includes("outputDirectory: 'test-results'") &&
      jestConfig.includes("outputName: 'junit.xml'") &&
      jestConfig.includes("reportTestSuiteErrors: 'true'"),
    "Jest must emit deterministic JUnit XML in CI and report suite-load errors",
  );
  requireCondition(
    errors,
    jestConfig.includes("coverageReporters: ['json-summary', 'text', 'lcov']"),
    "Jest must keep LCOV and JSON coverage reports",
  );
}

export function validateCodecovPolicy(repoRoot = DEFAULT_REPO_ROOT) {
  const errors = [];
  const workflow = readText(repoRoot, ".github/workflows/ci.yml", errors);
  const rootPackage = readJson(repoRoot, "package.json", errors);
  const extensionPackage = readJson(
    repoRoot,
    "apps/vscode-extension/package.json",
    errors,
  );
  const codecovConfig = readYaml(repoRoot, "codecov.yml", errors);
  const jestConfig = readText(
    repoRoot,
    "apps/vscode-extension/jest.config.js",
    errors,
  );
  const extensionIgnore = readText(
    repoRoot,
    "apps/vscode-extension/.gitignore",
    errors,
  );
  const testingDocs = readText(repoRoot, "docs/testing-strategy.md", errors);

  requireCondition(
    errors,
    rootPackage?.scripts?.["check:codecov"] ===
      "node scripts/check-codecov-policy.mjs && node --test scripts/check-codecov-policy.test.mjs" &&
      rootPackage?.scripts?.check?.includes("pnpm run check:codecov"),
    "package.json must expose check:codecov and compose it into the root check",
  );
  requireCondition(
    errors,
    extensionPackage?.devDependencies?.["jest-junit"] === "17.0.0" &&
      extensionPackage?.devDependencies?.["@codecov/webpack-plugin"] ===
        undefined,
    "extension devDependencies must pin jest-junit 17.0.0 and defer @codecov/webpack-plugin to #514",
  );
  requireCondition(
    errors,
    extensionIgnore.split(/\r?\n/u).includes("test-results/"),
    "extension .gitignore must exclude generated test-results/",
  );
  requireCondition(
    errors,
    testingDocs.includes("### Codecov observability") &&
      testingDocs.includes("Jest remains the blocking coverage authority") &&
      testingDocs.includes("GitHub issue #514"),
    "testing strategy must document Codecov ownership, non-blocking semantics, and Bundle Analysis deferral",
  );

  validateWorkflow(errors, workflow);
  validateCodecovYaml(errors, codecovConfig);
  validateJest(errors, jestConfig);
  return [...new Set(errors)];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateCodecovPolicy();
  if (errors.length > 0) {
    console.error("Codecov policy check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Codecov coverage and test analytics policy is valid.");
  }
}
