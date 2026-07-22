import assert from "node:assert/strict";
import test from "node:test";

import {
  loadReviewEvidenceSurfaces,
  validateReviewEvidenceFixtures,
  validateReviewEvidencePolicy,
  validateReviewEvidenceSurfaces,
} from "./check-review-evidence.mjs";

test("#530 repository review-evidence policy is complete", () => {
  assert.deepEqual(validateReviewEvidencePolicy(), []);
});

test("#530 checked-in historical fixtures dry-run truthfully", () => {
  const result = validateReviewEvidenceFixtures();
  assert.deepEqual(result.errors, []);
  assert.equal(result.total, 6);
  assert.equal(result.expectedValid, 4);
  assert.equal(result.expectedInvalid, 2);
});

test("#530 PR template cannot lose outcome, triage, or compensation fields", () => {
  const surfaces = loadReviewEvidenceSurfaces();
  surfaces.template = surfaces.template
    .replace("Completed with no findings", "Review complete")
    .replace("Documented manual review", "Manual check");

  const errors = validateReviewEvidenceSurfaces(surfaces);
  assert.ok(
    errors.some((error) => error.includes("Completed with no findings")),
  );
  assert.ok(errors.some((error) => error.includes("Documented manual review")));
});

test("#530 quota and capacity notices remain explicitly non-review evidence", () => {
  const surfaces = loadReviewEvidenceSurfaces();
  surfaces.policy = surfaces.policy.replace(
    "Availability, quota, rate-limit, and capacity notices are not completed reviews.",
    "External review status is recorded.",
  );

  const errors = validateReviewEvidenceSurfaces(surfaces);
  assert.ok(errors.some((error) => error.includes("not completed reviews")));
});

test("#530 root and metadata gates cannot silently drop review-evidence validation", () => {
  const surfaces = loadReviewEvidenceSurfaces();
  surfaces.packageJson.scripts["check:review-evidence"] = "echo skipped";
  surfaces.packageJson.scripts.check =
    surfaces.packageJson.scripts.check.replace(
      " && pnpm run check:review-evidence",
      "",
    );
  surfaces.ci = surfaces.ci.replace(
    "corepack pnpm run check:review-evidence",
    "corepack pnpm run check:agent-configs",
  );

  const errors = validateReviewEvidenceSurfaces(surfaces);
  assert.ok(errors.some((error) => error.includes("check:review-evidence")));
  assert.ok(errors.some((error) => error.includes("metadata job")));
});
