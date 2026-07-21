# Codecov Coverage and Test Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-required Codecov LCOV coverage and JUnit failed-test analytics for the VS Code extension.

**Architecture:** Reuse canonical Ubuntu Jest reports from the existing matrix and upload them from one same-repository-only Codecov job. Keep Jest thresholds and the aggregate `required` check unchanged; defer Bundle Analysis to #514 until a default-branch baseline exists.

**Tech Stack:** GitHub Actions, pnpm 11, Node 24, Jest 30, jest-junit 17, Codecov Action v7.0.0, Codecov CLI v11.3.1, YAML.

## Global Constraints

- Codecov statuses remain informational during initial baseline establishment.
- Codecov is not added to `.github/rulesets/main.json` or aggregate `required` dependencies.
- Fork pull requests receive no Codecov secret.
- Coverage source: `apps/vscode-extension/coverage/lcov.info`.
- Test-results source: `apps/vscode-extension/test-results/junit.xml`.
- Both uploads use immutable Codecov Action commit `fb8b3582c8e4def4969c97caa2f19720cb33a72f`.
- Codecov CLI version: `v11.3.1`.
- Bundle Analysis remains absent until #514 proves a live default-branch-backed upload.

---

### Task 1: Repository policy contract

**Files:**

- Create: `scripts/check-codecov-policy.mjs`
- Create: `scripts/check-codecov-policy.test.mjs`
- Modify: `package.json`

- [ ] Write tests for exact action/CLI pins, report paths, fork guards, informational YAML, root script composition, and Bundle Analysis deferral.
- [ ] Run the focused test and confirm it fails before configuration exists.
- [ ] Implement `validateCodecovPolicy(repoRoot?: string): string[]` and `check:codecov`.
- [ ] Run `corepack pnpm run check:codecov`; expect all tests to pass.

### Task 2: Deterministic Jest reports

**Files:**

- Modify: `apps/vscode-extension/jest.config.js`
- Modify: `apps/vscode-extension/package.json`
- Modify: `apps/vscode-extension/.gitignore`
- Modify: `pnpm-lock.yaml`

- [ ] Pin `jest-junit` 17.0.0.
- [ ] Configure the reporter only in CI with deterministic output and suite-load error reporting.
- [ ] Run `CI=true corepack pnpm --filter kicadstudiokit run test:unit:coverage`.
- [ ] Verify LCOV, summary JSON, and JUnit XML are non-empty.

### Task 3: Coverage and Test Analytics workflow

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] Retain Ubuntu reports with `!cancelled()` semantics.
- [ ] Add a same-repository-only non-required `codecov` job.
- [ ] Upload LCOV through the pinned Codecov Action.
- [ ] Invoke the same pinned action with `report_type: test_results` for JUnit XML.
- [ ] Confirm the deprecated Test Results Action is absent.
- [ ] Run workflow lint and repository policy tests.

### Task 4: Repository YAML and documentation

**Files:**

- Create: `codecov.yml`
- Modify: `docs/testing-strategy.md`
- Modify: `README.md`

- [ ] Add informational project and patch statuses with `auto` targets and 1% thresholds.
- [ ] Add the extension-unit flag and ignored generated/test paths.
- [ ] Document report ownership, fork/failure semantics, and #514 deferral.
- [ ] Add the public coverage badge.
- [ ] Validate with `curl --fail-with-body --data-binary @codecov.yml https://codecov.io/validate`.

### Task 5: Final verification and pull request

- [ ] Run frozen install, `check:codecov`, formatting, lint, typecheck, Jest coverage, package validation, release/version checks, docs checks, and audit.
- [ ] Open a PR closing #511.
- [ ] Confirm live LCOV and JUnit uploads in GitHub Actions logs.
- [ ] Inspect all bot and agent comments and fix valid findings.
- [ ] Merge only with all required checks green and no blocking thread.
