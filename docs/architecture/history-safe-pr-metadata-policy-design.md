# History-Safe Pull Request Metadata Policy Design

## Status

Proposed design for review.

Target repository: `oaslananka/kicad-studio-kit`.

Evidence baseline:

- repository `main`: `c33258d8ba2d1c046cb674453b90e1e7121f9516`;
- open dependency-convergence PR #720 head: `1542054f9bf8fdad9e895fc0fcde9d244877ec61`;
- live default-branch ruleset: `main-standard` (ruleset ID `19858802`);
- live ruleset allows only squash merges, requires linear history, conversation resolution, strict required checks, and disallows non-fast-forward updates to `main`;
- current repository squash title setting: `COMMIT_OR_PR_TITLE`;
- checked-in `.github/rulesets/main.json` does not match the live ruleset.

## Problem

The repository currently applies Conventional Commit scope validation to both the pull request title and every intermediate commit in the pull request branch.

That is incompatible with the repository's actual integration model.

The live `main-standard` ruleset allows only squash merges. Under a squash merge, the durable commit that reaches `main` is the squash commit; the pull request branch's intermediate commits are not preserved as separate commits on `main`.

PR #720 demonstrates the failure mode:

1. Its title is currently `chore: converge dependency automation with Mergify`.
2. Its three existing branch commits are also scope-less.
3. The metadata job rejects the title and all three commit subjects.
4. The ephemeral remediation worker can fix repository files in its prepared checkout, but changing the three existing commit subjects requires amend/rebase/history rewriting.
5. The trusted publisher is intentionally exact-head and non-force. It rejects any worker-local `HEAD` rewrite rather than publishing rewritten history.
6. Re-running the same remediation therefore cannot converge: the repository gate demands a history rewrite that the publication architecture correctly refuses.

The current behavior creates a policy deadlock, not a publisher defect.

A second governance problem is visible at the same boundary. The checked-in `.github/rulesets/main.json` says merge, squash, and rebase are allowed and includes `required_signatures`. The live `main-standard` ruleset instead allows only squash, requires linear history, and does not contain that checked-in rule shape. `scripts/check-branch-protection-gates.mjs` currently compares only required status-check names, so it cannot detect this drift even though `docs/architecture/branch-protection.md` says the checked-in policy and live ruleset should match.

## Goals

1. Preserve Conventional Commit scope quality for the commit that becomes durable `main` history.
2. Keep the trusted publisher exact-head, non-force, and incapable of silently rewriting contributor or worker history.
3. Make existing pull requests repairable without rebase/amend/force-push.
4. Keep required CI, security, review-thread, strict-up-to-date, and linear-history gates intact.
5. Make the checked-in branch-protection contract reflect the live protected-branch policy and detect future semantic drift.
6. Keep Release Please behavior deterministic and product-scoped.

## Non-goals

This design does not:

- add force-push capability to the fleet publisher;
- authorize workers to commit, amend, rebase, push, or create branches;
- weaken required checks, security scanning, dependency review, or conversation-resolution policy;
- bypass GitHub rulesets or Mergify/Guardian admission;
- change release versions or publish a release;
- make arbitrary malformed commit metadata acceptable on `main`;
- treat the current PR #720 policy/test/doc edits as correct merely because a worker produced them.

## Design decision

### 1. The pull request title is the authoritative Conventional Commit subject for squash-only pull requests

For ordinary pull requests, `scripts/check-release-please-monorepo.mjs` will continue to require a scoped Conventional Commit PR title.

Examples:

```text
chore(repo): converge dependency automation with Mergify
chore(deps): refresh build dependencies
feat(kicad-studio): add viewer export
```

The PR title must use an allowed scope and remains a required CI gate.

Repository merge configuration will use `PR_TITLE` for the squash merge commit title. The protected default branch already accepts only squash merges, so the validated PR title becomes the durable commit subject written to `main`.

This gives Release Please and repository history one canonical subject without requiring intermediate branch history to be rewritten.

### 2. Intermediate PR commit subjects are not a blocking release-policy authority under the squash-only contract

For a `pull_request` event, the release-policy checker will no longer reject a PR solely because one or more intermediate branch commit subjects are unscoped or otherwise non-Conventional.

It will still:

- validate the PR title;
- validate repository release configuration;
- validate Renovate semantic scopes;
- retain file/product policy checks that do not require rewriting historical commit messages.

