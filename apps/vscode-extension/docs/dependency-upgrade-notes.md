# Dependency Maintenance Notes

This monorepo uses Renovate as the dependency maintenance bot. Repository-local Renovate configuration was removed so GitHub does not open duplicate dependency pull requests against the same package and workflow surfaces.

## Current Cleanup

- Renovate covers npm, GitHub Actions, Dockerfile, and PEP 621 Python dependencies.
- Renovate lock-file maintenance refreshes `pnpm-lock.yaml` and `packages/mcp-server/uv.lock` on the weekly maintenance window.
- GitHub Action references remain pinned to immutable commit SHAs.
- `@types/node` stays below `25` while the workspace runtime is Node 24.
- `@types/vscode` stays aligned with `engines.vscode: ^1.120.0`.
- Python dependency updates are applied through `pyproject.toml` plus `uv.lock`.

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
| `@types/node`                      | `24.12.3` |
| `@types/vscode`                    | `1.120.0` |
| `webpack-cli`                      | `7.0.2`   |
| `c8`                               | `11.0.0`  |
| `lint-staged`                      | `17.0.4`  |
| `@vscode/vsce`                     | `3.9.1`   |
| `ovsx`                             | `0.10.12` |
| `actionlint`                       | `2.0.6`   |
| `authlib`                          | `1.7.2`   |
| `diff` (pnpm override)             | `9.0.0`   |

`diff` is a transitive dev/build-tooling dependency (consumed by `mocha`,
`release-please`, and `code-suggester`); the repo pins a single resolved version through
the `pnpm-workspace.yaml` `overrides` block. The override was raised from `8.0.4` to the
`9.0.0` major. The consuming tools still declare sub-`9` ranges (`mocha` `^7.0.0`,
`release-please`/`code-suggester` `^8.0.3`), so the override forces the major onto them;
this matches the existing pattern (the `8.0.4` override already exceeded `mocha`'s
`^7.0.0`). `diff` 9 drops ES5 support (fine for the Node 24 runtime) and changes
`parsePatch`/`formatPatch` behavior; the full lint, typecheck, test, build, and
`release-please` dry-run suites pass with `9.0.0`.

## Postponed Major Updates

| Dependency                                | Reason                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript 6                              | Postponed to avoid compiler and lint churn in the same release-hardening branch. `typescript-eslint` 8.59.x supports TS 6, but the repo remains on a conservative TS 5.9.x baseline for this pass.                                                                                                                                     |
| ESLint 10 and `@eslint/js` 10             | Postponed until the flat config migration can be validated on all matrix runners.                                                                                                                                                                                                                                                      |
| Jest 30, `@types/jest` 30, `jest-util` 30 | Postponed until unit, integration, mocks, and extension host tests are migrated together.                                                                                                                                                                                                                                              |
| Vite 8 (pnpm override)                    | Blocked by `vitepress` 1.6.4 (the newest stable VitePress; only `2.0.0-alpha` supports Vite 8). The `vite` override drives the VitePress docs build, and Vite 8 (Rolldown bundler, removed `transformWithEsbuild`) fails `vitepress build docs` against VitePress 1.6.4. Revisit once a stable VitePress releases with Vite 8 support. |
| `@types/node` 25                          | Rejected for now because the runtime target is Node 24.x.                                                                                                                                                                                                                                                                              |
| `@types/vscode` 1.121                     | Rejected for now because the package is not published yet; `1.120.0` is the newest registry version aligned with `engines.vscode: ^1.120.0`.                                                                                                                                                                                           |

## Security Review

The `authlib` lock entry was raised from the vulnerable `1.7.0` release to `1.7.2`, while the declared lower bound now requires the patched `>=1.7.1` series.

No package with a new postinstall requirement was added.
