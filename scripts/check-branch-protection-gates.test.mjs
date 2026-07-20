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
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: true,
        require_last_push_approval: true,
        required_approving_review_count: 1,
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
        dependabot_security_updates: { status: "enabled" },
        secret_scanning: { status: "enabled" },
        secret_scanning_push_protection: { status: "enabled" },
        secret_scanning_non_provider_patterns: { status: "disabled" },
        secret_scanning_validity_checks: { status: "disabled" },
      },
    },
    privateVulnerabilityReporting: { available: true, enabled: true },
    endpointAvailability: {
      dependabotAlerts: { available: true },
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
