# Testing Guide - kicad-studio

## Overview

kicad-studio uses **Jest** for unit tests and **Playwright** for E2E/integration.

| Layer       | Runner     | Path                | When            |
| ----------- | ---------- | ------------------- | --------------- |
| Unit        | Jest       | `src/**/__tests__/` | Every PR (CI)   |
| Integration | Jest       | `test/integration/` | Every PR (CI)   |
| E2E         | Playwright | `test/e2e/`         | CI Linux only   |
| Mutation    | Stryker    | `src/**`            | Weekly (Sunday) |

## Running Tests Locally

```bash
# Install deps
pnpm install --frozen-lockfile

# Unit + integration (fast)
pnpm test

# E2E (requires display; use xvfb on Linux)
xvfb-run -a pnpm exec task e2e # Linux
pnpm exec task e2e # macOS / Windows

# Coverage report
pnpm run test:unit:coverage
```

## CI Behavior

- All 3 OS (ubuntu, windows, macos) run the full Jest suite.
- E2E runs via `xvfb-run` on Linux only.
- Coverage is generated on ubuntu-24.04 during CI.
- Mutation score is tracked weekly; see Actions tab.

## VS Code Extension Test Constraints

- Extension tests run inside a **VS Code extension host** via `@vscode/test-electron`.
- Tests that open KiCad files need fixtures in `test/fixtures/`.
- Never import `vscode` in Jest unit tests; mock it via `__mocks__/vscode.ts`.

## Adding a Test

1. Unit test: `src/<module>/__tests__/<module>.test.ts`.
2. Integration test: `test/integration/<feature>.test.ts`.
3. Run `pnpm test -- --testPathPattern=<file>` locally.
4. Ensure `pnpm run lint` passes before committing.
