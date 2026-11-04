#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateRetiredDependencyPolicy } from "./lib/retired-dependency-evidence.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const rootCommand =
  "node scripts/check-dependency-automation-policy.mjs && node --test scripts/check-dependency-automation-policy.test.mjs scripts/check-retired-dependency-evidence.test.mjs";
const ownershipClaim = "Renovate is the sole dependency-update PR author";

function readJson(root, file, errors) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  } catch (error) {
    errors.push("Invalid or missing " + file + ": " + error.message);
    return {};
  }
}
function isSingleRuleMatch(rule, key, value) {
  const values = rule?.[key];
  return values?.length === 1 && values[0] === value;
}

function isDevPatchAutomerge(rule) {
  return (
    isSingleRuleMatch(rule, "matchManagers", "npm") &&
    isSingleRuleMatch(rule, "matchDepTypes", "devDependencies") &&
    isSingleRuleMatch(rule, "matchUpdateTypes", "patch") &&
    rule.automerge === true
  );
}

function isProtectedSquashLane(lane) {
  return (
    lane?.automergeType === "pr" &&
    lane.platformAutomerge === true &&
    lane.automergeStrategy === "squash"
  );
}

function validateGlobalAutomergePolicy(renovate, errors) {
  if (
    renovate.automerge !== false ||
    renovate.platformAutomerge !== false ||
    renovate.automergeType !== "pr"
  ) {
    errors.push(
      "Renovate must not enable global automerge or direct branch merging",
    );
  }
  if (
    renovate.commitHourlyLimit !== 2 ||
    renovate.prHourlyLimit !== 2 ||
    renovate.prConcurrentLimit !== 5
  ) {
    errors.push("Renovate update frequency/concurrency must remain bounded");
  }
  if (
    renovate.vulnerabilityAlerts?.dependencyDashboardApproval !== false ||
    renovate.vulnerabilityAlerts?.prCreation !== "immediate"
  ) {
    errors.push(
      "Security advisory remediation must not wait for dashboard approval",
    );
  }
}

function validateProtectedAutomergeLanes(renovate, errors) {
  const devPatch = renovate.packageRules?.filter(isDevPatchAutomerge) ?? [];
  const lockfile = renovate.lockFileMaintenance;
  if (
    devPatch.length !== 1 ||
    !isProtectedSquashLane(devPatch[0]) ||
    lockfile?.enabled !== true ||
    lockfile?.automerge !== true ||
    !isProtectedSquashLane(lockfile)
  ) {
    errors.push(
      "Only protected squash-merged dev patch and lockfile lanes may automerge",
    );
  }
  for (const rule of renovate.packageRules ?? []) {
    if (rule.automerge === true && !devPatch.includes(rule)) {
      errors.push(
        "Unexpected automatic merge rule outside safe dev patch lane",
      );
    }
  }
  const majorRule = renovate.packageRules?.find((rule) =>
    isSingleRuleMatch(rule, "matchUpdateTypes", "major"),
  );
  if (
    majorRule?.dependencyDashboardApproval !== true ||
    majorRule?.automerge !== false
  ) {
    errors.push("Major upgrades must remain dashboard-gated and review-only");
  }
}

function validateRenovateAutoMerge(renovate, errors) {
  // Renovate is the only updater; GitHub protected squash PRs are the
  // only merger. Runtime, major and workflow updates remain reviewed.
  validateGlobalAutomergePolicy(renovate, errors);
  validateProtectedAutomergeLanes(renovate, errors);
}

export function validateDependencyAutomationPolicy(root = repoRoot) {
  const errors = [];
  // Commit 5779718 deliberately retired Dependabot PR generation.
  if (fs.existsSync(path.join(root, ".github/dependabot.yml"))) {
    errors.push(
      ".github/dependabot.yml must remain absent: Renovate owns update PRs",
    );
  }
  const renovate = readJson(root, "renovate.json", errors);
  if (renovate.dependencyDashboard !== true)
    errors.push("Renovate dependencyDashboard must stay enabled");
  if (renovate.vulnerabilityAlerts?.enabled !== true)
    errors.push("Renovate vulnerabilityAlerts must stay enabled");
  validateRenovateAutoMerge(renovate, errors);

  const scripts = readJson(root, "package.json", errors).scripts ?? {};
  if (
    scripts["check:dependency-automation-policy"] !== rootCommand ||
    !scripts.check?.includes("pnpm run check:dependency-automation-policy")
  ) {
    errors.push("Root check must include check:dependency-automation-policy");
  }
  if (scripts["check:dependabot-policy"] !== undefined)
    errors.push("Retired Dependabot check must stay absent");
  errors.push(...validateRetiredDependencyPolicy(root));
  for (const file of ["docs/security.md", "docs/dependency-lifecycle.md"]) {
    let doc = "";
    try {
      doc = fs.readFileSync(path.join(root, file), "utf8");
    } catch (error) {
      errors.push("Missing " + file + ": " + error.message);
    }
    if (!doc.includes(ownershipClaim))
      errors.push(file + " must document Renovate-only update ownership");
    if (!doc.includes("/packages/mcp-server"))
      errors.push(file + " must retain the retired MCP boundary");
  }
  return errors;
}
function main() {
  const errors = validateDependencyAutomationPolicy();
  if (errors.length) {
    console.error("Dependency automation policy failed:");
    for (const error of errors) console.error("- " + error);
    process.exit(1);
  }
  console.log("Renovate-only dependency automation policy passed.");
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
