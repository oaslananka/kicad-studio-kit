import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_ROOT, "../..");
export const SCORECARD_POLICY_PATH = ".github/scorecard-residual-risk.json";

function readPolicy(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, SCORECARD_POLICY_PATH), "utf8"),
  );
}

export function loadScorecardResidualRiskPolicy(root = REPO_ROOT) {
  return readPolicy(root);
}

function validateStringArray(value, label, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum) {
    return [`${label} must contain at least ${minimum} item(s)`];
  }
  if (value.some((item) => typeof item !== "string" || item.trim() === "")) {
    return [`${label} must contain non-empty strings`];
  }
  if (new Set(value).size !== value.length) {
    return [`${label} must not contain duplicates`];
  }
  return [];
}

function validatePolicyHeader(value) {
  const errors = [];
  if (value?.schemaVersion !== 1) {
    errors.push("scorecard policy schemaVersion must be 1");
  }
  if (value?.repository !== "oaslananka/kicad-studio-kit") {
    errors.push("scorecard policy repository must match this repository");
  }
  if (value?.sampleSize !== 30) {
    errors.push("scorecard policy sampleSize must remain 30");
  }
  return errors;
}

function validateSastPolicy(sast) {
  const errors = [];
  if (sast?.alertNumber !== 19 || sast?.ruleId !== "SASTID") {
    errors.push("scorecard SAST policy must identify alert 19 / SASTID");
  }
  if (
    sast?.disposition !== "false-positive" ||
    sast?.dismissalReason !== "false positive"
  ) {
    errors.push(
      "scorecard SAST disposition must remain evidence-backed false-positive",
    );
  }
  errors.push(
    ...validateStringArray(
      sast?.requiredCategories,
      "SAST requiredCategories",
      2,
    ),
  );
  const requiredCategories = [
    "/language:javascript-typescript",
    "/language:python",
  ];
  if (
    JSON.stringify(sast?.requiredCategories ?? []) !==
    JSON.stringify(requiredCategories)
  ) {
    errors.push(
      "SAST requiredCategories must remain JavaScript/TypeScript and Python",
    );
  }
  return errors;
}

function validateBranchProtectionPolicy(branchPolicy) {
  const errors = [];
  if (
    branchPolicy?.alertNumber !== 9 ||
    branchPolicy?.ruleId !== "BranchProtectionID"
  ) {
    errors.push(
      "scorecard branch policy must identify alert 9 / BranchProtectionID",
    );
  }
  if (
    branchPolicy?.disposition !== "accepted-risk" ||
    branchPolicy?.dismissalReason !== "won't fix"
  ) {
    errors.push(
      "branch-protection disposition must remain accepted-risk / won't fix",
    );
  }
  if (branchPolicy?.owner !== "oaslananka") {
    errors.push("branch-protection accepted risk must have owner oaslananka");
  }
  if (branchPolicy?.reviewCadence !== "quarterly") {
    errors.push("branch-protection accepted risk must be reviewed quarterly");
  }
  errors.push(
    ...validateStringArray(
      branchPolicy?.expectedWarnings,
      "branch expectedWarnings",
      5,
    ),
    ...validateStringArray(
      branchPolicy?.compensatingControls,
      "branch compensatingControls",
      5,
    ),
    ...validateStringArray(
      branchPolicy?.strongerApprovalTriggers,
      "branch strongerApprovalTriggers",
      5,
    ),
  );
  return errors;
}

export function validateScorecardResidualRiskPolicy(policy = null) {
  let value = policy;
  if (!value) {
    try {
      value = readPolicy(REPO_ROOT);
    } catch (error) {
      return [`Missing or invalid ${SCORECARD_POLICY_PATH}: ${error.message}`];
    }
  }
  return [
    ...validatePolicyHeader(value),
    ...validateSastPolicy(value?.sast),
    ...validateBranchProtectionPolicy(value?.branchProtection),
  ];
}

function alertsForRule(alerts, ruleId) {
  return alerts.filter((alert) => alert?.rule?.id === ruleId);
}

