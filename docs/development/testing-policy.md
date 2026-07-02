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

The repository has global coverage thresholds for extension unit tests. Do not lower thresholds without maintainer approval and an issue describing the reason and recovery plan.

## Flaky or environment-bound tests

Display-bound VS Code, Playwright, visual, and integration tests may require Xvfb on Linux. If a test is skipped because the required external server or display is unavailable, document the skip in the PR evidence.
