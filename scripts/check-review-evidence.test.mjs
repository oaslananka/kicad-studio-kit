import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  classifyReviewArtifacts,
  validateReviewEvidence,
} from "./lib/review-evidence.mjs";

const fixtureRoot = path.join(
  import.meta.dirname,
  "fixtures",
  "review-evidence",
);

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(fixtureRoot, name), "utf8"));
}

for (const fixtureName of [
  "completed-findings.json",
  "completed-no-findings.json",
  "unavailable-with-compensation.json",
  "unavailable-no-reviewer.json",
  "unavailable-without-compensation.json",
  "not-applicable.json",
  "missing-review.json",
]) {
  test(`#530 classifies and validates ${fixtureName}`, () => {
    const fixture = loadFixture(fixtureName);
    const outcome = classifyReviewArtifacts(fixture);
    const errors = validateReviewEvidence(fixture);

    assert.equal(outcome, fixture.expected.outcome);
    assert.equal(errors.length === 0, fixture.expected.valid);
    if (fixture.expected.errorIncludes) {
      assert.ok(
        errors.some((error) => error.includes(fixture.expected.errorIncludes)),
        `expected ${JSON.stringify(errors)} to contain ${fixture.expected.errorIncludes}`,
      );
    }
  });
}

test("#530 quota and capacity notices never count as completed review", () => {
  for (const body of [
    "Usage quota exhausted. Review could not be performed.",
    "Review service is at capacity; try again later.",
    "Rate limit reached. No review was performed.",
    "Authentication failed before review started.",
  ]) {
    assert.equal(
      classifyReviewArtifacts({
        applicable: true,
        requested: true,
        artifacts: [{ id: body, actorType: "agent", kind: "comment", body }],
      }),
      "unavailable",
    );
  }
});

test("#530 every bot and agent artifact requires final triage", () => {
  const fixture = loadFixture("completed-no-findings.json");
  fixture.triage = [];
  const errors = validateReviewEvidence(fixture);
  assert.ok(errors.some((error) => error.includes("missing triage")));
});

test("#530 merge-ready evidence cannot retain actionable findings", () => {
  const fixture = loadFixture("completed-findings.json");
  fixture.triage[0].classification = "actionable";
  const errors = validateReviewEvidence(fixture);
  assert.ok(errors.some((error) => error.includes("remains actionable")));
});

test("#530 stale triage entries fail closed", () => {
  const fixture = loadFixture("completed-no-findings.json");
  fixture.triage.push({
    artifactId: "removed-comment",
    classification: "duplicate",
    resolution: "Duplicate of a removed comment.",
  });
  const errors = validateReviewEvidence(fixture);
  assert.ok(errors.some((error) => error.includes("stale triage")));
});

test("#530 duplicate artifact IDs fail closed", () => {
  const fixture = loadFixture("completed-findings.json");
  fixture.artifacts[1].id = fixture.artifacts[0].id;
  const errors = validateReviewEvidence(fixture);
  assert.ok(errors.some((error) => error.includes("duplicate artifact id")));
});

test("#530 completed findings require a resolved or duplicate disposition", () => {
  const fixture = loadFixture("completed-findings.json");
  fixture.triage[0].classification = "informational";
  const errors = validateReviewEvidence(fixture);
  assert.ok(
    errors.some(
      (error) =>
        error.includes("finding artifact") &&
        error.includes("resolved or duplicate"),
    ),
  );
});

test("#530 specialist bot status cannot satisfy automated code review", () => {
  assert.equal(
    classifyReviewArtifacts({
      applicable: true,
      requested: true,
      artifacts: [
        {
          id: "scanner",
          actorType: "bot",
          kind: "comment",
          body: "Security scan completed with no findings.",
        },
      ],
    }),
    "missing",
  );
});

test("#530 human review cannot satisfy the automated-review outcome", () => {
  assert.equal(
    classifyReviewArtifacts({
      applicable: true,
      requested: true,
      artifacts: [
        {
          id: "human-review",
          actorType: "human",
          kind: "review",
          state: "APPROVED",
          findingsCount: 0,
          body: "Approved by a human maintainer.",
        },
      ],
    }),
    "missing",
  );
});

test("#530 explicit reviewer unavailability requires a reason", () => {
  const fixture = loadFixture("unavailable-no-reviewer.json");
  fixture.reviewAvailability.reason = "";
  const errors = validateReviewEvidence(fixture);
  assert.ok(
    errors.some((error) =>
      error.includes("unavailability record requires a reason"),
    ),
  );
});
