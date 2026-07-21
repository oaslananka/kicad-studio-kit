# Issue 490 VPS Validation Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development task-by-task.

**Goal:** Provide an idempotent rootless bootstrap and execution wrapper that makes VPS-2 reproduce repository, browser, packaging, and release-recovery checks.

**Architecture:** Pin user tools in `mise.toml`; install/cache them with a Bash bootstrap; derive and extract Playwright/Xvfb Ubuntu packages into a user cache; activate the environment through one wrapper; validate the contract with deterministic Node tests.

**Tech Stack:** Bash, mise, Corepack/pnpm 11, Playwright, apt/dpkg, Node 24 test runner.

## Constraints

- Work only on #490.
- Do not use or require sudo, Docker daemon access, or repository secrets.
- Do not lower Node/Python/KiCad support requirements.
- Do not install Ubuntu's unsupported KiCad 7 package.
- Keep downloaded tools and packages outside the repository.

### Task 1: Capture the validation-host contract

**Files:**

- Create: `scripts/check-validation-host.test.mjs`

- [x] Test exact mise pins and package-script wiring.
- [x] Test that bootstrap and runner are executable and contain rootless/least-privilege safeguards.
- [x] Test the runner's print-environment mode under a temporary HOME.
- [x] Test that documentation records the KiCad canary boundary.
- [x] Run the tests and verify RED before implementation.

### Task 2: Implement the pinned and rootless environment

**Files:**

- Create: `mise.toml`
- Create: `scripts/lib/validation-host-env.sh`
- Create: `scripts/bootstrap-validation-host.sh`
- Create: `scripts/run-validation-host.sh`

- [x] Pin Node 24.18.0, Python 3.13.14, uv 0.11.21, actionlint 1.7.12, and ShellCheck 0.9.0.
- [x] Force mise data/config/cache/state under `$HOME` and neutralize leaked global config paths.
- [x] Install tools, enable pnpm in the pinned Node prefix, install frozen dependencies, and install Chromium.
- [x] Derive Playwright dependencies, add Xvfb/xauth, resolve apt candidates, and atomically build a cached apt root.
- [x] Export PATH/library/font/XKB/Playwright variables only through the wrapper.
- [x] Prove repeat runs are no-op/cache reuse where inputs are unchanged.

### Task 3: Add repository validation and documentation

**Files:**

- Create: `scripts/check-validation-host.mjs`
- Create: `docs/validation-host.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/contributing.md`
- Modify: `scripts/generate-docs-site.mjs`
- Modify: `packages/test-harness/test/paths.test.ts`

- [x] Validate exact pins, scripts, docs, package wiring, and canary ownership.
- [x] Add bootstrap, doctor, check, package, and static-check scripts.
- [x] Link the runbook from contributor entry points.
- [x] Run static tests and verify GREEN.
- [x] Make repository-root validation work from canonical clones and Git worktrees.

### Task 4: Verify on VPS-2 and deliver

- [x] Bootstrap twice and verify idempotence.
- [x] Run strict doctor and confirm only documented optional/canary warnings remain.
- [x] Run real a11y under rootless Chromium libraries.
- [x] Run the full root check and extension package validation.
- [ ] Review the diff, commit with DCO sign-off, push, open a PR closing #490, and watch all required checks to terminal state.
