# VS Code Extension Hotspot Map

This page records the responsibility, churn, and dependency order for the incremental decomposition tracked by issue #497. It is a dated architecture snapshot, not a line-count target. A module should be split only when a stable responsibility boundary and regression gate exist.

## 2026-07-24 Snapshot

The production graph contains 144 TypeScript modules. After the CLI capability-model, viewer-controller, and export-command-builder extractions, the graph contains **0 import cycles**. The repository enforces this with `pnpm run check:vscode-architecture`.

Line counts use the checked-in source tree. Churn counts are the number of commits touching each file in the latest 100 commits at the snapshot date.

| Order | Target                                                                               |          Lines | Recent touches | Current responsibilities                                                            | Required boundary and validation                                                                             |
| ----: | ------------------------------------------------------------------------------------ | -------------: | -------------: | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
|     1 | `cli/kicadCliDetector.ts` / `cli/kicadCliSupport.ts` / `cli/kicadCliCapabilities.ts` | 491 / 351 / 64 |    6 / 3 / new | platform discovery, support decisions, and the extracted immutable capability model | **Completed in phase 1:** pure capability model; architecture-cycle guard; detector/support/model unit tests |
|     2 | `providers/viewerHtml.ts` / `providers/viewer/viewerControllerScript.ts`             |    297 / 1,704 |       11 / new | host HTML/CSP/payload assembly and the extracted browser controller                 | **Completed in phase 2a:** pure controller source boundary; byte-equivalent HTML; unit/security/viewer gates |
|     3 | `cli/exportCommands.ts` / `cli/exportCommandBuilder.ts`                              |    1,401 / 550 |        4 / new | VS Code export orchestration and the extracted deterministic CLI argument builder   | **Completed in phase 3a:** pure command builder; compatibility wrapper; unit/coverage/security/package gates |
|     4 | `components/componentSearch.ts`                                                      |          1,215 |              6 | provider requests, normalization, cache policy, scoring, detail rendering           | provider adapters, cache, ranking model; network/cache/unit and UI result tests                              |
|     5 | `library/pcmService.ts`                                                              |          1,142 |              3 | HTTP catalog, archive download, integrity verification, install, table persistence  | catalog client, verified archive installer, persistence adapter; security and PCM regression tests           |
|     6 | `state/stateStores.ts`                                                               |            888 |              5 | multiple domain stores, serialization, migrations, workspace/global state routing   | domain-specific stores with shared storage adapter; migration and state-store tests                          |
|     7 | `types.ts` / `constants.ts`                                                          |      505 / 465 |        14 / 15 | broad shared type and constant fan-in                                               | move definitions only with their owning domain phases; full typecheck and contribution-manifest gates        |

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

## Viewer Document and Controller Ownership

`providers/viewerHtml.ts` owns the host-side webview document: payload construction, CSP and nonce placement, palette variables, localized HTML structure, error HTML, and VS Code resource URI generation.

`providers/viewer/viewerControllerScript.ts` owns the static browser-side controller source: DOM orchestration, viewer state, host messages, worker-based source preparation, KiCanvas startup, SVG fallback, exports, and keyboard/pointer interactions. It is a pure string producer with no VS Code or process dependency at module-evaluation time.

Phase 2a preserved the normalized generated viewer HTML byte-for-byte while reducing `viewerHtml.ts` from 1,997 to 297 lines. Typed host/webview message-contract extraction and finer browser-controller feature splits remain separate #497 phases so they can receive dedicated behavioral regression gates.

## Export Command Builder Ownership

`cli/exportCommandBuilder.ts` owns the complete deterministic export command model: command-kind types, structured build options, fallback defaults, output-file naming, KiCad-major support gates, Gerber layer arguments, common 3D flags, and KiCad 10 variant flags. It has no VS Code, filesystem, process, detector, runner, state-store, logger, or UI dependency.

`cli/exportCommands.ts` remains the VS Code-facing orchestration surface. It resolves configured precision, IPC-2581 settings, theme, and BOM fields before delegating to the pure builder, and it continues to own Gerber layer discovery, project variant discovery, target selection, path safety, command execution, progress and cancellation, presets, jobsets, manufacturing packages, result collection, state reporting, and notifications.

Phase 3a preserves the existing `buildCliExportCommands()` import surface through a compatibility wrapper while reducing `exportCommands.ts` from 1,916 to 1,401 lines. Execution-service, discovery, and presentation boundaries remain separate #497 phases so each can receive focused path-safety, process, and integration regression gates.
