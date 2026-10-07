---
search: false
---

# History-Safe Pull Request Metadata Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make KiCad Studio Kit's squash-only PR metadata policy repairable without rewriting branch history while preserving exact-head/non-force publication and all required governance gates.

**Architecture:** First repair the independent current-main Codecov policy drift so repository hooks are trustworthy again. Then make scoped PR titles the authoritative squash-commit metadata, expand static branch-protection validation to the live squash-only contract, reconcile checked-in governance/docs, and finally apply the repository squash-title setting before recovering PR #720.

**Tech Stack:** Node.js ESM policy scripts/tests, GitHub Actions/rulesets, Markdown governance docs, GitHub repository settings.

**Spec:** `docs/architecture/history-safe-pr-metadata-policy-design.md`

## Global Constraints

- Do not add force-push, amend, or rebase capability to ephemeral workers or the trusted publisher.
- Keep required CI/security/dependency-review/review-thread/strict-up-to-date/linear-history gates unchanged or stronger.
- Do not bypass the repository pre-push hook, GitHub rulesets, Guardian admission, or remote required checks.
- `main-standard` remains squash-only; durable squash commit title must be `PR_TITLE`.
- PR #720 must not be rearmed until the architectural change is merged and its exact current head is re-evaluated.
- Reconcile checked-in policy to verified live protection; never weaken live protection to match a stale file.

## Review Focus

- A legacy PR with malformed intermediate commit subjects but a valid scoped PR title must pass PR metadata policy without history rewrite.
- A malformed/unscoped PR title must still fail even when branch commits are valid.
- Non-PR/default-branch validation must still reject malformed durable commit subjects.
- Any broadening from squash-only merge methods or removal of linear-history/conversation-resolution/strict-check policy must fail static governance validation.
- Release Please PR exemptions and Renovate semantic-scope validation must remain unchanged.

---

### Task 1: Repair the current-main Codecov policy baseline

**Files:**
- Modify: `scripts/check-codecov-policy.mjs`
- Modify: `scripts/check-codecov-policy.test.mjs`

**Interfaces:**
- Consumes: current `.github/workflows/ci.yml` pin for `codecov/codecov-action` v7.1.1.
- Produces: `check:codecov` policy expectation aligned with the workflow pin so normal pre-push verification can run.

- [ ] **Step 1: Update the policy test fixture first to require the current v7.1.1 action commit and reject drift back to a dummy/old pin.**
- [ ] **Step 2: Run `corepack pnpm exec node --test scripts/check-codecov-policy.test.mjs` and verify RED because production policy still requires v7.0.0.**
- [ ] **Step 3: Change only the Codecov action constant/error text in `scripts/check-codecov-policy.mjs` to the v7.1.1 commit already used by `ci.yml`.**
- [ ] **Step 4: Run `corepack pnpm run check:codecov` and the focused test; verify GREEN.**
- [ ] **Step 5: Run the repository pre-push validation command/hook on the resulting tree and record any additional baseline failures by name.**
- [ ] **Step 6: Commit as `fix(repo): align Codecov policy with workflow pin`.**

### Task 2: Make PR-title metadata authoritative for squash-only PR validation

**Files:**
- Modify: `scripts/check-release-please-monorepo.mjs`
- Modify: `scripts/check-release-please-monorepo.test.mjs`
- Modify: `docs/development/commit-conventions.md`
- Modify: `docs/release.md`
- Optional narrow clarification: `AGENTS.md`

**Interfaces:**
- Consumes: `validatePrTitle(title, { headRefName })`, `validateCommitScopeCoverage(commits, options)`.
- Produces: explicit event-aware PR validation path where PR title is blocking authority and intermediate PR commit subjects do not require history rewrite; local/default-branch commit validation remains strict.

- [ ] **Step 1: Add a failing test proving a valid scoped PR title with legacy scope-less intermediate commits passes the PR-event policy path.**
- [ ] **Step 2: Add/retain failing assertions proving an unscoped PR title fails and local/default-branch malformed commit subjects still fail.**
- [ ] **Step 3: Run the focused release-policy tests and verify the new legacy-commit PR case fails for the current reason.**
- [ ] **Step 4: Implement the smallest explicit PR-event distinction in `check-release-please-monorepo.mjs`; do not globally disable `validateCommitScopeCoverage`.**
- [ ] **Step 5: Run `corepack pnpm run check:release-please` and `corepack pnpm run test:release-please`; verify GREEN.**
- [ ] **Step 6: Update commit/release docs and, only if necessary, one concise `AGENTS.md` sentence: PR remediation must not rewrite existing history solely to repair metadata.**
- [ ] **Step 7: Run docs lint/links and commit as `fix(repo): make squash PR titles authoritative`.**

