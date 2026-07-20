# Brace Expansion Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch the active `brace-expansion` and `js-yaml` advisory ranges and prevent regression.

**Architecture:** Exact pnpm overrides at the root package redirect only the two vulnerable transitive versions. The existing supply-chain checker enforces the override map and CI audit verifies the resolved graph.

**Tech Stack:** Node.js 24, pnpm 11, Node test runner, YAML lockfile.

## Global Constraints

- Preserve all application behavior.
- Do not update unrelated dependencies.
- Keep frozen-lockfile installs valid.

---

### Task 1: Enforce patched transitive versions

**Files:**

- Modify: `scripts/check-pnpm-supply-chain.mjs`
- Modify: `scripts/check-pnpm-supply-chain.test.mjs`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

- [ ] Add a failing test requiring exact overrides for `brace-expansion@2.1.1` and `brace-expansion@5.0.6`.
- [ ] Run the focused supply-chain test and confirm it fails on the current repository.
- [ ] Add the exact override map to `package.json` and validator.
- [ ] Regenerate `pnpm-lock.yaml` with pnpm 11.6.0.
- [ ] Run supply-chain tests, `pnpm why brace-expansion`, audit, install, test, build and package validation.
- [ ] Commit with DCO sign-off, open a PR closing #506, resolve all bot feedback, and merge after required checks pass.