For non-PR/local/default-branch validation, commit subject validation remains available so malformed durable history is still detectable.

The implementation must make the distinction explicit in code and tests rather than silently disabling `validateCommitScopeCoverage` everywhere.

### 3. Squash-only integration is an enforced dependency of the PR-title policy

Relaxing intermediate PR commit-subject enforcement is safe only while the protected default branch is squash-only and the squash commit title comes from the PR title.

The repository policy therefore becomes a compound invariant:

```text
main allows squash only
AND squash merge commit title = PR_TITLE
AND required PR title = scoped Conventional Commit
```

If any part of that invariant changes, governance validation must fail rather than silently allowing unvalidated durable commit subjects.

### 4. Checked-in ruleset policy must match the live default-branch ruleset

`.github/rulesets/main.json` will be reconciled to the active `main-standard` policy relevant to repository-owned governance:

- pull requests required;
- zero mandatory approvals for the solo-maintainer model;
- conversation resolution required;
- only `squash` allowed;
- strict required checks retained;
- required linear history retained;
- branch deletion and non-fast-forward updates blocked;
- bypass semantics represented consistently with the repository's intended administrator/owner PR-only model.

Any rule that cannot be represented portably by the importable ruleset artifact must be documented explicitly rather than represented inaccurately.

The implementation must not weaken the live ruleset to make it resemble the stale checked-in file. The direction of reconciliation is live verified protection -> reviewed repository policy, followed by an explicit audited apply if a live change is actually needed.

### 5. Branch-protection validation expands from status-name parity to governance-contract parity

`scripts/check-branch-protection-gates.mjs` and its tests will validate the repository-owned static contract, including at minimum:

- exact required check contexts;
- strict required-check policy;
- allowed merge methods are squash-only;
- conversation resolution remains required;
- linear history remains required;
- deletion and non-fast-forward protections remain present.

The existing weekly governance-evidence workflow remains the live API comparison layer. Static CI validates the checked-in policy/documentation; governance evidence validates checked-in policy against GitHub.

### 6. Documentation describes the same merge and release model

`docs/architecture/branch-protection.md`, `docs/release.md`, and `docs/development/commit-conventions.md` will state:

- PR titles are the authoritative Conventional Commit subjects for ordinary squash-merged PRs;
- intermediate PR commit subjects should still be clear and well formed, but are not required to be rewritten merely to satisfy the release gate;
- `main` remains linear and squash-only;
- workers and automated remediation must leave working-tree changes only and must never amend/rebase existing PR history.

`AGENTS.md` already says agents must not commit or push. It should only be changed if a concise clarification is needed to connect that existing rule to PR metadata remediation; no new private control-plane terminology belongs there.

## PR #720 migration

PR #720 should be recovered without rewriting its existing three commits.

After the implementation of this design is merged to `main`:

1. update PR #720's title to a valid scoped title, expected:
   `chore(repo): converge dependency automation with Mergify`;
2. refresh the branch only through the repository's normal non-destructive branch-update mechanism if required by strict up-to-date policy;
3. re-run CI against the exact current PR head;
4. create a new exact-head remediation only for remaining repository-file failures, if any;
5. do not ask the worker to rewrite the three historical subjects;
6. do not force-push the branch;
7. merge only after required checks, review threads, admission, and queue policy are satisfied.

The policy/test/doc edits produced inside the failed ephemeral worker runs are evidence, not publishable state. They must be re-derived against current `main` and reviewed normally.

## Repository settings

The target repository setting is:

```text
squash_merge_commit_title = PR_TITLE
```

The protected `main` ruleset remains the authoritative merge-method restriction.

Whether repository-wide `allow_merge_commit` and `allow_rebase_merge` settings are disabled is a separate cleanup decision because `main-standard` already blocks those methods on the default branch. The implementation should prefer alignment if the settings can be changed without affecting a documented non-default-branch workflow, but #720 recovery does not depend on that cleanup.

## Failure behavior

The design is fail-closed.

- If live `main` stops being squash-only, governance evidence must fail.
- If squash title policy stops using the PR title, governance evidence must fail.
- If the PR title is unscoped, metadata CI must fail.
- If a worker rewrites local `HEAD`, trusted artifact capture must continue to fail.
- If checked-in ruleset/docs diverge, repository policy CI must fail.
- If required GitHub checks or security gates fail, no merge path is created by this design.

## Testing

