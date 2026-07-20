# Live Governance Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile checked-in maturity/security evidence with the active GitHub ruleset and add a scheduled, least-privilege live evidence report.

**Architecture:** Pure normalization/comparison lives in `scripts/lib/github-governance-evidence.mjs`; a separate CLI owns authenticated REST calls and report files. Pull-request checks remain deterministic while scheduled/manual workflow runs collect live evidence.

**Tech Stack:** Node.js 24 ESM, Node test runner, GitHub REST API, GitHub Actions.

## Global Constraints

- Do not weaken branch protection.
- Do not expose alert payloads, tokens, or private security data in artifacts.
- API failures must become `unavailable`, not guessed state.
- Live ruleset drift must fail the scheduled/manual workflow.
- Keep work limited to issue #495.

---

### Task 1: Align checked-in ruleset with live enforcement

**Files:**

- Modify: `.github/rulesets/main.json`
- Modify: `docs/architecture/branch-protection.md`
- Modify: `scripts/check-branch-protection-gates.test.mjs`

- [x] Add a failing assertion that `dependency-review` is required.
- [x] Run the branch-protection tests and verify the assertion fails against the current checked-in ruleset.
- [x] Add `dependency-review` to the checked-in ruleset and policy document.
- [x] Run `corepack pnpm run check:branch-protection` and verify it passes.
- [x] Commit the ruleset alignment.

### Task 2: Pure live-evidence model

**Files:**

- Create: `scripts/lib/github-governance-evidence.mjs`
- Modify: `scripts/check-branch-protection-gates.test.mjs`

- [x] Add failing tests for exact ruleset match, required-check drift, unavailable security endpoints, and confirmed settings.
- [x] Run the focused test file and verify failure because the module does not exist.
- [x] Implement minimal normalization, comparison, report, and Markdown functions.
- [x] Re-run the focused tests and verify they pass.
- [x] Commit the pure evidence model.

### Task 3: Authenticated CLI and workflow

**Files:**

- Create: `scripts/check-github-governance-evidence.mjs`
- Create: `.github/workflows/governance-evidence.yml`
- Modify: `scripts/check-branch-protection-gates.mjs`
- Modify: `scripts/check-branch-protection-gates.test.mjs`
- Modify: `.repo-health.yaml`
- Modify: `scripts/check-repo-governance.mjs`

- [x] Add failing workflow contract assertions for schedule/manual triggers, least privilege, SHA-pinned actions, and report command.
- [x] Run the focused tests and verify the workflow assertions fail before files exist.
- [x] Implement the REST client with graceful `unavailable` results and the scheduled/manual workflow.
- [x] Add the workflow to repository-health governance evidence.
- [x] Run branch-protection, repository-governance, actionlint, and live dry-run checks.
- [x] Commit the workflow and CLI.

### Task 4: Refresh point-in-time maturity and OpenSSF evidence

**Files:**

- Modify: `docs/repo-maturity-report.md`
- Modify: `docs/security/github-security-settings.md`
- Modify: `docs/openssf-evidence.md`
- Modify: `docs/openssf-proposal-links.md`
- Modify: `docs/best-practices-evidence.md`

- [x] Replace stale branch-protection and human-review claims with the 2026-07-20 active-ruleset evidence.
- [x] Record security settings as confirmed, unconfirmed, or unavailable with endpoint provenance.
- [x] Record dismissal of stale alerts #34–#36 referencing the removed MCP-server lockfile.
- [x] Refresh OpenSSF branch-protection/review evidence links and remove obsolete activation recommendations.
- [x] Run generated-doc, Markdown, link, VitePress, and best-practices evidence checks.
- [x] Commit the documentation evidence.

### Task 5: Full verification and PR

- [x] Run live evidence collection and verify the active ruleset exactly matches the checked-in ruleset.
- [x] Run branch protection, governance, security, docs, workflow, supply-chain, and broad root checks.
- [x] Record only pre-existing VPS environment blockers under #490.
- [x] Verify clean worktree, DCO sign-offs, branch divergence, and no active-PR file overlap.
- [ ] Push, open a draft PR closing #495, monitor all CI and bot/agent reviews, fix actionable findings, and mark ready only after terminal green checks.

## Verification evidence

- Live evidence: active `main-protection` ruleset exactly matches the checked-in policy; private vulnerability reporting, GitHub-native dependency security updates, secret scanning, push protection, and security endpoints were observed without alert payloads.
- Policy: six required checks are synchronized across the active ruleset, `.github/rulesets/main.json`, branch-protection documentation, and Best Practices evidence.
- Tests: 10 branch/governance evidence tests pass, including drift, unavailable-state, least-privilege workflow, and sanitized-report cases.
- Workflow: `/tmp/actionlint-1.7.12/actionlint .github/workflows/governance-evidence.yml` passes.
- Documentation: generated-doc, Markdown, internal-link, and VitePress build checks pass.
- Packaging: repeatable VSIX validation passes with 101 entries and normalized SHA-256 `1e2cd4590c1ab58e3c6d6ac2078625c55c380b3ff94cc0f3cd0fe36e703b892d`.
- Broad root check reaches only the pre-existing #490 strict dev-doctor blockers: Python 3.12 instead of >=3.13, missing `uv`, unconfigured actionlint shim, missing Xvfb, and missing KiCad CLI.
- GitHub cleanup: orphan branch `automation/auto-assign-incoming` was deleted after PR #479 was confirmed stale; dependency alerts #34-#36 for the removed MCP-server manifest were dismissed as `not_used`, leaving no open alerts.
