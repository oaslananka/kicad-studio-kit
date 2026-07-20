# Runtime Policy Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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

- [ ] Write failing tests for valid metadata, malformed metadata, VS Code lag, Python window, KiCad major/patch drift, malformed source data, and `unknown` source state.
- [ ] Run `node --test scripts/check-runtime-policy.test.mjs` and verify failure because the module does not exist.
- [ ] Implement the minimal pure policy functions and explicit `runtimePolicy.enforcement` metadata.
- [ ] Run the focused tests and verify they pass.
- [ ] Commit the pure policy layer.

### Task 2: Repository CLI and deterministic compatibility integration

**Files:**

- Create: `scripts/check-runtime-policy.mjs`
- Modify: `scripts/check-compatibility-contract.mjs`
- Modify: `scripts/check-compatibility-contract.test.mjs`

**Interfaces:**

- Consumes: `validateRuntimePolicyMetadata`, source parsers, evaluator, renderer.
- Produces: `node scripts/check-runtime-policy.mjs [--fetch] [--json path] [--summary path]`.

- [ ] Add failing tests proving `validateCompatibilityContract` rejects malformed runtime policy and accepts the repository policy.
- [ ] Run the compatibility tests and verify the new malformed-policy case fails.
- [ ] Implement the CLI and integrate deterministic metadata validation into `check:compatibility-contract`.
- [ ] Run focused runtime-policy and compatibility tests.
- [ ] Commit the integration.

### Task 3: Scheduled evidence workflow and documentation

**Files:**

- Create: `.github/workflows/runtime-policy-drift.yml`
- Create: `docs/compatibility/runtime-policy.md`
- Modify: `scripts/check-ci-lanes.mjs`
- Modify: `scripts/check-ci-lanes.test.mjs`
- Modify: `scripts/check-compatibility-contract.mjs`

**Interfaces:**

- Workflow executes `node scripts/check-runtime-policy.mjs --fetch --json runtime-policy-report.json --summary "$GITHUB_STEP_SUMMARY"`.

- [ ] Add failing CI-lane/workflow contract tests for the new script and workflow.
- [ ] Run the focused tests and verify failure before workflow/documentation wiring exists.
- [ ] Add the SHA-pinned scheduled/manual workflow, documentation, required-file contract, and CI-lane triggers.
- [ ] Run policy, compatibility, CI-lane, docs-generated, Markdown, link, and action lint checks.
- [ ] Commit the workflow and docs.

### Task 4: Full verification and PR

**Files:**

- Update plan checkboxes with actual evidence.

- [ ] Run `check:compatibility-contract`, focused tests, docs checks, workflow lint, supply-chain checks, and `git diff --check`.
- [ ] Run the broad root gate; record only pre-existing VPS environment blockers under issue #490.
- [ ] Verify DCO sign-offs, clean worktree, branch divergence, and no overlap with active PR files where avoidable.
- [ ] Push the branch, open a draft PR closing #494, apply labels/milestone, and monitor all bot/agent reviews and CI checks.
- [ ] Fix every actionable review or CI finding, then mark the PR ready only after terminal green checks.
