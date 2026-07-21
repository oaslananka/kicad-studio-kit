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
const CODECOV_BUNDLE_NAME = "kicad-studio-vscode-extension";
const CODECOV_UPLOADED_BUNDLE_NAME = `${CODECOV_BUNDLE_NAME}-cjs`;
const CODECOV_WEBPACK_PLUGIN_VERSION = "2.0.1";

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

function extractJob(workflow, jobName, nextJobName) {
  const start = workflow.indexOf(`\n  ${jobName}:\n`);
  if (start < 0) return "";
  const end = nextJobName
    ? workflow.indexOf(`\n  ${nextJobName}:\n`, start)
    : -1;
  return end > start ? workflow.slice(start, end) : workflow.slice(start);
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
    "ci.yml must skip the Codecov report job for fork pull requests",
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

  const codecovJob = extractJob(workflow, "codecov", "forbidden-refs");
  requireCondition(
    errors,
    codecovJob.includes("fetch-depth: 0"),
    "Codecov job checkout must use fetch-depth: 0 for bundle commit detection",
  );
  requireCondition(
    errors,
    codecovJob.includes('CODECOV_BUNDLE_ANALYSIS: "true"') &&
      codecovJob.includes(
        "CODECOV_BUNDLE_BRANCH: ${{ github.head_ref || github.ref_name }}",
      ) &&
      codecovJob.includes(
        "CODECOV_BUNDLE_PR: ${{ github.event.pull_request.number }}",
      ) &&
      codecovJob.includes(
        "CODECOV_BUNDLE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
      ) &&
      codecovJob.includes("CODECOV_BUNDLE_SLUG: ${{ github.repository }}"),
    "ci.yml must pass explicit branch, PR, SHA, and slug context to Bundle Analysis",
  );
  requireCondition(
    errors,
    codecovJob.includes(
      "Failed to get pre-signed URL|Failed to upload stats",
    ) &&
      codecovJob.includes(
        `grep -Fxq '[codecov] Successfully uploaded stats for bundle: ${CODECOV_UPLOADED_BUNDLE_NAME}'`,
      ) &&
      codecovJob.includes("set -o pipefail") &&
      codecovJob.includes("tee codecov-bundle.log"),
    "ci.yml must fail unless the stable Codecov bundle upload is positively confirmed",
  );

  const requiredJob = extractJob(workflow, "required");
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
    "Codecov project coverage status must remain informational",
  );
  requireCondition(
    errors,
    patch?.informational === true,
    "Codecov patch coverage status must remain informational",
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
    config?.bundle_analysis?.status === "informational" &&
      config?.bundle_analysis?.warning_threshold === "5%",
    "Codecov bundle analysis must remain informational with a 5% warning threshold",
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

function validateWebpack(errors, webpackConfig) {
  requireCondition(
    errors,
    webpackConfig.includes("environment.CODECOV_BUNDLE_ANALYSIS === 'true'"),
    "webpack bundle analysis must require CODECOV_BUNDLE_ANALYSIS=true",
  );
  requireCondition(
    errors,
    webpackConfig.includes("enableBundleAnalysis: true") &&
      webpackConfig.includes(`bundleName: '${CODECOV_BUNDLE_NAME}'`) &&
      webpackConfig.includes("gitService: 'github'"),
    "webpack must configure the stable Codecov bundle name and GitHub service",
  );
  requireCondition(
    errors,
    !webpackConfig.includes("uploadToken:"),
    "Codecov bundle plugin must use tokenless GitHub authentication",
  );
  requireCondition(
    errors,
    webpackConfig.includes("branch: environment.CODECOV_BUNDLE_BRANCH") &&
      webpackConfig.includes(
        "pr: environment.CODECOV_BUNDLE_PR || undefined",
      ) &&
      webpackConfig.includes("sha: environment.CODECOV_BUNDLE_SHA") &&
      webpackConfig.includes("slug: environment.CODECOV_BUNDLE_SLUG"),
    "webpack bundle analysis must pass explicit branch, PR, SHA, and slug overrides",
  );
  requireCondition(
    errors,
    webpackConfig.includes("telemetry: false"),
    "Codecov bundle plugin telemetry must stay disabled",
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
  const webpackConfig = readText(
    repoRoot,
    "apps/vscode-extension/webpack.config.js",
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
      "node scripts/check-codecov-policy.mjs && node --test scripts/check-codecov-policy.test.mjs apps/vscode-extension/scripts/webpack-config-codecov.test.mjs" &&
      rootPackage?.scripts?.check?.includes("pnpm run check:codecov"),
    "package.json must expose check:codecov, include the Webpack contract test, and compose it into the root check",
  );
  requireCondition(
    errors,
    extensionPackage?.devDependencies?.["jest-junit"] === "17.0.0" &&
      extensionPackage?.devDependencies?.["@codecov/webpack-plugin"] ===
        CODECOV_WEBPACK_PLUGIN_VERSION,
    `extension devDependencies must pin @codecov/webpack-plugin ${CODECOV_WEBPACK_PLUGIN_VERSION}`,
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
      testingDocs.includes(CODECOV_BUNDLE_NAME) &&
      testingDocs.includes("fails closed"),
    "testing strategy must document the stable bundle name and fail-closed upload ownership",
  );

  validateWorkflow(errors, workflow);
  validateCodecovYaml(errors, codecovConfig);
  validateJest(errors, jestConfig);
  validateWebpack(errors, webpackConfig);
  return [...new Set(errors)];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateCodecovPolicy();
  if (errors.length > 0) {
    console.error("Codecov policy check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      "Codecov coverage, test analytics, and bundle analysis policy is valid.",
    );
  }
}
