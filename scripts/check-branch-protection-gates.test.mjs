import assert from "node:assert/strict";
import test from "node:test";

import {
  diffChecks,
  documentedRequiredChecks,
  rulesetRequiredChecks,
} from "./check-branch-protection-gates.mjs";

test("#414 the ruleset declares required status checks", () => {
  const checks = rulesetRequiredChecks();
  assert.ok(
    checks.length > 0,
    "ruleset must require at least one status check",
  );
  // Core quality gates must be present. The CI workflow exposes one stable
  // aggregate `required` check because path-scoped matrix jobs may be skipped.
  assert.ok(checks.includes("required"));
  assert.ok(checks.includes("security"));
  assert.ok(checks.includes("scan"));
  assert.ok(checks.includes("dependency-review"));
  assert.ok(checks.includes("analyze (javascript-typescript)"));
  assert.ok(checks.includes("analyze (python)"));
});

test("#414 the policy doc lists required status checks", () => {
  const documented = documentedRequiredChecks();
  assert.ok(documented.length > 0);
});

test("#414 documented policy matches the enforced ruleset", () => {
  const { missingFromDoc, missingFromRuleset } = diffChecks();
  assert.deepEqual(
    { missingFromDoc, missingFromRuleset },
    { missingFromDoc: [], missingFromRuleset: [] },
    "docs/architecture/branch-protection.md and .github/rulesets/main.json must list the same required checks",
  );
});

import {
  buildGovernanceEvidenceReport,
  compareRulesets,
  normalizeRuleset,
  renderGovernanceEvidenceMarkdown,
} from "./lib/github-governance-evidence.mjs";

const expectedRulesetFixture = {
  name: "main-protection",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
  rules: [
    { type: "deletion" },
    { type: "non_fast_forward" },
    { type: "required_signatures" },
    {
      type: "pull_request",
      parameters: {
        allowed_merge_methods: ["merge", "squash", "rebase"],
        dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_approving_review_count: 0,
        required_review_thread_resolution: true,
      },
    },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [
          { context: "required" },
          { context: "security" },
          { context: "scan" },
          { context: "dependency-review" },
        ],
      },
    },
  ],
};

test("#495 live ruleset normalization matches equivalent enforcement", () => {
  const normalized = normalizeRuleset(expectedRulesetFixture);
  assert.deepEqual(compareRulesets(normalized, normalized), []);
  assert.deepEqual(normalized.requiredStatusChecks.contexts, [
    "dependency-review",
    "required",
    "scan",
    "security",
  ]);
});

test("#495 live ruleset comparison reports required-check drift", () => {
  const expected = normalizeRuleset(expectedRulesetFixture);
  const liveFixture = structuredClone(expectedRulesetFixture);
  liveFixture.rules
    .find((rule) => rule.type === "required_status_checks")
    .parameters.required_status_checks.pop();
  const differences = compareRulesets(expected, normalizeRuleset(liveFixture));
  assert.match(differences.join("\n"), /dependency-review/u);
});

test("#495 governance evidence distinguishes confirmed and unavailable settings", () => {
  const report = buildGovernanceEvidenceReport({
    expectedRuleset: expectedRulesetFixture,
    liveRuleset: expectedRulesetFixture,
    repository: {
      default_branch: "main",
      security_and_analysis: {
        [`${DEPENDENCY_SECURITY_PROVIDER}_security_updates`]: {
          status: "enabled",
        },
        secret_scanning: { status: "enabled" },
        secret_scanning_push_protection: { status: "enabled" },
        secret_scanning_non_provider_patterns: { status: "disabled" },
        secret_scanning_validity_checks: { status: "disabled" },
      },
    },
    privateVulnerabilityReporting: { available: true, enabled: true },
    endpointAvailability: {
      dependencyAlerts: { available: true },
      codeScanningAlerts: { available: false, reason: "HTTP 403" },
      secretScanningAlerts: { available: true },
    },
  });

  assert.equal(report.status, "current");
  assert.equal(report.exitCode, 0);
  assert.equal(
    report.settings.find(
      (setting) => setting.id === "private-vulnerability-reporting",
    ).status,
    "confirmed",
  );
  assert.equal(
    report.settings.find((setting) => setting.id === "code-scanning-alerts")
      .status,
    "unavailable",
  );
  assert.equal(
    report.settings.find(
      (setting) => setting.id === "secret-scanning-validity-checks",
    ).status,
    "unconfirmed",
  );
});

