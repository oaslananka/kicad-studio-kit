# Review Evidence Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vendor-neutral, regression-tested pull-request review evidence policy that requires compensating evidence when automated reviewers are unavailable on medium/high-risk changes.

**Architecture:** A pure Node library classifies automated-review artifacts and validates structured evidence. A repository validator checks public policy/template/CI wiring and dry-runs sanitized fixtures. The policy is static and deterministic; it does not make third-party availability a required status check.

**Tech Stack:** Node.js ESM, built-in `node:test`, JSON fixtures, Markdown policy, GitHub Actions YAML.

## Global Constraints

- Do not introduce an independent approval requirement for the solo-maintainer workflow.
- Unavailable/quota/capacity messages must never satisfy completed review.
- Medium/high-risk unavailable outcomes require referenced compensating evidence.
- All bot and agent artifacts require explicit final triage.
- Public policy must remain vendor-neutral.

---

### Task 1: Classification and evidence validation

**Files:**

- Create: `scripts/lib/review-evidence.mjs`
- Create: `scripts/check-review-evidence.test.mjs`
- Create: `scripts/fixtures/review-evidence/*.json`

**Interfaces:**

- Produces: `classifyReviewArtifacts(input)`, `validateReviewEvidence(input)`, and exported policy enums.

- [ ] Write failing tests for all five outcomes and invalid fallback/triage cases.
- [ ] Run `node --test scripts/check-review-evidence.test.mjs` and confirm failure because the library is missing.
- [ ] Implement the minimal pure classifier and validator.
- [ ] Re-run the focused tests and confirm all pass.

### Task 2: Repository policy gate

**Files:**

- Create: `scripts/check-review-evidence.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: classification and validation functions from Task 1.
- Produces: `check:review-evidence` root command and `--all-fixtures` dry-run.

- [ ] Extend the focused tests with missing template/docs/script/CI surface fixtures.
- [ ] Confirm the new tests fail against current repository surfaces.
- [ ] Implement the repository validator, package script, root composition, and metadata-job wiring.
- [ ] Run the focused tests and `corepack pnpm run check:review-evidence`.

### Task 3: Public evidence contract

**Files:**

- Modify: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `docs/architecture/review-evidence-policy.md`
- Modify: `GOVERNANCE.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/architecture/index.md`
- Modify: `docs/architecture/definition-of-done.md`
- Modify: `docs/testing-strategy.md`

**Interfaces:**

- Produces: the public outcome/risk/triage/fallback contract checked by Task 2.

- [ ] Add a concise Review Evidence template section with exactly-one outcome and risk instructions.
- [ ] Document triage categories, compensating paths, and the solo-maintainer exception.
- [ ] Link the policy from governance, contribution, architecture, definition-of-done, and testing surfaces.
- [ ] Run the policy and documentation gates.

### Task 4: Full verification and delivery

**Files:**

- Review all changed files.

- [ ] Run `git diff --check` and `actionlint`.
- [ ] Run `bash scripts/run-validation-host.sh corepack pnpm run check`.
- [ ] Create one verified signed commit, open a public PR closing #530, inspect every bot/agent comment, and resolve actionable findings.
- [ ] Record compensating manual review if no automated agent review completes.
- [ ] Squash-merge only after terminal green checks and synchronize the canonical workspace.
