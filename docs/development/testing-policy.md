# Testing Policy

## Required evidence by change type

| Change type               | Expected evidence                                                              |
| ------------------------- | ------------------------------------------------------------------------------ |
| Documentation only        | Markdown/link checks when practical.                                           |
| TypeScript source         | Lint, typecheck, unit tests, and relevant regression tests.                    |
| Webview changes           | Unit/security/webview/a11y tests and visual checks when UI changes.            |
| MCP integration           | Unit tests, compatibility metadata checks, and real-pair tests when available. |
| Release workflow          | Release verification, package validation, and dry-run evidence.                |
| Security-sensitive change | Security regression tests and explicit threat-model update if needed.          |

## Root quality gates

The root `check` script is the full repository gate. It can be expensive. For small PRs, run the focused gates first and document why any skipped gates are not applicable.

## Coverage

The repository has global coverage thresholds for the configured extension unit-test denominator. The percentage is not a whole-source claim. `apps/vscode-extension/coverage-scope.json` classifies every explicit exclusion and assigns either integration ownership or a targeted blocking ratchet. Validate the policy with `corepack pnpm run check:coverage-scope` and do not lower global or ratchet thresholds without maintainer approval and an issue describing the reason and recovery plan.

## Mutation testing

The extension mutation scope is controlled by `apps/vscode-extension/mutation-baseline.json` and validated with `corepack pnpm --filter kicadstudiokit run check:mutation-policy`. The blocking command is `corepack pnpm --filter kicadstudiokit run test:mutation`; it must complete within the documented 10-minute budget and may not use `continue-on-error`. Do not lower the 96.3% break threshold, shrink a module's mutant count, or add survivor exceptions to make unrelated work pass. New survivors require focused tests or a reviewed equivalent/static classification with evidence. Large deferred modules must be introduced as separate measured shards.

## Flaky or environment-bound tests

Display-bound VS Code, Playwright, visual, and integration tests may require Xvfb on Linux. If a test is skipped because the required external server or display is unavailable, document the skip in the PR evidence.
