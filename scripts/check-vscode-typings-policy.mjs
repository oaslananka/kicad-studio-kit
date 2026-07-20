#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptRoot, "..");
const exactVersionPattern = /^(\d+)\.(\d+)\.(\d+)$/u;

function parseExactVersion(value, label, errors) {
  if (typeof value !== "string" || !exactVersionPattern.test(value)) {
    errors.push(
      `${label} must be an explicit major.minor.patch version; found ${String(value)}`,
    );
    return undefined;
  }
  return value;
}

function parsePrefixedVersion(value, prefix, label, errors) {
  if (typeof value !== "string" || !value.startsWith(prefix)) {
    errors.push(
      `${label} must use ${prefix}<major.minor.patch>; found ${String(value)}`,
    );
    return undefined;
  }
  return parseExactVersion(value.slice(prefix.length), label, errors);
}

export function validateVscodeTypingsPolicy({
  compatibility,
  extensionPackage,
  renovateConfig,
} = {}) {
  const errors = [];

  if (!compatibility || !extensionPackage || !renovateConfig) {
    return [
      "VS Code typings policy validation requires compatibility, extension package, and Renovate metadata",
    ];
  }

  const engineRange = extensionPackage.engines?.vscode;
  const minimum = parsePrefixedVersion(
    engineRange,
    "^",
    "apps/vscode-extension/package.json engines.vscode",
    errors,
  );
  if (!minimum) {
    return errors;
  }

  const compatibilityMinimum = parseExactVersion(
    compatibility.vscode?.minimum,
    "compatibility.yaml vscode.minimum",
    errors,
  );
  if (compatibilityMinimum && compatibilityMinimum !== minimum) {
    errors.push(
      `compatibility.yaml vscode.minimum must match the engines.vscode lower bound ${minimum}; found ${compatibilityMinimum}`,
    );
  }

  const compatibilityRange = compatibility.vscode?.enginesRange;
  if (compatibilityRange !== engineRange) {
    errors.push(
      `compatibility.yaml vscode.enginesRange must match apps/vscode-extension/package.json engines.vscode ${engineRange}; found ${String(compatibilityRange)}`,
    );
  }

  const typingsVersion = parseExactVersion(
    extensionPackage.devDependencies?.["@types/vscode"],
    "apps/vscode-extension/package.json @types/vscode",
    errors,
  );
  if (typingsVersion && typingsVersion !== minimum) {
    errors.push(
      `apps/vscode-extension/package.json @types/vscode must equal the supported minimum ${minimum}; found ${typingsVersion}`,
    );
  }

  const packageRules = Array.isArray(renovateConfig.packageRules)
    ? renovateConfig.packageRules
    : [];
  const capRules = packageRules.filter(
    (rule) =>
      Array.isArray(rule?.matchPackageNames) &&
      rule.matchPackageNames.includes("@types/vscode") &&
      Object.hasOwn(rule, "allowedVersions"),
  );

  if (capRules.length !== 1) {
    errors.push(
      `renovate.json must define exactly one dedicated @types/vscode allowedVersions rule; found ${capRules.length}`,
    );
  } else {
    const expectedCap = `<=${minimum}`;
    const actualCap = capRules[0].allowedVersions;
    if (actualCap !== expectedCap) {
      errors.push(
        `renovate.json @types/vscode allowedVersions must be ${expectedCap}; found ${String(actualCap)}`,
      );
    }
  }

  return errors;
}

export function validateRepositoryVscodeTypingsPolicy({
  repoRoot = defaultRepoRoot,
} = {}) {
  const readText = (relativePath) =>
    fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

  return validateVscodeTypingsPolicy({
    compatibility: parseYaml(readText("compatibility.yaml")),
    extensionPackage: JSON.parse(
      readText("apps/vscode-extension/package.json"),
    ),
    renovateConfig: JSON.parse(readText("renovate.json")),
  });
}

function run() {
  const errors = validateRepositoryVscodeTypingsPolicy();
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("VS Code typings dependency policy is aligned.");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run();
}
