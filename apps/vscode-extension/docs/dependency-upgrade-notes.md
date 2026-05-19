# Dependency Upgrade Notes

This branch consolidates the open Dependabot and Socket dependency wave into one maintainer-owned update.

## Reviewed Dependency PRs

| PR  | Scope                                                                                          | Decision                                                                                          |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| #1  | `semver`, `@commitlint/*`, `@typescript-eslint/*`, `@vscode/vsce`, `prettier`, `@types/vscode` | Partially applied. Kept `@types/vscode` on `1.99.x` to match `engines.vscode: ^1.99.0`.           |
| #2  | `webpack-cli` 6 to 7                                                                           | Applied; Node 24 satisfies the major's engine range and package validation covers build behavior. |
| #3  | `jest-util` 29 to 30                                                                           | Postponed with Jest 30.                                                                           |
| #4  | `@types/node` 20 to 25                                                                         | Rejected for now; runtime target remains Node 24.x. Updated to Node 24 typings instead.           |
| #5  | `jest` and `@types/jest` 29 to 30                                                              | Postponed; Jest 30 migration needs a dedicated extension test-runner pass.                        |
| #6  | `eslint` 9 to 10                                                                               | Postponed; ESLint 10 migration should be scheduled with config changes and CI parity.             |
| #7  | `lint-staged` 16 to 17                                                                         | Applied; Node 24 satisfies the major's engine range.                                              |
| #8  | `github/codeql-action` patch                                                                   | Reviewed as safe patch input; workflow pin updates remain controlled by workflow validation.      |
| #10 | `actions/labeler` 5 to 6                                                                       | Reviewed as acceptable major input; no direct workflow change was required in this branch.        |
| #11 | `c8` 10 to 11                                                                                  | Applied; Node 24 satisfies the major's engine range.                                              |
| #12 | `@eslint/js` 9 to 10                                                                           | Postponed with ESLint 10.                                                                         |
| #13 | `actions/checkout` pinned SHA update                                                           | Reviewed as safe patch input; existing pinned checkout usage remains intact.                      |
| #14 | `actions/stale` 9 to 10                                                                        | Reviewed as acceptable major input; no direct workflow change was required in this branch.        |

## Applied Updates

| Package                            | Version   |
| ---------------------------------- | --------- |
| `semver`                           | `7.7.4`   |
| `@commitlint/cli`                  | `20.5.3`  |
| `@commitlint/config-conventional`  | `20.5.3`  |
| `@typescript-eslint/eslint-plugin` | `8.59.2`  |
| `@typescript-eslint/parser`        | `8.59.2`  |
| `prettier`                         | `3.8.3`   |
| `typescript`                       | `5.9.3`   |
| `@types/node`                      | `24.12.2` |
| `@types/vscode`                    | `1.99.1`  |
| `webpack-cli`                      | `7.0.2`   |
| `c8`                               | `11.0.0`  |
| `lint-staged`                      | `17.0.2`  |
| `@vscode/vsce`                     | `3.9.1`   |
| `ovsx`                             | `0.10.11` |
| `@cyclonedx/cyclonedx-npm`         | `4.2.1`   |
| `actionlint`                       | `2.0.6`   |

## Postponed Major Updates

| Dependency                                | Reason                                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript 6                              | Postponed to avoid compiler and lint churn in the same release-hardening branch. `typescript-eslint` 8.59.x supports TS 6, but the repo remains on a conservative TS 5.9.x baseline for this pass. |
| ESLint 10 and `@eslint/js` 10             | Postponed until the flat config migration can be validated on all matrix runners.                                                                                                                  |
| Jest 30, `@types/jest` 30, `jest-util` 30 | Postponed until unit, integration, mocks, and extension host tests are migrated together.                                                                                                          |
| `@types/node` 25                          | Rejected for now because the runtime target is Node 24.x.                                                                                                                                          |
| `@types/vscode` 1.118                     | Rejected for now because the extension minimum remains `engines.vscode: ^1.99.0`.                                                                                                                  |

## Socket Review

Socket comments were reviewed on the dependency PRs visible in the organization repository. The visible comments were score summaries and did not show an actionable malicious package, install script, telemetry, new maintainer, license, or vulnerability blocker for the versions applied in this branch.

No package with a new postinstall requirement was added.

## Dependabot Cleanup

`.github/dependabot.yml` now:

- Groups safe npm patch/minor updates.
- Separates test tooling major updates.
- Separates lint tooling major updates.
- Separates VS Code extension tooling.
- Separates GitHub Actions updates.
- Keeps security updates enabled.
- Adds explicit comments for postponed major updates.
