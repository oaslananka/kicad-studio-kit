# Issue 489 VS Code Typings Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Correct the stale Renovate cap and add a deterministic drift gate for VS Code engine, compatibility, typings, and automation metadata.

**Architecture:** A root Node checker reads `apps/vscode-extension/package.json`, `compatibility.yaml`, and `renovate.json`, validates one explicit minimum-version contract, and is invoked by the root `check` chain.

**Tech Stack:** Node.js 24 ESM scripts, Node test runner, YAML 2, pnpm 11.

## Global constraints

- Work only on GitHub issue `#489`.
- Do not raise the VS Code engine or change dependency versions.
- Do not change Renovate schedules, grouping, or approval behavior.
- Keep validation deterministic and offline.

### Task 1: Capture policy drift in tests

**Files:**

- Create: `scripts/check-vscode-typings-policy.test.mjs`

- [x] Add fixture helpers for package, compatibility, and Renovate metadata.
- [x] Assert a fully aligned fixture passes.
- [x] Assert stale Renovate cap, compatibility drift, and typings drift fail with actionable messages.
- [x] Assert root package script wiring exists.
- [x] Run `node --test scripts/check-vscode-typings-policy.test.mjs` and verify RED because the checker/wiring do not exist.

### Task 2: Implement the validator

**Files:**

- Create: `scripts/check-vscode-typings-policy.mjs`

- [x] Export `validateVscodeTypingsPolicy({ compatibility, extensionPackage, renovateConfig })`.
- [x] Parse explicit caret engine and exact/capped semantic versions.
- [x] Validate the package and compatibility surfaces.
- [x] Locate exactly one dedicated Renovate cap rule and validate `<=<minimum>`.
- [x] Add a CLI that reads repository files, reports all errors, and exits non-zero on drift.
- [x] Run tests and verify that only current repository wiring/stale cap assertions remain RED.

### Task 3: Correct policy and document ownership

**Files:**

- Modify: `renovate.json`
- Modify: `docs/dependency-lifecycle.md`
- Modify: `package.json`

- [x] Change the dedicated `@types/vscode` cap from `<=1.99.0` to `<=1.101.0`.
- [x] Document minimum-engine ownership and coordinated update steps.
- [x] Add `check:vscode-typings-policy` and insert it after `check:compatibility-contract` in root `check`.
- [x] Run the checker suite and verify GREEN.

### Task 4: Verify and deliver

**Files:** No additional files.

- [x] Run Prettier on changed repository files.
- [x] Run the policy checker, compatibility contract, docs lint, and `git diff --check`.
- [ ] Run the full root check in CI-capable environment; document VPS-2-only blockers under #490.
- [ ] Commit with DCO sign-off, push, open a PR that closes #489, and watch required checks to terminal state.
