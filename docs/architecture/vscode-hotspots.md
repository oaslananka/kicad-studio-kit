# VS Code Extension Hotspot Map

This page records the responsibility, churn, and dependency order for the incremental decomposition tracked by issue #497. It is a dated architecture snapshot, not a line-count target. A module should be split only when a stable responsibility boundary and regression gate exist.

## 2026-07-23 Snapshot

The production graph contains 142 TypeScript modules. After the CLI capability-model extraction, the graph contains **0 import cycles**. The repository enforces this with `pnpm run check:vscode-architecture`.

Line counts use the checked-in source tree. Churn counts are the number of commits touching each file in the latest 100 commits at the snapshot date.

| Order | Target                                                                               |          Lines | Recent touches | Current responsibilities                                                                         | Required boundary and validation                                                                             |
| ----: | ------------------------------------------------------------------------------------ | -------------: | -------------: | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
|     1 | `cli/kicadCliDetector.ts` / `cli/kicadCliSupport.ts` / `cli/kicadCliCapabilities.ts` | 491 / 351 / 64 |    6 / 3 / new | platform discovery, support decisions, and the extracted immutable capability model              | **Completed in phase 1:** pure capability model; architecture-cycle guard; detector/support/model unit tests |
|     2 | `providers/viewerHtml.ts`                                                            |          1,997 |             10 | HTML template, styles, browser controller, state serialization, message contract                 | split by template/styles/controller/message contract; visual, accessibility, and viewer snapshot gates       |
|     3 | `cli/exportCommands.ts`                                                              |          1,916 |              4 | export command construction, input validation, capability checks, execution, result presentation | command builders plus execution service; unit, integration, CLI compatibility, package-size gates            |
|     4 | `components/componentSearch.ts`                                                      |          1,215 |              6 | provider requests, normalization, cache policy, scoring, detail rendering                        | provider adapters, cache, ranking model; network/cache/unit and UI result tests                              |
|     5 | `library/pcmService.ts`                                                              |          1,142 |              3 | HTTP catalog, archive download, integrity verification, install, table persistence               | catalog client, verified archive installer, persistence adapter; security and PCM regression tests           |
|     6 | `state/stateStores.ts`                                                               |            888 |              5 | multiple domain stores, serialization, migrations, workspace/global state routing                | domain-specific stores with shared storage adapter; migration and state-store tests                          |
|     7 | `types.ts` / `constants.ts`                                                          |      505 / 465 |        14 / 15 | broad shared type and constant fan-in                                                            | move definitions only with their owning domain phases; full typecheck and contribution-manifest gates        |

`mcp/mcpClient.ts` is intentionally excluded from this order. Issue #492 owns its protocol/transport decomposition and final `2026-07-28` compatibility work.

## Phase Rules

Each phase must satisfy all of the following:

1. Change one responsibility boundary only; do not combine unrelated product behavior changes.
2. Add or strengthen the regression lane that owns the extracted responsibility before moving code.
3. Keep compatibility re-exports temporarily when removing them would expand the PR beyond the selected boundary.
4. Preserve activation timing, production bundle size, repeatable VSIX output, and platform-specific extension checks.
5. Run the production import-cycle guard and keep the graph at zero cycles.
6. Record every bot, agent, scanner, review, and inline finding before merge.

## Capability Model Ownership

`cli/kicadCliCapabilities.ts` owns immutable capability names, snapshots, KiCad-major parsing, and command-version eligibility. It has no VS Code or process-execution dependency.

`cli/kicadCliDetector.ts` owns discovery, path validation, subprocess probes, caches, and snapshot construction. `cli/kicadCliSupport.ts` owns user-facing release-line and feature-support descriptions. Both depend on the capability model and no longer depend on one another.