function alertSelection(alerts, ruleId, alertNumber) {
  const matching = alertsForRule(alerts, ruleId);
  return {
    expected: matching.find((alert) => alert?.number === alertNumber),
    unexpectedActive: matching.filter(
      (alert) => alert?.number !== alertNumber && alert?.state !== "fixed",
    ),
  };
}

function warningLines(alert) {
  const text = alert?.most_recent_instance?.message?.text ?? "";
  return String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("Warn: "))
    .map((line) => line.slice("Warn: ".length));
}

function buildSastEvidence(policy, recentCommits, codeqlAnalyses, alerts) {
  const required = policy.sast.requiredCategories;
  const mainAnalyses = codeqlAnalyses.filter(
    (analysis) => analysis?.ref === "refs/heads/main",
  );
  const categoriesByCommit = new Map();
  for (const analysis of mainAnalyses) {
    if (!categoriesByCommit.has(analysis.commit_sha)) {
      categoriesByCommit.set(analysis.commit_sha, new Set());
    }
    categoriesByCommit.get(analysis.commit_sha).add(analysis.category);
  }
  const missingCommits = [];
  for (const commit of recentCommits) {
    const categories = categoriesByCommit.get(commit.sha) ?? new Set();
    const missingCategories = required.filter(
      (category) => !categories.has(category),
    );
    if (missingCategories.length > 0) {
      missingCommits.push({ sha: commit.sha, missingCategories });
    }
  }
  const selection = alertSelection(
    alerts,
    policy.sast.ruleId,
    policy.sast.alertNumber,
  );
  const alert = selection.expected;
  const sampleComplete = recentCommits.length === policy.sampleSize;
  let status = "resolved";
  if (selection.unexpectedActive.length > 0) status = "alert-identity-drift";
  else if (!sampleComplete || missingCommits.length > 0)
    status = "coverage-gap";
  else if (alert?.state === "dismissed") status = "false-positive-recorded";
  else if (alert?.state === "open") status = "false-positive-supported";
  return {
    status,
    disposition: policy.sast.disposition,
    dismissalReason: policy.sast.dismissalReason,
    alertNumber: policy.sast.alertNumber,
    alertState: alert?.state ?? "absent",
    unexpectedActiveAlerts: selection.unexpectedActive.map((item) => ({
      number: item.number,
      state: item.state,
    })),
    sampledCommitCount: recentCommits.length,
    coveredCommitCount: recentCommits.length - missingCommits.length,
    requiredCategories: required,
    missingCommits,
    rationale: policy.sast.rationale,
  };
}

function setDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function buildBranchProtectionEvidence(policy, alerts, governanceReport) {
  const branchPolicy = policy.branchProtection;
  const selection = alertSelection(
    alerts,
    branchPolicy.ruleId,
    branchPolicy.alertNumber,
  );
  const alert = selection.expected;
  const observedWarnings = warningLines(alert);
  const unexpectedWarnings = setDifference(
    observedWarnings,
    branchPolicy.expectedWarnings,
  );
  const missingExpectedWarnings = alert
    ? setDifference(branchPolicy.expectedWarnings, observedWarnings)
    : [];
  const governanceCurrent =
    governanceReport?.status === "current" &&
    governanceReport?.exitCode === 0 &&
    governanceReport?.ruleset?.status === "current" &&
    (governanceReport?.ruleset?.differences?.length ?? 0) === 0;
  let status = "resolved";
  if (!governanceCurrent) status = "governance-drift";
  else if (selection.unexpectedActive.length > 0)
    status = "alert-identity-drift";
  else if (alert?.state === "fixed") status = "resolved";
  else if (
    unexpectedWarnings.length > 0 ||
    missingExpectedWarnings.length > 0
  ) {
    status = "scorecard-drift";
  } else if (alert) status = "accepted-risk-current";
  return {
    status,
    disposition: branchPolicy.disposition,
    dismissalReason: branchPolicy.dismissalReason,
    alertNumber: branchPolicy.alertNumber,
    alertState: alert?.state ?? "absent",
    unexpectedActiveAlerts: selection.unexpectedActive.map((item) => ({
      number: item.number,
      state: item.state,
    })),
    owner: branchPolicy.owner,
    reviewCadence: branchPolicy.reviewCadence,
    observedWarnings,
    expectedWarnings: branchPolicy.expectedWarnings,
    unexpectedWarnings,
    missingExpectedWarnings,
    compensatingControls: branchPolicy.compensatingControls,
    strongerApprovalTriggers: branchPolicy.strongerApprovalTriggers,
    governanceStatus: governanceReport?.status ?? "unavailable",
    rulesetStatus: governanceReport?.ruleset?.status ?? "unavailable",
  };
}

