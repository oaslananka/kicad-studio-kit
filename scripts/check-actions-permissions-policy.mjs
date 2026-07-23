#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse as parseYaml } from "yaml";

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const POLICY_PATH = ".github/actions-permissions.json";
const WORKFLOW_DIRECTORY = ".github/workflows";

function sorted(values) {
  return [...new Set(values ?? [])].sort((left, right) =>
    left.localeCompare(right),
  );
}

export {
  compareActionsPermissions,
  normalizeActionsPermissions,
} from "./lib/actions-permissions.mjs";

import { normalizeActionsPermissions } from "./lib/actions-permissions.mjs";

export function loadActionsPermissionPolicy(root = REPO_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, POLICY_PATH), "utf8"));
}

function workflowEvents(workflow) {
  if (typeof workflow?.on === "string") return [workflow.on];
  return Object.keys(workflow?.on ?? {});
}

function writeScopes(permissions) {
  return sorted(
    Object.entries(permissions ?? {})
      .filter(([, value]) => value === "write")
      .map(([scope]) => scope),
  );
}

function compareScopes(errors, key, expected, actual) {
  for (const scope of actual.filter((scope) => !expected.includes(scope))) {
    errors.push(`${key} has unexpected write scope ${scope}`);
  }
  for (const scope of expected.filter((scope) => !actual.includes(scope))) {
    errors.push(`${key} is missing required write scope ${scope}`);
  }
}

function checkoutSteps(job) {
  return (job?.steps ?? []).filter(
    (step) =>
      typeof step?.uses === "string" &&
      step.uses.startsWith("actions/checkout@"),
  );
}

function validatePullRequestWriteJob(errors, key, job, mode) {
  const condition = String(job?.if ?? "");
  if (mode === "same-repository-head-only") {
    if (
      !condition.includes(
        "github.event.pull_request.head.repo.full_name == github.repository",
      )
    ) {
      errors.push(`${key} requires a same-repository pull-request guard`);
    }
    return;
  }
  if (mode === "non-pull-request-job") {
    if (!condition.includes("github.event_name != 'pull_request'")) {
      errors.push(`${key} must be disabled for pull_request events`);
    }
    return;
  }
  if (mode !== "github-fork-token-read-only") {
    errors.push(`${key} has no approved pull-request write policy`);
  }
}

export function validateWorkflowPermissionPolicy(
  workflowName,
  workflow,
  policy,
) {
  const errors = [];
  const events = workflowEvents(workflow);
  if (events.includes("pull_request_target")) {
    errors.push(`${workflowName} must not use pull_request_target`);
  }

  const topWrites = writeScopes(workflow?.permissions);
  if (topWrites.length > 0) {
    errors.push(
      `${workflowName} top-level permissions must not grant write: ${topWrites.join(", ")}`,
    );
  }

  const seenWriteJobs = new Set();
  const persistedCounts = new Map();
  for (const [jobName, job] of Object.entries(workflow?.jobs ?? {})) {
    const key = `${workflowName}#${jobName}`;
    const actualWrites = writeScopes(job?.permissions);
    const expectedWrites = sorted(policy?.writeJobs?.[key] ?? []);
    if (actualWrites.length > 0 || expectedWrites.length > 0) {
      compareScopes(errors, key, expectedWrites, actualWrites);
      seenWriteJobs.add(key);
    }

    if (events.includes("pull_request") && actualWrites.length > 0) {
      validatePullRequestWriteJob(
        errors,
        key,
        job,
        policy?.pullRequestWriteJobs?.[key],
      );
    }

    for (const step of checkoutSteps(job)) {
      const persisted = step?.with?.["persist-credentials"];
      if (persisted === true) {
        persistedCounts.set(key, (persistedCounts.get(key) ?? 0) + 1);
      } else if (persisted !== false) {
        errors.push(`${key} checkout must set persist-credentials: false`);
      }
    }
  }

  for (const key of Object.keys(policy?.writeJobs ?? {})) {
    if (key.startsWith(`${workflowName}#`) && !seenWriteJobs.has(key)) {
      errors.push(`${key} write-job policy is stale or the job is missing`);
    }
  }

  const persistedPolicy = policy?.persistedCheckoutCredentials ?? {};
  const persistedKeys = new Set([
    ...persistedCounts.keys(),
    ...Object.keys(persistedPolicy).filter((key) =>
      key.startsWith(`${workflowName}#`),
    ),
  ]);
  for (const key of persistedKeys) {
    const expected = Number(persistedPolicy[key] ?? 0);
    const actual = persistedCounts.get(key) ?? 0;
    if (expected !== actual) {
      errors.push(
        `${key} expected ${expected} persisted checkout credential step(s), found ${actual}`,
      );
    }
  }

  return errors;
}

function validatePolicyShape(policy) {
  const errors = [];
  if (policy?.schemaVersion !== 1) {
    errors.push("actions permissions policy schemaVersion must be 1");
  }
  const expected = normalizeActionsPermissions(policy?.repositoryDefaults);
  if (expected.defaultWorkflowPermissions !== "read") {
    errors.push("repository default workflow permissions must be read");
  }
  if (expected.canApprovePullRequestReviews !== false) {
    errors.push("Actions pull-request review approval must be disabled");
  }
  if (expected.allowedActions !== "all") {
    errors.push("allowed_actions policy must document the selected live value");
  }
  if (expected.shaPinningRequired !== true) {
    errors.push("platform SHA pinning must be required");
  }
  return errors;
}

export function validateActionsPermissionPolicy(root = REPO_ROOT) {
  const policy = loadActionsPermissionPolicy(root);
  const errors = validatePolicyShape(policy);
  const directory = path.join(root, WORKFLOW_DIRECTORY);
  const workflowNames = fs
    .readdirSync(directory)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort((left, right) => left.localeCompare(right));

  for (const workflowName of workflowNames) {
    const source = fs.readFileSync(path.join(directory, workflowName), "utf8");
    const workflow = parseYaml(source);
    errors.push(
      ...validateWorkflowPermissionPolicy(workflowName, workflow, policy),
    );
  }
  return errors;
}

function runCli() {
  const errors = validateActionsPermissionPolicy();
  if (errors.length > 0) {
    process.stderr.write(
      `Actions permissions policy failed:\n- ${errors.join("\n- ")}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Actions permissions policy passed.\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  runCli();
}
