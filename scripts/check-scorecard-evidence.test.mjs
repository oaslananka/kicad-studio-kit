import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScorecardEvidenceReport,
  buildUnavailableScorecardEvidenceReport,
  loadScorecardResidualRiskPolicy,
  validateScorecardResidualRiskPolicy,
} from "./lib/scorecard-evidence.mjs";

const policy = loadScorecardResidualRiskPolicy();
const commits = Array.from({ length: 30 }, (_, index) => ({
  sha: `${String(index).padStart(2, "0")}${"a".repeat(38)}`,
}));
const analyses = commits.flatMap((commit) =>
  policy.sast.requiredCategories.map((category) => ({
    commit_sha: commit.sha,
    category,
    ref: "refs/heads/main",
  })),
);
const alerts = [
  {
    state: "open",
    number: policy.sast.alertNumber,
    rule: { id: policy.sast.ruleId },
    most_recent_instance: {
      message: {
        text: "score is 9: Warn: 26 commits out of 30 are checked with a SAST tool",
      },
    },
  },
  {
    state: "open",
    number: policy.branchProtection.alertNumber,
    rule: { id: policy.branchProtection.ruleId },
    most_recent_instance: {
      message: {
        text: policy.branchProtection.expectedWarnings
          .map((warning) => `Warn: ${warning}`)
          .join("\n"),
      },
    },
  },
];
const governanceReport = {
  status: "current",
  exitCode: 0,
  ruleset: { status: "current", differences: [] },
};

test("#532 current residual-risk policy is complete", () => {
  assert.deepEqual(validateScorecardResidualRiskPolicy(policy), []);
});

test("#532 weakened or malformed residual-risk policy is rejected", () => {
  const changed = structuredClone(policy);
  changed.sampleSize = 29;
  changed.sast.requiredCategories = ["/language:javascript-typescript"];
  changed.branchProtection.owner = "someone-else";
  const errors = validateScorecardResidualRiskPolicy(changed);
  assert.ok(errors.some((error) => /sampleSize/u.test(error)));
  assert.ok(errors.some((error) => /requiredCategories/u.test(error)));
  assert.ok(errors.some((error) => /owner/u.test(error)));
});

test("#532 direct 30/30 CodeQL evidence supports the SAST false-positive disposition", () => {
  const report = buildScorecardEvidenceReport({
    policy,
    recentCommits: commits,
    codeqlAnalyses: analyses,
    scorecardAlerts: alerts,
    governanceReport,
  });
  assert.equal(report.status, "current");
  assert.equal(report.exitCode, 0);
  assert.equal(report.sast.status, "false-positive-supported");
  assert.equal(report.sast.coveredCommitCount, 30);
  assert.deepEqual(report.sast.missingCommits, []);
});

test("#532 dismissed alerts remain observable for quarterly drift checks", () => {
  const dismissed = structuredClone(alerts);
  dismissed[0].state = "dismissed";
  dismissed[1].state = "dismissed";
  const report = buildScorecardEvidenceReport({
    policy,
    recentCommits: commits,
    codeqlAnalyses: analyses,
    scorecardAlerts: dismissed,
    governanceReport,
  });
  assert.equal(report.status, "current");
  assert.equal(report.sast.status, "false-positive-recorded");
  assert.equal(report.sast.alertState, "dismissed");
  assert.equal(report.branchProtection.status, "accepted-risk-current");
  assert.equal(report.branchProtection.alertState, "dismissed");
});

test("#532 replacement SARIF alert identities fail closed", () => {
  const changedAlerts = structuredClone(alerts);
  changedAlerts.push({
    state: "open",
    number: 999,
    rule: { id: policy.sast.ruleId },
    most_recent_instance: { message: { text: "replacement SAST alert" } },
  });
  const report = buildScorecardEvidenceReport({
    policy,
    recentCommits: commits,
    codeqlAnalyses: analyses,
    scorecardAlerts: changedAlerts,
    governanceReport,
  });
  assert.equal(report.status, "drift");
  assert.equal(report.sast.status, "alert-identity-drift");
  assert.deepEqual(report.sast.unexpectedActiveAlerts, [
    { number: 999, state: "open" },
  ]);
});

test("#532 a missing CodeQL language analysis fails closed", () => {
  const report = buildScorecardEvidenceReport({
    policy,
    recentCommits: commits,
    codeqlAnalyses: analyses.slice(1),
    scorecardAlerts: alerts,
    governanceReport,
  });
  assert.equal(report.status, "drift");
  assert.equal(report.exitCode, 1);
  assert.equal(report.sast.status, "coverage-gap");
  assert.equal(report.sast.missingCommits.length, 1);
});

test("#532 expected solo-maintainer warnings remain an explicit accepted risk", () => {
  const report = buildScorecardEvidenceReport({
    policy,
    recentCommits: commits,
    codeqlAnalyses: analyses,
    scorecardAlerts: alerts,
    governanceReport,
  });
  assert.equal(report.branchProtection.status, "accepted-risk-current");
  assert.deepEqual(report.branchProtection.unexpectedWarnings, []);
});

test("#532 a new branch-protection deduction fails closed", () => {
  const changedAlerts = structuredClone(alerts);
  changedAlerts[1].most_recent_instance.message.text +=
    "\nWarn: force pushes are allowed on branch 'main'";
  const report = buildScorecardEvidenceReport({
    policy,
    recentCommits: commits,
    codeqlAnalyses: analyses,
    scorecardAlerts: changedAlerts,
    governanceReport,
  });
  assert.equal(report.status, "drift");
  assert.match(
    report.branchProtection.unexpectedWarnings.join("\n"),
    /force pushes/u,
  );
});

test("#532 live ruleset drift invalidates the accepted risk", () => {
  const report = buildScorecardEvidenceReport({
    policy,
    recentCommits: commits,
    codeqlAnalyses: analyses,
    scorecardAlerts: alerts,
    governanceReport: {
      status: "drift",
      exitCode: 1,
      ruleset: { status: "drift", differences: ["required checks changed"] },
    },
  });
  assert.equal(report.status, "drift");
  assert.equal(report.branchProtection.status, "governance-drift");
});

test("#532 unavailable live APIs produce a sanitized fail-closed artifact", () => {
  const report = buildUnavailableScorecardEvidenceReport({
    policy,
    reason: "HTTP 502 Bad Gateway token=secret-value",
  });
  assert.equal(report.status, "unavailable");
  assert.equal(report.exitCode, 1);
  assert.doesNotMatch(JSON.stringify(report), /secret-value/u);
  assert.match(report.reason, /HTTP 502 Bad Gateway/u);
  const missingToken = buildUnavailableScorecardEvidenceReport({
    policy,
    reason: "GITHUB_TOKEN or GH_TOKEN is required with --fetch",
  });
  assert.match(missingToken.reason, /GITHUB_TOKEN/u);
});
