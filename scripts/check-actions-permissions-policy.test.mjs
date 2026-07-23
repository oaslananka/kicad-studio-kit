import assert from "node:assert/strict";
import test from "node:test";

import {
  compareActionsPermissions,
  loadActionsPermissionPolicy,
  normalizeActionsPermissions,
  validateActionsPermissionPolicy,
  validateWorkflowPermissionPolicy,
} from "./check-actions-permissions-policy.mjs";

const policyFixture = {
  schemaVersion: 1,
  repositoryDefaults: {
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: false,
    allowed_actions: "all",
    sha_pinning_required: true,
  },
  writeJobs: {
    "docs.yml#deploy": ["id-token", "pages"],
  },
  persistedCheckoutCredentials: {
    "release-please.yml#release": 2,
  },
  pullRequestWriteJobs: {
    "ci.yml#coverage-report": "same-repository-head-only",
    "codeql.yml#analyze": "github-fork-token-read-only",
  },
};

test("#527 normalizes and compares repository Actions defaults", () => {
  const expected = normalizeActionsPermissions(
    policyFixture.repositoryDefaults,
  );
  assert.deepEqual(compareActionsPermissions(expected, expected), []);
  assert.match(
    compareActionsPermissions(expected, {
      ...expected,
      defaultWorkflowPermissions: "write",
    }).join("\n"),
    /defaultWorkflowPermissions/u,
  );
  assert.match(
    compareActionsPermissions(expected, {
      ...expected,
      canApprovePullRequestReviews: true,
    }).join("\n"),
    /canApprovePullRequestReviews/u,
  );
});

test("#527 rejects top-level write permissions", () => {
  const workflow = {
    on: { pull_request: {} },
    permissions: { contents: "read", pages: "write" },
    jobs: { build: { "runs-on": "ubuntu-latest", steps: [] } },
  };
  assert.match(
    validateWorkflowPermissionPolicy("docs.yml", workflow, policyFixture).join(
      "\n",
    ),
    /top-level permissions must not grant write/u,
  );
});

test("#527 rejects unlisted or overbroad job write permissions", () => {
  const workflow = {
    on: { workflow_dispatch: {} },
    permissions: { contents: "read" },
    jobs: {
      deploy: {
        permissions: {
          contents: "write",
          pages: "write",
          "id-token": "write",
        },
        steps: [],
      },
    },
  };
  const errors = validateWorkflowPermissionPolicy(
    "docs.yml",
    workflow,
    policyFixture,
  );
  assert.match(errors.join("\n"), /unexpected write scope contents/u);
});

test("#527 requires explicit checkout credential handling", () => {
  const workflow = {
    on: { push: {} },
    permissions: { contents: "read" },
    jobs: {
      build: {
        steps: [
          { uses: "actions/checkout@0123456789012345678901234567890123456789" },
        ],
      },
    },
  };
  assert.match(
    validateWorkflowPermissionPolicy("ci.yml", workflow, policyFixture).join(
      "\n",
    ),
    /persist-credentials: false/u,
  );
});

test("#527 permits only counted reviewed checkout credential exceptions", () => {
  const workflow = {
    on: { push: {} },
    permissions: { contents: "read" },
    jobs: {
      release: {
        permissions: { contents: "write" },
        steps: [
          {
            uses: "actions/checkout@0123456789012345678901234567890123456789",
            with: { "persist-credentials": true },
          },
          {
            uses: "actions/checkout@0123456789012345678901234567890123456789",
            with: { "persist-credentials": true },
          },
        ],
      },
    },
  };
  const localPolicy = structuredClone(policyFixture);
  localPolicy.writeJobs["release-please.yml#release"] = ["contents"];
  assert.deepEqual(
    validateWorkflowPermissionPolicy(
      "release-please.yml",
      workflow,
      localPolicy,
    ),
    [],
  );
  workflow.jobs.release.steps.push({
    uses: "actions/checkout@0123456789012345678901234567890123456789",
    with: { "persist-credentials": true },
  });
  assert.match(
    validateWorkflowPermissionPolicy(
      "release-please.yml",
      workflow,
      localPolicy,
    ).join("\n"),
    /expected 2 persisted checkout credential step/u,
  );
});

test("#527 same-repository PR write jobs require an explicit fork guard", () => {
  const workflow = {
    on: { pull_request: {} },
    permissions: { contents: "read" },
    jobs: {
      "coverage-report": {
        if: "github.event_name == 'pull_request'",
        permissions: { contents: "read", "pull-requests": "write" },
        steps: [],
      },
    },
  };
  const localPolicy = structuredClone(policyFixture);
  localPolicy.writeJobs["ci.yml#coverage-report"] = ["pull-requests"];
  assert.match(
    validateWorkflowPermissionPolicy("ci.yml", workflow, localPolicy).join(
      "\n",
    ),
    /same-repository pull-request guard/u,
  );
});

test("#527 repository Actions permission policy is complete", () => {
  const policy = loadActionsPermissionPolicy();
  assert.equal(policy.repositoryDefaults.default_workflow_permissions, "read");
  assert.equal(
    policy.repositoryDefaults.can_approve_pull_request_reviews,
    false,
  );
  assert.deepEqual(validateActionsPermissionPolicy(), []);
});
