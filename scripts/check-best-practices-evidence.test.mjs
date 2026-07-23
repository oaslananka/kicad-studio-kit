import assert from "node:assert/strict";
import test from "node:test";

import { validateBestPracticesEvidence } from "./check-best-practices-evidence.mjs";

test("Best Practices evidence has the repository-controlled scorecard hardening anchors", () => {
  const result = validateBestPracticesEvidence();
  assert.equal(result.projectId, 13405);
  assert.deepEqual(result.requiredStatusChecks, [
    "required",
    "analyze (javascript-typescript)",
    "analyze (python)",
    "security",
    "scan",
    "dependency-review",
  ]);
  assert.ok(result.coverageThreshold.statements >= 80);
  assert.ok(result.coverageThreshold.lines >= 80);
  assert.ok(result.coverageThreshold.functions >= 80);
  assert.deepEqual(result.scorecard, {
    sampleSize: 30,
    branchWarningCount: 5,
    reviewCadence: "quarterly",
  });
});
