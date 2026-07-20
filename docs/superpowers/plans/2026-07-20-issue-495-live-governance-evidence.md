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

- [ ] Add a failing assertion that `dependency-review` is required.
- [ ] Run the branch-protection tests and verify the assertion fails against the current checked-in ruleset.
- [ ] Add `dependency-review` to the checked-in ruleset and policy document.
- [ ] Run `corepack pnpm run check:branch-protection` and verify it passes.
- [ ] Commit the ruleset alignment.

### Task 2: Pure live-evidence model

**Files:**

- Create: `scripts/lib/github-governance-evidence.mjs`
- Modify: `scripts/check-branch-protection-gates.test.mjs`

- [ ] Add failing tests for exact ruleset match, required-check drift, unavailable security endpoints, and confirmed settings.
- [ ] Run the focused test file and verify failure because the module does not exist.
- [ ] Implement minimal normalization, comparison, report, and Markdown functions.
- [ ] Re-run the focused tests and verify they pass.
- [ ] Commit the pure evidence model.

### Task 3: Authenticated CLI and workflow

**Files:**

- Create: `scripts/check-github-governance-evidence.mjs`
- Create: `.github/workflows/governance-evidence.yml`
- Modify: `scripts/check-branch-protection-gates.mjs`
- Modify: `scripts/check-branch-protection-gates.test.mjs`
- Modify: `.repo-health.yaml`
- Modify: `scripts/check-repo-governance.mjs`

- [ ] Add failing workflow contract assertions for schedule/manual triggers, least privilege, SHA-pinned actions, and report command.
- [ ] Run the focused tests and verify the workflow assertions fail before files exist.
- [ ] Implement the REST client with graceful `unavailable` results and the scheduled/manual workflow.
- [ ] Add the workflow to repository-health governance evidence.
- [ ] Run branch-protection, repository-governance, actionlint, and live dry-run checks.
- [ ] Commit the workflow and CLI.

### Task 4: Refresh point-in-time maturity and OpenSSF evidence

**Files:**

- Modify: `docs/repo-maturity-report.md`
- Modify: `docs/security/github-security-settings.md`
- Modify: `docs/openssf-evidence.md`
- Modify: `docs/openssf-proposal-links.md`
- Modify: `docs/best-practices-evidence.md`

- [ ] Replace stale branch-protection and human-review claims with the 2026-07-20 active-ruleset evidence.
- [ ] Record security settings as confirmed, unconfirmed, or unavailable with endpoint provenance.
- [ ] Record dismissal of stale alerts #34–#36 referencing the removed MCP-server lockfile.
- [ ] Refresh OpenSSF branch-protection/review evidence links and remove obsolete activation recommendations.
- [ ] Run generated-doc, Markdown, link, VitePress, and best-practices evidence checks.
- [ ] Commit the documentation evidence.

### Task 5: Full verification and PR

- [ ] Run live evidence collection and verify the active ruleset exactly matches the checked-in ruleset.
- [ ] Run branch protection, governance, security, docs, workflow, supply-chain, and broad root checks.
- [ ] Record only pre-existing VPS environment blockers under #490.
- [ ] Verify clean worktree, DCO sign-offs, branch divergence, and no active-PR file overlap.
- [ ] Push, open a draft PR closing #495, monitor all CI and bot/agent reviews, fix actionable findings, and mark ready only after terminal green checks.
