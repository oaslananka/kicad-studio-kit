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

- [ ] Test exact mise pins and package-script wiring.
- [ ] Test that bootstrap and runner are executable and contain rootless/least-privilege safeguards.
- [ ] Test the runner's print-environment mode under a temporary HOME.
- [ ] Test that documentation records the KiCad canary boundary.
- [ ] Run the tests and verify RED before implementation.

### Task 2: Implement the pinned and rootless environment

**Files:**

- Create: `mise.toml`
- Create: `scripts/lib/validation-host-env.sh`
- Create: `scripts/bootstrap-validation-host.sh`
- Create: `scripts/run-validation-host.sh`

- [ ] Pin Node 24.18.0, Python 3.13.14, uv 0.11.21, actionlint 1.7.12, and ShellCheck 0.9.0.
- [ ] Force mise data/config/cache/state under `$HOME` and neutralize leaked global config paths.
- [ ] Install tools, enable pnpm in the pinned Node prefix, install frozen dependencies, and install Chromium.
- [ ] Derive Playwright dependencies, add Xvfb/xauth, resolve apt candidates, and atomically build a cached apt root.
- [ ] Export PATH/library/font/XKB/Playwright variables only through the wrapper.
- [ ] Prove repeat runs are no-op/cache reuse where inputs are unchanged.

### Task 3: Add repository validation and documentation

**Files:**

- Create: `scripts/check-validation-host.mjs`
- Create: `docs/validation-host.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/contributing.md`

- [ ] Validate exact pins, scripts, docs, package wiring, and canary ownership.
- [ ] Add bootstrap, doctor, check, package, and static-check scripts.
- [ ] Link the runbook from contributor entry points.
- [ ] Run static tests and verify GREEN.

### Task 4: Verify on VPS-2 and deliver

- [ ] Bootstrap twice and verify idempotence.
- [ ] Run strict doctor and confirm only documented optional/canary warnings remain.
- [ ] Run real a11y under rootless Chromium libraries.
- [ ] Run the full root check and extension package validation.
- [ ] Review the diff, commit with DCO sign-off, push, open a PR closing #490, and watch all required checks to terminal state.
