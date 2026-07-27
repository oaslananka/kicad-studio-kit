---
search: false
---

# VS Code Extension Hotspot Map

This page records the responsibility, churn, and dependency order for the incremental decomposition tracked by issue #497. It is a dated architecture snapshot, not a line-count target. A module should be split only when a stable responsibility boundary and regression gate exist.

## 2026-07-27 Snapshot

The production graph contains 158 TypeScript modules and **0 import cycles** after the reviewed CLI, viewer, export, Component Search, PCM, and state extractions. The repository enforces this with `pnpm run check:vscode-architecture`.

Line counts use the checked-in source tree. Churn counts are the number of commits touching each file in the latest 100 commits at the snapshot date.

| Order | Target                                                                                                                                                                                           |                           Lines |                  Recent touches | Current responsibilities                                                            | Required boundary and validation                                                                                     |
| ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------: | ------------------------------: | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
|     1 | `cli/kicadCliDetector.ts` / `cli/kicadCliSupport.ts` / `cli/kicadCliCapabilities.ts`                                                                                                             |                  491 / 351 / 64 |                     6 / 3 / new | platform discovery, support decisions, and the extracted immutable capability model | **Completed in phase 1:** pure capability model; architecture-cycle guard; detector/support/model unit tests         |
|     2 | `providers/viewerHtml.ts` / `providers/viewer/viewerControllerScript.ts`                                                                                                                         |                     297 / 1,704 |                        11 / new | host HTML/CSP/payload assembly and the extracted browser controller                 | **Completed in phase 2a:** pure controller source boundary; byte-equivalent HTML; unit/security/viewer gates         |
|     3 | `cli/exportCommands.ts` / `cli/exportCommandBuilder.ts`                                                                                                                                          |                     1,401 / 693 |                         4 / new | VS Code export orchestration and the extracted deterministic CLI argument builder   | **Completed in phase 3a:** pure command builder; compatibility wrapper; unit/coverage/security/package gates         |
|     4 | `components/componentSearch.ts` / `components/componentSearchProviders.ts` / `components/componentSearchRanking.ts` / `components/componentSearchView.ts` / `components/componentSearchTypes.ts` |       671 / 85 / 140 / 455 / 28 |       9 / new / new / new / new | VS Code orchestration plus provider, ranking, rendering, and type boundaries        | **Completed through phase 8a:** all Component Search ownership extracted                                             |
|     5 | `library/pcmService.ts` / `library/pcmCatalog.ts` / `library/pcmArchive.ts` / `library/pcmPersistence.ts` / `library/pcmLibraryTable.ts`                                                         |     593 / 315 / 641 / 110 / 150 |       6 / new / new / new / new | install orchestration plus catalog, archive, state, and library-table adapters      | **Completed through phase 5d:** PCM catalog, archive, installed state, and KiCad library-table persistence extracted |
|     6 | `state/stateStores.ts` / `state/diagnosticStateStore.ts` / `state/exportStateStore.ts` / `state/projectStateStore.ts` / `state/viewerStateStore.ts` / `state/mcpStateStore.ts`                   | 15 / 416 / 115 / 93 / 129 / 163 | 9 / new / new / new / new / new | compatibility exports and five domain stores                                        | **Completed through phase 6e:** all state ownership extracted                                                        |
|     7 | `bom/bomTypes.ts` / `components/componentSearchTypes.ts` / `types.ts` / `constants.ts`                                                                                                           |             28 / 28 / 454 / 465 |             new / new / 14 / 15 | domain types, compatibility aggregation, and central contribution constants         | **Completed in phase 8a:** owned types moved; central constants retained deliberately                                |

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

## Component Search View Ownership

`components/componentSearchView.ts` owns the deterministic Component Search presentation boundary: view-state contracts, provider chips, recommendations, result rows, search and details HTML, CSP/nonce placement, browser message wiring, and escaping of provider-controlled text. It has no VS Code, network, cache, secret-storage, filesystem, PCM, or provider-client dependency.

