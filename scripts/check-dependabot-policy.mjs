#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");
const CONFIG_PATH = ".github/dependabot.yml";
const EXPECTED_ECOSYSTEMS = ["github-actions", "npm"];
const REQUIRED_LABELS = [
  "area:security",
  "dependencies",
  "dependency-lifecycle",
  "priority:P1",
  "product:repo",
  "security",
];
const OWNERSHIP_SENTENCE =
  "Dependabot is security-only for the active root npm and GitHub Actions surfaces";
const ROOT_SCRIPT =
  "node scripts/check-dependabot-policy.mjs && node --test scripts/check-dependabot-policy.test.mjs";

function readText(root, relativePath, errors) {
  try {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
  } catch (error) {
    errors.push(`Missing ${relativePath}: ${error.message}`);
    return "";
  }
}

function readJson(root, relativePath, errors) {
  const text = readText(root, relativePath, errors);
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${relativePath} must be strict JSON: ${error.message}`);
    return {};
  }
}

function readYaml(root, relativePath, errors) {
  const text = readText(root, relativePath, errors);
  try {
    return { text, value: parse(text) ?? {} };
  } catch (error) {
    errors.push(`${relativePath} must be valid YAML: ${error.message}`);
    return { text, value: {} };
  }
}

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual)) {
    return false;
  }
  return (
    actual.length === expected.length &&
    [...actual]
      .sort((left, right) => left.localeCompare(right))
      .every((value, index) => value === expected[index])
  );
}

function hasSecurityGroup(groups) {
  return Object.values(groups ?? {}).some(
    (group) =>
      group?.["applies-to"] === "security-updates" &&
      Array.isArray(group.patterns) &&
      group.patterns.includes("*"),
  );
}

function validateUpdateEntry(entry) {
  const errors = [];
  const ecosystem = entry?.["package-ecosystem"] ?? "unknown";
  if (entry?.directory !== "/") {
    errors.push(
      `Dependabot ${ecosystem} must target the active root directory /`,
    );
  }
  if (entry?.schedule?.interval !== "weekly") {
    errors.push(
      `Dependabot ${ecosystem} must retain the weekly security schedule`,
    );
  }
  if (entry?.cooldown?.["default-days"] !== 7) {
    errors.push(
      `Dependabot ${ecosystem} must retain the seven-day cooldown required by workflow security linting`,
    );
  }
  if (entry?.["open-pull-requests-limit"] !== 0) {
    errors.push(
      `Dependabot ${ecosystem} must stay security-only with open-pull-requests-limit: 0`,
    );
  }
  if (entry?.["target-branch"] !== undefined) {
    errors.push(
      `Dependabot ${ecosystem} must not set target-branch because security updates use the default branch`,
    );
  }
  if (!sameStringSet(entry?.labels, REQUIRED_LABELS)) {
    errors.push(
      `Dependabot ${ecosystem} must retain the reviewed security labels`,
    );
  }
  if (!sameStringSet(entry?.assignees, ["oaslananka"])) {
    errors.push(
      `Dependabot ${ecosystem} security updates must assign oaslananka`,
    );
  }
  if (!hasSecurityGroup(entry?.groups)) {
    errors.push(`Dependabot ${ecosystem} must retain a security-updates group`);
  }
  return errors;
}

function validateConfig(config, configText) {
  const errors = [];
  if (config?.version !== 2) {
    errors.push(`${CONFIG_PATH} must use version: 2`);
  }
  const updates = Array.isArray(config?.updates) ? config.updates : [];
  const ecosystems = updates
    .map((entry) => entry?.["package-ecosystem"])
    .filter((value) => typeof value === "string")
    .sort();
  if (!sameStringSet(ecosystems, EXPECTED_ECOSYSTEMS)) {
    errors.push(
      `${CONFIG_PATH} must configure exactly npm and github-actions active ecosystems`,
    );
  }
  if (
    /packages\/mcp-server|package-ecosystem:\s*["']?uv\b/iu.test(configText)
  ) {
    errors.push(
      `${CONFIG_PATH} must not reference the retired MCP uv target /packages/mcp-server`,
    );
  }
  for (const entry of updates) {
    errors.push(...validateUpdateEntry(entry));
  }
  return errors;
}

function validateRenovate(renovate) {
  const errors = [];
  if (renovate?.dependencyDashboard !== true) {
    errors.push("Renovate must remain the routine dependency-update authority");
  }
  if (renovate?.vulnerabilityAlerts?.enabled !== true) {
    errors.push("Renovate vulnerability alert handling must remain enabled");
  }
  return errors;
}

function validateRootScripts(packageJson) {
  const scripts = packageJson?.scripts ?? {};
  if (
    scripts["check:dependabot-policy"] !== ROOT_SCRIPT ||
    !scripts.check?.includes("pnpm run check:dependabot-policy")
  ) {
    return [
      "package.json must expose check:dependabot-policy and compose it into the root check",
    ];
  }
  return [];
}

function validateDocumentation(root, errors) {
  for (const relativePath of [
    "docs/security.md",
    "docs/dependency-lifecycle.md",
  ]) {
    const text = readText(root, relativePath, errors);
    if (!text.includes(OWNERSHIP_SENTENCE)) {
      errors.push(
        `${relativePath} must document the active-root Dependabot security-only ownership policy`,
      );
    }
    if (!text.includes("/packages/mcp-server")) {
      errors.push(
        `${relativePath} must record that the retired /packages/mcp-server target is forbidden`,
      );
    }
  }
}

export function validateDependabotPolicy(root = REPO_ROOT) {
  const errors = [];
  const { text, value } = readYaml(root, CONFIG_PATH, errors);
  errors.push(
    ...validateConfig(value, text),
    ...validateRenovate(readJson(root, "renovate.json", errors)),
    ...validateRootScripts(readJson(root, "package.json", errors)),
  );
  validateDocumentation(root, errors);
  return errors;
}

function main() {
  const errors = validateDependabotPolicy();
  if (errors.length > 0) {
    console.error("Dependabot security-target policy failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
  console.log("Dependabot security-target policy is valid.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