Implementation requires focused tests before changing behavior.

### Release-policy tests

Add/adjust tests proving:

1. a scoped PR title passes even when intermediate PR commits are legacy scope-less commits;
2. an unscoped PR title fails;
3. Release Please generated PR exemptions remain unchanged;
4. non-PR/default-branch commit validation still rejects malformed durable commit subjects;
5. Renovate semantic-scope validation remains unchanged.

### Branch-protection tests

Extend `scripts/check-branch-protection-gates.test.mjs` to prove:

1. squash-only merge policy is required;
2. strict required checks are required;
3. conversation resolution is required;
4. linear history is required;
5. deletion/non-fast-forward protections are required;
6. any missing or broadened rule fails with an actionable error.

### Documentation checks

Run at minimum:

```bash
corepack pnpm run check:release-please
corepack pnpm run check:branch-protection
corepack pnpm run check:governance
corepack pnpm run docs:lint
corepack pnpm run docs:links
```

The relevant CI metadata lane must pass on the implementation PR. Existing required security and analysis checks remain mandatory.

## CI/CD, AGENTS.md, and documentation assessment

### CI/CD

The CI topology is appropriate: metadata policy runs in the dedicated `metadata` lane and feeds the always-on aggregate required check. No new workflow or required context is needed.

The required implementation change is in repository policy code/tests, not in CI job topology.

### AGENTS.md

The root agent contract is already structurally correct:

- one branch per issue;
- read repository policy/docs first;
- do not release without explicit scope;
- watch required checks;
- no credential handling.

The durable fleet worker contract separately prohibits commit/rebase/push behavior. KiCad's `AGENTS.md` may receive one narrow sentence making history rewrite during PR remediation explicitly out of scope, but it should not duplicate private fleet architecture.

### Documentation

The current branch-protection document is stale relative to the live ruleset. It also states Mergify is not a merge authority, while PR #720 is explicitly migrating dependency convergence toward a Renovate-producer/Mergify-merge-authority model. Implementation must reconcile those current repository facts rather than copy failed worker output blindly.

## Pre-existing CI baseline drift

The design review exposed an independent current-main inconsistency that must not be hidden or bypassed during implementation: `.github/workflows/ci.yml` pins `codecov/codecov-action` to the v7.1.1 commit, while `scripts/check-codecov-policy.mjs` and its tests still require the older v7.0.0 commit. The repository pre-push hook therefore fails on current `main` before evaluating this design branch.

This is not evidence against the history-safe metadata design. It is a separate baseline policy drift and should be repaired as a narrow prerequisite change, with the policy/test expectation updated to the already-reviewed workflow pin and verified by `check:codecov`. The local pre-push hook must not be bypassed.

A second current-main baseline drift was exposed by the same full pre-push run: security PR #719 raised the supported pnpm floor to `>=11.11.0 <12` and added the reviewed `pnpm@11.11.0` / `source-map-js@1.2.2` minimum-release-age exceptions, while `check-pnpm-supply-chain.mjs` still expected the older pnpm floor and exception list. That checker/test contract is likewise a narrow prerequisite repair; it does not alter the history-safe metadata design.

## Rollout sequence

1. Implement tests that express the squash-title contract and ruleset parity.
2. Update release-policy logic.
3. Reconcile checked-in branch-protection policy and docs with verified live ruleset.
4. Update GitHub repository squash-title setting to `PR_TITLE`.
5. Run repository policy/docs validation locally.
6. Open a normal PR and wait for all required checks.
7. Merge through the normal squash-only path; do not use bypass.
8. Re-read live ruleset and repository merge settings after merge.
9. Update PR #720 title to the scoped form.
10. Re-run #720 current-head CI and Guardian/admission checks.
11. Only then decide whether a new exact-head file remediation is still required.

## Acceptance criteria

The design is implemented when all of the following are true:

- an existing PR with legacy intermediate commit subjects can pass metadata policy using a valid scoped PR title without history rewriting;
- malformed PR titles remain blocking;
- durable `main` history receives the validated PR title as the squash commit title;
- checked-in branch-protection policy matches the verified live default-branch contract;
- static policy tests detect merge-method/linear-history/conversation-resolution drift;
- required CI/security/review gates remain unchanged or stronger;
- fleet trusted publication remains exact-head and non-force;
- PR #720 can proceed without amend/rebase/force-push solely to repair historical commit subjects.
