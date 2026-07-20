# Runtime Policy Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Enforce local runtime policy deterministically and add scheduled upstream freshness evidence for VS Code, Python, and KiCad.

**Architecture:** Pure policy parsing/evaluation lives in `scripts/lib/runtime-policy.mjs`. The existing compatibility gate consumes metadata validation; a separate CLI and workflow own network freshness checks and evidence output.

**Tech Stack:** Node.js 24 ESM, `yaml`, Node test runner, GitHub Actions.

## Global Constraints

- Pull-request validation must not require network access.
- Source failure must report `unknown`, never silently `current`.
- Upstream drift is blocking only when `runtimePolicy.enforcement` explicitly says `error`.
- The checker must not mutate compatibility metadata.
- Keep work limited to issue #494.

---

### Task 1: Pure metadata and release-source policy

**Files:**

- Create: `scripts/lib/runtime-policy.mjs`
- Create: `scripts/check-runtime-policy.test.mjs`
- Modify: `compatibility.yaml`

**Interfaces:**

- Produces: `validateRuntimePolicyMetadata`, source parsers, `evaluateRuntimePolicy`, and `renderRuntimePolicyMarkdown`.

- [x] Write failing tests for valid metadata, malformed metadata, VS Code lag, Python window, KiCad major/patch drift, malformed source data, and `unknown` source state.
- [x] Run `node --test scripts/check-runtime-policy.test.mjs` and verify failure because the module does not exist.
- [x] Implement the minimal pure policy functions and explicit `runtimePolicy.enforcement` metadata.
- [x] Run the focused tests and verify they pass.
- [x] Commit the pure policy layer.

### Task 2: Repository CLI and deterministic compatibility integration

**Files:**

- Create: `scripts/check-runtime-policy.mjs`
- Modify: `scripts/check-compatibility-contract.mjs`
- Modify: `scripts/check-compatibility-contract.test.mjs`

**Interfaces:**

- Consumes: `validateRuntimePolicyMetadata`, source parsers, evaluator, renderer.
- Produces: `node scripts/check-runtime-policy.mjs [--fetch] [--json path] [--summary path]`.

- [x] Add failing tests proving `validateCompatibilityContract` rejects malformed runtime policy and accepts the repository policy.
- [x] Run the compatibility tests and verify the new malformed-policy case fails.
- [x] Implement the CLI and integrate deterministic metadata validation into `check:compatibility-contract`.
- [x] Run focused runtime-policy and compatibility tests.
- [x] Commit the integration.

### Task 3: Scheduled evidence workflow and documentation

**Files:**

- Create: `.github/workflows/runtime-policy-drift.yml`
- Create: `docs/compatibility/runtime-policy.md`
- Verify: `scripts/check-ci-lanes.mjs` and `scripts/check-ci-lanes.test.mjs` already route workflow/script changes through full CI
- Modify: `scripts/check-compatibility-contract.mjs`

**Interfaces:**

- Workflow executes `node scripts/check-runtime-policy.mjs --fetch --json runtime-policy-report.json --summary "$GITHUB_STEP_SUMMARY"`.

- [x] Add failing CI-lane/workflow contract tests for the new script and workflow.
- [x] Run the focused tests and verify failure before workflow/documentation wiring exists.
- [x] Add the SHA-pinned scheduled/manual workflow, documentation, and required-file contract; verify existing generic workflow/script classification already triggers full CI without a classifier change.
- [x] Run policy, compatibility, CI-lane, docs-generated, Markdown, link, and action lint checks.
- [x] Commit the workflow and docs.

### Task 4: Full verification and PR

**Files:**

- Update plan checkboxes with actual evidence.

- [x] Run `check:compatibility-contract`, focused tests, docs checks, workflow lint, supply-chain checks, and `git diff --check`.
- [x] Run the broad root gate; record only pre-existing VPS environment blockers under issue #490.
- [ ] Verify DCO sign-offs, clean worktree, branch divergence, and no overlap with active PR files where avoidable.
- [ ] Push the branch, open a draft PR closing #494, apply labels/milestone, and monitor all bot/agent reviews and CI checks.
- [ ] Fix every actionable review or CI finding, then mark the PR ready only after terminal green checks.

## Verification Evidence

- Red tests were observed for the missing runtime-policy module, missing compatibility integration, missing workflow/docs, mixed VS Code feed entries, invalid calendar dates, and major-line JSON handling.
- Focused result: 16 runtime-policy/compatibility/workflow tests pass.
- Live evidence on 2026-07-20: VS Code `1.129.1` reports a 28-minor drift from `1.101.0`; Python `3.13`/`3.14` is current; KiCad primary major is current while verified `10.0.3` is behind stable `10.0.4`. All are `report`, so the evidence command exits successfully without changing support claims.
- Workflow lint: actionlint `1.7.12` passes for `.github/workflows/runtime-policy-drift.yml`.
- Repository gates passed through repeatable VSIX packaging (101 entries; normalized SHA-256 `1e2cd4590c1ab58e3c6d6ac2078625c55c380b3ff94cc0f3cd0fe36e703b892d`).
- Broad root gate reaches the pre-existing issue #490 environment boundary: Python `3.12.3` instead of `>=3.13` and missing `uv`; actionlint/Xvfb/KiCad CLI remain warned host tools. No issue #494 policy, test, documentation, workflow, package, or reproducibility failure occurred before that boundary.
- Branch was `0` commits behind and `4` commits ahead of `origin/main` before the evidence-only plan update.