export function buildScorecardEvidenceReport({
  policy,
  recentCommits = [],
  codeqlAnalyses = [],
  scorecardAlerts = [],
  governanceReport = null,
  generatedAt = new Date().toISOString(),
}) {
  const sast = buildSastEvidence(
    policy,
    recentCommits,
    codeqlAnalyses,
    scorecardAlerts,
  );
  const branchProtection = buildBranchProtectionEvidence(
    policy,
    scorecardAlerts,
    governanceReport,
  );
  const currentSast = [
    "resolved",
    "false-positive-supported",
    "false-positive-recorded",
  ].includes(sast.status);
  const currentBranch = ["resolved", "accepted-risk-current"].includes(
    branchProtection.status,
  );
  const status = currentSast && currentBranch ? "current" : "drift";
  return {
    schemaVersion: 1,
    generatedAt,
    repository: policy.repository,
    status,
    exitCode: status === "current" ? 0 : 1,
    sast,
    branchProtection,
  };
}

function sanitizeReason(reason) {
  return String(reason)
    .replace(/\b(?:token|authorization)\s*[:=]\s*[^\s;]+/giu, "[redacted]")
    .replace(/\bbearer\s+[^\s;]+/giu, "Bearer [redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9_]+/gu, "[redacted-token]")
    .slice(0, 300);
}

export function buildUnavailableScorecardEvidenceReport({
  policy,
  reason,
  generatedAt = new Date().toISOString(),
}) {
  const safeReason = sanitizeReason(reason);
  return {
    schemaVersion: 1,
    generatedAt,
    repository: policy.repository,
    status: "unavailable",
    exitCode: 1,
    reason: safeReason,
    sast: { status: "unavailable", disposition: policy.sast.disposition },
    branchProtection: {
      status: "unavailable",
      disposition: policy.branchProtection.disposition,
      owner: policy.branchProtection.owner,
      reviewCadence: policy.branchProtection.reviewCadence,
    },
  };
}

function display(value) {
  return value === null || value === undefined ? "unavailable" : String(value);
}

export function renderScorecardEvidenceMarkdown(report) {
  const lines = [
    "# Scorecard Evidence Reconciliation",
    "",
    `Overall status: **${report.status}**`,
    "",
  ];
  if (report.status === "unavailable") {
    lines.push(`Live evidence unavailable: ${report.reason}`, "");
    return `${lines.join("\n")}\n`;
  }
  lines.push(
    "## SAST",
    "",
    `Status: **${report.sast.status}**`,
    `Sampled commits: ${report.sast.sampledCommitCount}`,
    `Commits with all required CodeQL categories: ${report.sast.coveredCommitCount}`,
    `Scorecard alert: ${report.sast.alertState} (#${report.sast.alertNumber})`,
    "",
    "## Branch protection",
    "",
    `Status: **${report.branchProtection.status}**`,
    `Live ruleset: ${display(report.branchProtection.rulesetStatus)}`,
    `Scorecard alert: ${report.branchProtection.alertState} (#${report.branchProtection.alertNumber})`,
    `Risk owner: ${report.branchProtection.owner}`,
    `Review cadence: ${report.branchProtection.reviewCadence}`,
    "",
  );
  if (report.sast.missingCommits?.length > 0) {
    lines.push(
      "### Missing CodeQL evidence",
      "",
      ...report.sast.missingCommits.map(
        (item) => `- ${item.sha}: ${item.missingCategories.join(", ")}`,
      ),
      "",
    );
  }
  if (report.branchProtection.unexpectedWarnings?.length > 0) {
    lines.push(
      "### Unexpected branch-protection deductions",
      "",
      ...report.branchProtection.unexpectedWarnings.map((item) => `- ${item}`),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
