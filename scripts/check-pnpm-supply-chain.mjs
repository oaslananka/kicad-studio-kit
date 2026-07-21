#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");
const MINIMUM_RELEASE_AGE_MINUTES = 1440;
const ALLOWED_MINIMUM_RELEASE_AGE_EXCLUDES = ["tmp@0.2.7"];
const REQUIRED_SECURITY_OVERRIDES = Object.freeze({
  "brace-expansion@2.1.1": "2.1.2",
  "brace-expansion@5.0.6": "5.0.7",
  "js-yaml": "4.3.0",
  tar: "7.5.19",
  "fast-uri": "3.1.4",
  "linkify-it": "5.0.2",
});
const FORBIDDEN_PNPM_SETTINGS = [
  "minimumReleaseAge",
  "minimumReleaseAgeExclude",
  "blockExoticSubdeps",
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
    "pnpm-workspace.yaml must set minimumReleaseAge: 1440",
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
  assertCondition(
    errors,
    sameStringList(
      workspace?.minimumReleaseAgeExclude,
      ALLOWED_MINIMUM_RELEASE_AGE_EXCLUDES,
    ),
    "pnpm-workspace.yaml minimumReleaseAgeExclude must be limited to version-scoped security exceptions: tmp@0.2.7",
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
  const npmrc = readText(repoRoot, ".npmrc", errors, { optional: true });
  const securityWorkflow = readText(
    repoRoot,
    ".github/workflows/security.yml",
    errors,
  );

  validateWorkspace(errors, workspace);
  validatePackageJson(errors, rootPackage);
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