`components/componentSearchProviders.ts` owns remote/cache execution, Octopart warnings, LCSC retry, and local-to-PCM fallback order. Adapters are injected; direct tests cover every branch.

`components/componentSearchRanking.ts` owns result labels, confidence, and BOM recommendations. It uses only component/BOM and view types; locale/messages are injected.

`components/componentSearchTypes.ts` owns result, offer, and price shapes. `components/componentSearch.ts` keeps VS Code, local/PCM, parsing, panel, and command orchestration. Phases 4a–8a reduce it from 1,215 to 671 lines without behavior changes.

## Shared Type and Constant Ownership

`bom/bomTypes.ts` and `components/componentSearchTypes.ts` are dependency-free owners; `types.ts` keeps compatibility re-exports. `constants.ts` remains the central command, view, setting, and manifest contract.

## PCM Catalog Ownership

`library/pcmCatalog.ts` owns the immutable PCM package and repository types, package/version normalization, package-kind classification, latest-version selection, deterministic version comparison, catalog search scoring, and KiCad package JSON serialization. It has no VS Code, Node built-in, network, filesystem, process, CLI, state-store, logger, or UI dependency.

Phase 5a preserves the `pcmService.ts` public import surface through compatibility re-exports and reduces the service from 1,142 to 891 lines without changing package behavior.

## PCM Archive Ownership

`library/pcmArchive.ts` owns SHA-256 verification and the reviewed ZIP extraction adapter. Its dependency allowlist is limited to `node:crypto`, `node:fs`, `node:path`, and `node:zlib`; it cannot import VS Code or another repository module. The adapter validates EOCD, central-directory, local-header, variable-field, and compressed-data ranges before reading; rejects multi-disk, ZIP64, encrypted, data-descriptor, and unsupported-compression forms; and enforces explicit 512 MiB archive, 25,000-entry, 512 MiB per-entry output, and 2 GiB aggregate output ceilings. Deflate output is bounded and checked against the declared size. Extraction occurs in a sibling staging directory, preserving the active target until every entry succeeds. Direct tests cover supported stored/deflate entries, malformed and ambiguous records, resource limits, late decompression failure cleanup, checksum mismatch context, and traversal-name rejection.

## PCM Installed-State Persistence Ownership

`library/pcmPersistence.ts` owns validation of the `kicadstudio.pcm.installedPackages.v1` global-state payload, managed-identifier history, and deterministic `installed_packages.json` serialization. It accepts a narrow Memento-compatible `get`/`update` interface, depends only on `node:fs`, `node:path`, and the PCM catalog model, preserves foreign KiCad package records, and removes stale extension-managed records after uninstall. Direct tests cover malformed state, malformed JSON, foreign-record preservation, managed-record removal, raw metadata preservation, and invalid timestamps.

Phase 5c reduces `library/pcmService.ts` from 798 to 730 lines without changing install, update, or uninstall behavior.

## PCM KiCad Library-Table Ownership

`library/pcmLibraryTable.ts` owns recursive `.kicad_sym` and `.pretty` discovery, managed library-name construction, KiCad table string escaping, deterministic managed-entry replacement, foreign-entry preservation, and uninstall cleanup for `sym-lib-table` and `fp-lib-table`. It accepts a config-directory provider and depends only on `node:fs`, `node:path`, and the PCM catalog model. Direct tests cover nested discovery, foreign-entry preservation, stale managed-entry replacement, selected-package removal, quotes and backslashes, and missing install roots.

`library/pcmService.ts` continues to own repository fetching, install-path selection, injected extractor support, CLI-backed installation, in-memory package state, config-directory selection, reindexing, and user-visible change events. Phase 5d reduces the service from 730 to 593 lines without changing install, update, or uninstall behavior.

## State Store Ownership

Five domain stores own snapshots, events, cloning, lifecycle transitions, and redaction. Direct tests cover project isolation, freshness/Problems transitions, mutation isolation, legacy state, export lifecycle, and disposal.

`state/stateStores.ts` is a 15-line compatibility export surface; phases 6a–6e removed all implementation from the former 888-line aggregator.
