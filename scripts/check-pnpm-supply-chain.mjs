#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");
const MINIMUM_RELEASE_AGE_MINUTES = 10080;
const ALLOWED_MINIMUM_RELEASE_AGE_EXCLUDES = [
  "tmp@0.2.7",
  "qs@6.16.0",
  "js-yaml@4.3.1",
  "brace-expansion@2.1.4",
  "brace-expansion@5.0.9",
  "nanoid@3.3.18",
];
const ALLOWED_TRUST_POLICY_EXCLUDES = [
  "@octokit/endpoint@9.0.6",
  "chokidar@4.0.3",
  "semver@5.7.2 || 6.3.1",
];
const REQUIRED_SECURITY_OVERRIDES = Object.freeze({
  "brace-expansion@2.1.1": "2.1.4",
  "brace-expansion@5.0.6": "5.0.9",
  "brace-expansion@5.0.7": "5.0.9",
  "postcss@8.5.15": "8.5.24",
  "nanoid@3.3.16": "3.3.18",
  "nanoid@3.3.17": "3.3.18",
  "js-yaml": "4.3.1",
  tar: "7.5.22",
  "@xmldom/xmldom": "0.8.15",
  qs: "6.16.0",
  "fast-uri": "3.1.6",
  "linkify-it": "5.0.2",
});
const FORBIDDEN_PNPM_SETTINGS = [
  "minimumReleaseAge",
  "minimumReleaseAgeExclude",
  "blockExoticSubdeps",
  "trustPolicy",
  "trustPolicyExclude",
  "trustLockfile",
];

function readText(repoRoot, relativePath, errors, { optional = false } = {}) {
  const filePath = path.join(repoRoot, relativePath);
  if (optional && !existsSync(filePath)) {
    return "";
  }
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    errors.push(`Missing ${relativePath}: ${error.message}`);
    return "";
  }
}

