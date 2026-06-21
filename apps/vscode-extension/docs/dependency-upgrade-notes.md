# Dependency Maintenance Notes

This monorepo uses Renovate as the dependency maintenance bot. Repository-local Renovate configuration was removed so GitHub does not open duplicate dependency pull requests against the same package and workflow surfaces.

## Current Cleanup

- Renovate covers npm, GitHub Actions, Dockerfile, and PEP 621 Python dependencies.
- Renovate lock-file maintenance refreshes `pnpm-lock.yaml` on the weekly maintenance window. (Python MCP server lock files are managed in [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).)
- GitHub Action references remain pinned to immutable commit SHAs.
- `@types/node` stays below `25` while the workspace runtime is Node 24.
- `@types/vscode` stays aligned with `engines.vscode: ^1.101.0`.
- Python dependency updates are applied through `pyproject.toml` plus `uv.lock`.

## Applied Updates

| Package                            | Version   |
| ---------------------------------- | --------- |
| `semver`                           | `7.8.1`   |
| `@commitlint/cli`                  | `20.5.3`  |
| `@commitlint/config-conventional`  | `20.5.3`  |
| `@typescript-eslint/eslint-plugin` | `8.59.2`  |
| `@typescript-eslint/parser`        | `8.59.2`  |
| `prettier`                         | `3.8.3`   |
| `typescript`                       | `5.9.3`   |
| `@types/node`                      | `24.12.3` |
| `@types/vscode`                    | `1.101.0` |
| `webpack-cli`                      | `7.0.2`   |
| `c8`                               | `11.0.0`  |
| `lint-staged`                      | `17.0.4`  |
| `@vscode/vsce`                     | `3.9.1`   |
| `ovsx`                             | `0.10.12` |
| `actionlint`                       | `2.0.6`   |
| `authlib`                          | `1.7.2`   |
| `diff` (pnpm override)             | `9.0.0`   |
| `eslint`                           | `10.4.1`  |
| `@eslint/js`                       | `10.0.1`  |

`diff` is a transitive dev/build-tooling dependency (consumed by `mocha`,
`release-please`, and `code-suggester`); the repo pins a single resolved version through
the `pnpm-workspace.yaml` `overrides` block. The override was raised from `8.0.4` to the
`9.0.0` major. The consuming tools still declare sub-`9` ranges (`mocha` `^7.0.0`,
`release-please`/`code-suggester` `^8.0.3`), so the override forces the major onto them;
this matches the existing pattern (the `8.0.4` override already exceeded `mocha`'s
`^7.0.0`). `diff` 9 drops ES5 support (fine for the Node 24 runtime) and changes
`parsePatch`/`formatPatch` behavior; the full lint, typecheck, test, build, and
`release-please` dry-run suites pass with `9.0.0`.

`eslint` and `@eslint/js` were raised from `9.39.4` to the `10` major. The extension
already uses flat config (`eslint.config.cjs`), so no config-format migration was needed;
`@typescript-eslint` `8.59.2` already declares `eslint` `^10.0.0` as a supported peer. Two
adjustments were required: the `lint` script dropped the removed `--ext` flag
(`eslint src test scripts`; flat config drives extension matching via its `files`
patterns), and three findings from rules newly enabled in ESLint 10's `recommended` set
were fixed (`no-useless-assignment` in `scripts/check-review-threads.mjs`, and
`preserve-caught-error` in `scripts/create-release-assets.js` and `src/library/pcmService.ts`,
now chaining the caught error via `{ cause }`). Lint, format check, typecheck, the unit
suite (638 tests), and the production build all pass on `10.4.1`.

`semver` was raised from `7.8.0` to `7.8.1`. It is a runtime `dependency` consumed by
`src/mcp/compat.ts` (`coerce`/`satisfies` against the kicad-mcp-pro compatibility ranges),
so Renovate gates it behind dashboard approval as a `risk:high` protocol-surface package.
`7.8.1` is a patch release with only two bug fixes (strip build metadata before comparator
trimming; handle prerelease bounds in `subset`); neither touches the plain range checks
used here. The dedicated `mcpCompat` unit test plus the full unit suite, lint, typecheck,
and build all pass on `7.8.1`.

## Postponed Major Updates

