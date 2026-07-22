# Testing Guide - kicad-studio

## Overview

kicad-studio uses **Jest** for unit tests and **Playwright** for E2E/integration.

| Layer       | Runner     | Path                           | When                       |
| ----------- | ---------- | ------------------------------ | -------------------------- |
| Unit        | Jest       | `src/**/__tests__/`            | Every PR (CI)              |
| Integration | Jest       | `test/integration/`            | Every PR (CI)              |
| Real pair   | Node + MCP | `test/integration/realServer/` | Every PR (CI Linux)        |
| Real host   | VS Code    | `test/realPairSuite/`          | Every PR (CI Linux)        |
| E2E         | Playwright | `test/e2e/`                    | Local/manual desktop smoke |
| Mutation    | Stryker    | `src/**`                       | Weekly (Sunday)            |

## Running Tests Locally

```bash
# Install deps
pnpm install --frozen-lockfile

# Unit + integration (fast)
pnpm test

# Local extension + MCP server compatibility
pnpm run test:integration:real

# VS Code Extension Development Host + local MCP server command path
xvfb-run -a pnpm run test:integration:real:host

# VS Code host + local MCP server smoke (Linux needs xvfb)
xvfb-run -a pnpm run test:e2e:real

# E2E (requires display; use xvfb on Linux)
xvfb-run -a pnpm exec task e2e # Linux
pnpm exec task e2e # macOS / Windows

# Coverage report for the configured unit denominator
pnpm run test:unit:coverage

# Validate and generate the included/excluded source inventory
pnpm run check:coverage-scope
pnpm run coverage:inventory

# Block newly uncovered behavior in critical excluded modules
pnpm run test:coverage:ratchet

# Validate the mutation scope and documented survivor policy
pnpm run check:mutation-policy

# Run the blocking mutation baseline and render its summary
pnpm run test:mutation
pnpm run mutation:summary
```

## CI Behavior

- All 3 OS (ubuntu, windows, macos) run the full unit/build/package suite.
- Real-pair compatibility runs on ubuntu-24.04 against the local
  MCP server checkout (from [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/)).
- Real-pair CI launches a VS Code Extension Development Host under `xvfb-run`
  and runs KiCad Studio commands against the local MCP endpoint.
- Playwright real-pair smoke captures VS Code host screenshots/logs for failure
  diagnosis without using workbench DOM text as the MCP source of truth.
- Real-pair failures upload server stdout/stderr, harness metadata, Playwright
  screenshots, traces, and videos from `apps/vscode-extension/test-results`.
- Coverage is generated on ubuntu-24.04 during CI.
- The headline percentage covers the configured Jest unit denominator, not every
  shipped TypeScript file.
- CI publishes `coverage/coverage-scope.json` and
  `coverage/coverage-scope.md`, and enforces the critical-module coverage
  ratchet separately. The ratchet freezes the maximum current uncovered count
  observed across the pinned validation host and GitHub Ubuntu runner.
- The 96.3% mutation baseline is required on extension changes and is also rerun weekly. CI publishes JSON, HTML, and Markdown evidence; undocumented survivors, scope shrinkage, timeouts, no-coverage mutants, or module-score regressions fail closed.

## VS Code Extension Test Constraints

- Extension tests run inside a **VS Code extension host** via `@vscode/test-electron`.
- Tests that open KiCad files should use shared fixtures from
  `packages/kicad-fixtures/`.
- Shared deterministic regression fixtures live in `packages/kicad-fixtures/`
  and are regenerated from the repository root with
  `corepack pnpm run fixtures:kicad:generate`.
- Never import `vscode` in Jest unit tests; mock it via `__mocks__/vscode.ts`.

## Adding a Test

1. Unit test: `src/<module>/__tests__/<module>.test.ts`.
2. Integration test: `test/integration/<feature>.test.ts`.
3. Run `pnpm test -- --testPathPattern=<file>` locally.
4. Ensure `pnpm run lint` passes before committing.