function readJson(repoRoot, relativePath, errors) {
  const text = readText(repoRoot, relativePath, errors);
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${relativePath} must be strict JSON: ${error.message}`);
    return null;
  }
}

function readYaml(repoRoot, relativePath, errors) {
  const text = readText(repoRoot, relativePath, errors);
  try {
    return parse(text);
  } catch (error) {
    errors.push(`${relativePath} must be valid YAML: ${error.message}`);
    return null;
  }
}

function assertCondition(errors, condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function validateWorkspace(errors, workspace) {
  assertCondition(
    errors,
    workspace?.minimumReleaseAge === MINIMUM_RELEASE_AGE_MINUTES,
    "pnpm-workspace.yaml must set minimumReleaseAge: 10080",
  );
  assertCondition(
    errors,
    workspace?.trustPolicy === "no-downgrade",
    "pnpm-workspace.yaml must set trustPolicy: no-downgrade",
  );
  assertCondition(
    errors,
    workspace?.blockExoticSubdeps === true,
    "pnpm-workspace.yaml must set blockExoticSubdeps: true",
  );
  assertCondition(
    errors,
    workspace?.trustLockfile !== true,
    "pnpm-workspace.yaml must not enable trustLockfile for public PR CI",
  );
  const auditIgnores = workspace?.auditConfig?.ignoreGhsas;
  assertCondition(
    errors,
    auditIgnores === undefined || sameStringList(auditIgnores, []),
    "pnpm-workspace.yaml auditConfig.ignoreGhsas must be empty; use patched upstream releases instead of suppressing active advisories",
  );
  assertCondition(
    errors,
    sameStringList(
      workspace?.minimumReleaseAgeExclude,
      ALLOWED_MINIMUM_RELEASE_AGE_EXCLUDES,
    ),
    "pnpm-workspace.yaml minimumReleaseAgeExclude must be limited to version-scoped security exceptions: tmp@0.2.7, qs@6.16.0, js-yaml@4.3.1, brace-expansion@2.1.4, brace-expansion@5.0.9, nanoid@3.3.18",
  );
  assertCondition(
    errors,
    sameStringList(
      workspace?.trustPolicyExclude,
      ALLOWED_TRUST_POLICY_EXCLUDES,
    ),
    "pnpm-workspace.yaml trustPolicyExclude must be limited to reviewed version-scoped exceptions: @octokit/endpoint@9.0.6, chokidar@4.0.3, semver@5.7.2 || 6.3.1",
  );
  for (const [selector, version] of Object.entries(
    REQUIRED_SECURITY_OVERRIDES,
  )) {
    assertCondition(
      errors,
      workspace?.overrides?.[selector] === version,
      `pnpm-workspace.yaml overrides must pin ${selector} to ${version}`,
    );
  }
}

function validatePackageJson(errors, packageJson) {
  assertCondition(
    errors,
    /^pnpm@11\./u.test(packageJson?.packageManager ?? ""),
    "package.json packageManager must pin pnpm 11.x",
  );
  assertCondition(
    errors,
    packageJson?.engines?.pnpm === ">=11.0.0 <12",
    "package.json engines.pnpm must stay on the supported pnpm 11 range",
  );
  for (const setting of FORBIDDEN_PNPM_SETTINGS) {
    assertCondition(
      errors,
      packageJson?.pnpm?.[setting] === undefined,
      `package.json must not define pnpm.${setting}; use pnpm-workspace.yaml`,
    );
  }
}

function validateRenovate(errors, renovate) {
  assertCondition(
    errors,
    renovate?.minimumReleaseAge === "7 days",
    'renovate.json must set top-level minimumReleaseAge to "7 days"',
  );
  assertCondition(
    errors,
    renovate?.internalChecksFilter === "strict",
    'renovate.json must set internalChecksFilter to "strict"',
  );
  assertCondition(
    errors,
    renovate?.minimumReleaseAgeBehaviour === "timestamp-required",
    'renovate.json must set minimumReleaseAgeBehaviour to "timestamp-required"',
  );
  const packageRules = Array.isArray(renovate?.packageRules)
    ? renovate.packageRules
    : [];
  const maturityRules = packageRules.filter(
    (rule) =>
      typeof rule === "object" &&
      rule !== null &&
      Object.hasOwn(rule, "minimumReleaseAge"),
  );
  const hasCanonicalNpmRule =
    maturityRules.length === 1 &&
    sameStringList(maturityRules[0]?.matchDatasources, ["npm"]) &&
    maturityRules[0]?.minimumReleaseAge === "7 days" &&
    maturityRules[0]?.internalChecksFilter === "strict" &&
    maturityRules[0]?.minimumReleaseAgeBehaviour === "timestamp-required";
  assertCondition(
    errors,
    hasCanonicalNpmRule,
    'renovate.json must define one npm package rule with minimumReleaseAge "7 days", internalChecksFilter "strict", and minimumReleaseAgeBehaviour "timestamp-required"',
  );
}

function validateNpmrc(errors, npmrc) {
  for (const setting of FORBIDDEN_PNPM_SETTINGS) {
    assertCondition(
      errors,
      !new RegExp(`^\\s*${setting}\\s*=`, "imu").test(npmrc),
      `.npmrc must not define ${setting}; pnpm 11 reads it from pnpm-workspace.yaml`,
    );
  }
}

function validateSecurityWorkflow(errors, workflow) {
  for (const phrase of [
    "pull_request:",
    "schedule:",
    "corepack pnpm audit --audit-level high",
  ]) {
    assertCondition(
      errors,
      workflow.includes(phrase),
      `security.yml must include ${phrase}`,
    );
  }
}

function sameStringList(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }
  return expected.every((value, index) => actual[index] === value);
}

export function validatePnpmSupplyChain(repoRoot = DEFAULT_REPO_ROOT) {
  const errors = [];
  const workspace = readYaml(repoRoot, "pnpm-workspace.yaml", errors);
  const rootPackage = readJson(repoRoot, "package.json", errors);
  const renovate = readJson(repoRoot, "renovate.json", errors);
  const npmrc = readText(repoRoot, ".npmrc", errors, { optional: true });
  const securityWorkflow = readText(
    repoRoot,
    ".github/workflows/security.yml",
    errors,
  );
  validateWorkspace(errors, workspace);
  validatePackageJson(errors, rootPackage);
  validateRenovate(errors, renovate);
  validateNpmrc(errors, npmrc);
  validateSecurityWorkflow(errors, securityWorkflow);

  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validatePnpmSupplyChain();
  if (errors.length > 0) {
    console.error("pnpm supply-chain check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log("pnpm supply-chain check passed.");
  }
}
