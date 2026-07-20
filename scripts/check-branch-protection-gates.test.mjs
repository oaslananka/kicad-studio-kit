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