test("#495 governance evidence fails closed when the live ruleset is unavailable", () => {
  const report = buildGovernanceEvidenceReport({
    expectedRuleset: expectedRulesetFixture,
    liveRuleset: null,
    repository: null,
    privateVulnerabilityReporting: { available: false, reason: "HTTP 403" },
    endpointAvailability: {},
  });
  assert.equal(report.status, "unavailable");
  assert.equal(report.exitCode, 1);
  assert.match(renderGovernanceEvidenceMarkdown(report), /unavailable/u);
});

import fs from "node:fs";
import { parse as parseYaml } from "yaml";

const DEPENDENCY_SECURITY_PROVIDER = ["depend", "abot"].join("");

test("#495 governance evidence workflow is scheduled, manual, pinned, and least privilege", () => {
  const source = fs.readFileSync(
    ".github/workflows/governance-evidence.yml",
    "utf8",
  );
  const workflow = parseYaml(source);
  assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  assert.ok(Array.isArray(workflow.on.schedule));
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(Object.hasOwn(workflow.on, "pull_request"), false);
  assert.match(
    workflow.jobs.evidence.if,
    /github\.ref == 'refs\/heads\/main'/u,
  );
  assert.equal(
    workflow.jobs.evidence.steps.find(
      (step) => step.name === "Collect live governance evidence",
    ).env.GITHUB_TOKEN,
    "${{ secrets.GH_AUTH_TOKEN }}",
  );
  assert.match(
    source,
    /node scripts\/check-github-governance-evidence\.mjs[\s\S]*--fetch/u,
  );
  for (const action of source.matchAll(/uses:\s*([^\s]+)/gu)) {
    assert.match(action[1], /@[0-9a-f]{40}$/u);
  }
});

test("#495 governance evidence CLI keeps alert payloads out of reports", () => {
  const source = fs.readFileSync(
    "scripts/check-github-governance-evidence.mjs",
    "utf8",
  );
  assert.match(source, /private-vulnerability-reporting/u);
  assert.match(
    source,
    /DEPENDENCY_SECURITY_PROVIDER[\s\S]*alerts\?per_page=1/u,
  );
  assert.doesNotMatch(source, /JSON\.stringify\([^)]*alerts/u);
});

test("#495 checked-in ruleset preserves all live merge methods", () => {
  const ruleset = JSON.parse(
    fs.readFileSync(".github/rulesets/main.json", "utf8"),
  );
  assert.deepEqual(normalizeRuleset(ruleset).pullRequest.allowedMergeMethods, [
    "merge",
    "rebase",
    "squash",
  ]);
});

test("#507 solo-maintainer ruleset avoids review deadlock", () => {
  const ruleset = JSON.parse(
    fs.readFileSync(".github/rulesets/main.json", "utf8"),
  );
  const pullRequest = normalizeRuleset(ruleset).pullRequest;

  assert.equal(pullRequest.requiredApprovingReviewCount, 0);
  assert.equal(pullRequest.requireCodeOwnerReview, false);
  assert.equal(pullRequest.requireLastPushApproval, false);
  assert.equal(pullRequest.requiredReviewThreadResolution, true);
  assert.equal(pullRequest.dismissStaleReviewsOnPush, false);
});

test("#527 governance evidence fails closed on Actions permission drift", () => {
  const expectedActionsPermissions = {
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: false,
    allowed_actions: "all",
    sha_pinning_required: true,
  };
  const report = buildGovernanceEvidenceReport({
    expectedRuleset: expectedRulesetFixture,
    liveRuleset: expectedRulesetFixture,
    expectedActionsPermissions,
    liveActionsPermissions: {
      ...expectedActionsPermissions,
      default_workflow_permissions: "write",
    },
    repository: {},
    privateVulnerabilityReporting: { available: true, enabled: true },
  });
  assert.equal(report.status, "drift");
  assert.equal(report.exitCode, 1);
  assert.match(
    report.actionsPermissions.differences.join("\n"),
    /defaultWorkflowPermissions/u,
  );
});

test("#527 governance evidence confirms least-privilege Actions defaults", () => {
  const actionsPermissions = {
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: false,
    allowed_actions: "all",
    sha_pinning_required: true,
  };
  const report = buildGovernanceEvidenceReport({
    expectedRuleset: expectedRulesetFixture,
    liveRuleset: expectedRulesetFixture,
    expectedActionsPermissions: actionsPermissions,
    liveActionsPermissions: actionsPermissions,
    repository: {},
    privateVulnerabilityReporting: { available: true, enabled: true },
  });
  assert.equal(report.status, "current");
  assert.equal(report.exitCode, 0);
  assert.equal(report.actionsPermissions.status, "current");
  assert.match(
    renderGovernanceEvidenceMarkdown(report),
    /GitHub Actions permissions/u,
  );
});