| Dependency                                | Reason                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript 6                              | Postponed to avoid compiler and lint churn in the same release-hardening branch. `typescript-eslint` 8.59.x supports TS 6, but the repo remains on a conservative TS 5.9.x baseline for this pass.                                                                                                                                                                                                   |
| Jest 30, `@types/jest` 30, `jest-util` 30 | Postponed until unit, integration, mocks, and extension host tests are migrated together.                                                                                                                                                                                                                                                                                                            |
| Vite 8 (pnpm override)                    | Blocked by `vitepress` 1.6.4 (the newest stable VitePress; only `2.0.0-alpha` supports Vite 8). The `vite` override drives the VitePress docs build, and Vite 8 (Rolldown bundler, removed `transformWithEsbuild`) fails `vitepress build docs` against VitePress 1.6.4. Revisit once a stable VitePress releases with Vite 8 support. See [Planned Major Upgrades](#planned-major-upgrades) (#381). |
| `@vscode/test-electron` next major        | Dev-only extension integration test harness. Gated behind dashboard approval as a `risk:high` toolchain change. See [Planned Major Upgrades](#planned-major-upgrades) (#382).                                                                                                                                                                                                                        |
| `ovsx` next major                         | Dev-only Open VSX publishing CLI. Gated behind dashboard approval as a `risk:high` publish-surface change. See [Planned Major Upgrades](#planned-major-upgrades) (#382).                                                                                                                                                                                                                             |
| `@types/node` 25                          | Rejected for now because the runtime target is Node 24.x.                                                                                                                                                                                                                                                                                                                                            |
| `@types/vscode` 1.121                     | Rejected for now because the package was not published at the time; `1.120.0` was the newest registry version aligned with the previous `engines.vscode: ^1.120.0`.                                                                                                                                                                                                                                  |

## Planned Major Upgrades

These majors are held behind dashboard approval (`risk:high` lane in
[dependency-lifecycle.md](../../../docs/dependency-lifecycle.md)). Each entry records the
migration notes, the minimal code changes identified, the validation gate, and the
rollback path so the upgrade can be executed in a single focused PR once it is unblocked.
None of these packages ship in the VSIX, so there is no runtime impact.

### Vite 8 (#381)

- **Where it lives:** a single `vite: 6.4.3` entry in the `pnpm-workspace.yaml`
  `overrides` block. It is a transitive dependency of `vitepress` 1.6.4 and only affects
  the documentation site build. No application or runtime source imports `vite`.
- **Migration notes:** Vite 8 switches the default bundler to Rolldown and removes
  `transformWithEsbuild`. `vitepress build docs` fails on Vite 8 while VitePress is pinned
  to 1.6.4; only `vitepress@2.0.0-alpha` declares Vite 8 support. The upgrade is therefore
  coupled to a stable VitePress 2.x release.
- **Minimal code changes identified:** raise the `vite` override to `8.x` and bump
  `vitepress` to the first stable 2.x. No changes are expected in `docs/.vitepress/config.mts`
  beyond any VitePress 2.x config-shape adjustments surfaced by its own migration guide.
- **Validation gate:** `pnpm install --frozen-lockfile`, `pnpm run docs:build`,
  `pnpm run docs:lint`, `pnpm run docs:links`, `pnpm run typecheck`, `pnpm run lint`,
  `pnpm run test`, `pnpm run build`, `pnpm run check`, and the full CI matrix.
- **Rollback path:** revert the `vite` override to `6.4.3` and `vitepress` to `1.6.4` in a
  single revert commit; the docs build is the only consumer, so no lockfile surgery beyond
  `pnpm install` is required.
- **Status:** blocked on a stable VitePress release with Vite 8 support. Hold the
  `renovate/vite-8.x` branch unapproved on the dashboard until then.

### @vscode/test-electron and ovsx majors (#382)

- **Where they live:** both are dev-only `devDependencies` of `apps/vscode-extension`
  (`@vscode/test-electron` 2.5.2, `ovsx` 0.10.12). `@vscode/test-electron` downloads a VS
  Code build for the integration/e2e host; `ovsx` publishes the VSIX to Open VSX. Neither
  is bundled in the extension.
- **`@vscode/test-electron` migration notes:** the repo uses only `downloadAndUnzipVSCode(version)`
  and `runTests({...})` in `test/runTest.ts`, `test/e2e/vscodeHarness.ts`, and
  `test/runRealPairHostTest.ts`, with `test/unit/vscodeTestRuntime.test.ts` exercising the
  runtime wiring. A major can change the VS Code download/cache path resolution and the
  pinned VS Code version handling (currently `1.122.0`), so re-run the real integration
  host on every platform after bumping.
- **`ovsx` migration notes:** invoked only as a CLI in `.github/workflows/publish-extension.yml`
  and `apps/vscode-extension/scripts/publish.sh` via `ovsx publish --packagePath`,
  `ovsx get … --metadata --versionRange`, `ovsx get … --versionRange --output`, and
  `--pat`. A major could rename or remove those flags, so the verification steps that read
  back the published version must be re-checked against the new CLI surface.
- **Minimal code changes identified:** bump both `devDependencies`; adjust the `ovsx`
  publish/verify flags in `publish-extension.yml` and `publish.sh` only if the new CLI
  renames them; adjust `downloadAndUnzipVSCode`/`runTests` call sites only if their
  signatures change. No production source changes are expected.
- **Validation gate:** `pnpm install --frozen-lockfile`, `pnpm run typecheck`,
  `pnpm run lint`, `pnpm run test:unit`, `pnpm run test:integration`, `pnpm run build`,
  `pnpm run package`, `pnpm run check`, and the full CI matrix (the publish path is
  exercised by `release:dry-run`, not a live publish).
- **Rollback path:** revert the `devDependencies` bumps and any flag edits in a single
  revert commit. Because both are dev/CI-only, a rollback never affects a shipped artifact;
  an already-published Open VSX version is unaffected by reverting the CLI version.
- **Status:** hold `renovate/major-node-build-and-test-dependencies` unapproved on the
  dashboard until a maintainer runs the validation gate above. These can land as one PR or
  split per package.

## Security Review

The `authlib` lock entry was raised from the vulnerable `1.7.0` release to `1.7.2`, while the declared lower bound now requires the patched `>=1.7.1` series.

No package with a new postinstall requirement was added.