### Task 3: Reconcile checked-in branch policy with live squash-only protection

**Files:**
- Modify: `.github/rulesets/main.json`
- Modify: `scripts/check-branch-protection-gates.mjs`
- Modify: `scripts/check-branch-protection-gates.test.mjs`
- Modify: `docs/architecture/branch-protection.md`

**Interfaces:**
- Consumes: verified live `main-standard` ruleset ID `19858802` and its repository-owned invariant fields.
- Produces: static validator functions for required checks plus merge method, strictness, conversation resolution, linear history, deletion and non-fast-forward protection.

- [ ] **Step 1: Extend tests first with fixtures that fail when squash-only is broadened, strict required checks are disabled, conversation resolution is removed, linear history is removed, or deletion/non-fast-forward rules disappear.**
- [ ] **Step 2: Run `node --test scripts/check-branch-protection-gates.test.mjs` and verify the new tests RED against the current checker.**
- [ ] **Step 3: Reconcile `.github/rulesets/main.json` to the verified live policy without weakening the live ruleset.**
- [ ] **Step 4: Implement the minimal static contract parser/diff needed for the new tests.**
- [ ] **Step 5: Update `docs/architecture/branch-protection.md` to describe live `main-standard`, squash-only/linear-history semantics, and the expanded drift checker.**
- [ ] **Step 6: Run `corepack pnpm run check:branch-protection`, focused tests, governance check, docs lint and docs links; verify GREEN.**
- [ ] **Step 7: Commit as `fix(repo): align branch policy with live ruleset`.**

### Task 4: Integrate the design/spec and verify the implementation branch

**Files:**
- Include: `docs/architecture/history-safe-pr-metadata-policy-design.md`
- Include: `docs/architecture/history-safe-pr-metadata-policy-implementation-plan.md`
- All files changed in Tasks 1-3.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: reviewable implementation branch with repository-native design evidence and full validation.

- [ ] **Step 1: Rebase/cherry-pick the design commit onto the implementation branch without bypassing hooks.**
- [ ] **Step 2: Run `git diff --check`.**
- [ ] **Step 3: Run the repository's full pre-push/root verification suite; report every failure by name and fix only in-scope regressions/baseline drifts required for a green repository contract.**
- [ ] **Step 4: Run docs lint/links and focused policy suites again as fresh completion evidence.**
- [ ] **Step 5: Push normally and create a PR against `main`; do not use `--no-verify`.**
- [ ] **Step 6: Wait for required remote checks and review the complete branch diff before merge.**

### Task 5: Apply the repository squash-title setting and verify live governance

**Files:**
- No repository file unless live evidence requires a documentation correction.

**Interfaces:**
- Consumes: merged implementation and repository admin API.
- Produces: `squash_merge_commit_title=PR_TITLE` live setting; verified live ruleset remains squash-only and required gates intact.

- [ ] **Step 1: Change only the repository squash merge commit title setting to `PR_TITLE`.**
- [ ] **Step 2: Re-read repository settings and ruleset ID `19858802`; verify `PR_TITLE`, squash-only, linear history, strict checks and conversation resolution.**
- [ ] **Step 3: Run/inspect governance-evidence if the repository provides an on-demand path; do not treat API unavailability as confirmation.**

### Task 6: Recover PR #720 without rewriting history

**Files:**
- PR metadata only initially; repository-file changes only if fresh exact-head evidence still requires them.

**Interfaces:**
- Consumes: merged Tasks 1-5; PR #720 exact live head.
- Produces: scoped PR title and a fresh current-head CI/admission classification without amend/rebase/force-push.

- [ ] **Step 1: Re-read PR #720 state/head and confirm no active ENG-1076 run.**
- [ ] **Step 2: Update title to `chore(repo): converge dependency automation with Mergify`.**
- [ ] **Step 3: Re-run/re-read exact-head required checks and Guardian admission.**
- [ ] **Step 4: If only repository-file failures remain, create one new exact-head remediation with narrow `touches`; otherwise do not dispatch.**
- [ ] **Step 5: Merge only if required checks, review threads, ruleset/admission and normal queue policy authorize it; never bypass.**
