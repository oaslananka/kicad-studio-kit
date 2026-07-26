---
search: false
---

# KiCad 11 Readiness Dashboard

Machine-maintained from `compatibility.yaml.kicadIpcReadiness`. Refresh with
`corepack pnpm run docs:generate`.

KiCad 10.0.5 remains primary and release-blocking. This
page tracks preparation for 11.0.x; it does not claim KiCad 11
support before the official RC or stable canary and published-artifact gates pass.

## Current Gate

<!-- prettier-ignore -->
| Item | State |
| --- | --- |
| Reviewed | `2026-07-26` |
| Stable baseline | `10.0.5` |
| Target line | `11.0.x` |
| Upstream state | `nightly` |
| Overall readiness | `blocked` |
| Promotion state | `blocked` |
| Tracking issue | [https://github.com/oaslananka/kicad-studio-kit/issues/377](https://github.com/oaslananka/kicad-studio-kit/issues/377) |

**Current blocker:** No official KiCad 11 RC or stable release and no matching published-artifact canary evidence are available yet.

Upstream evidence: [official source](https://www.kicad.org/help/nightlies-and-rcs/); [official source](https://www.kicad.org/).

## Readiness Dimensions

<!-- prettier-ignore -->
| Area | Status | Owner | Current result | Evidence | Blocker |
| --- | --- | --- | --- | --- | --- |
| KiCad CLI | `ready-for-canary` | KiCad MCP Pro | Nightly and future-line CLI canary commands plus deterministic artifact outputs are defined. | `corepack pnpm run test:kicad-cli-contract:nightly`; `corepack pnpm run test:kicad-cli-contract:future`; [`docs/compatibility/kicad-10-to-11-migration.md`](./kicad-10-to-11-migration.md) | No KiCad 11 RC or stable CLI evidence bundle has been recorded. |
| IPC API | `ready-for-canary` | Shared contract | Project discovery, PCB/schematic reads, DRC/ERC, export, and diagnostics parity requirements are mapped. | `kicadIpcReadiness.ipcApi.requiredFor`; [official source](https://dev-docs.kicad.org/en/apis-and-binding/) | KiCad 11 IPC behavior has not been verified against an official RC or stable build. |
| VS Code extension UX | `complete` | KiCad Studio | Detected KiCad lines and feature-level capability failures are visible in status and command surfaces. | `apps/vscode-extension/test/unit/kicadStatusBar.test.ts`; `apps/vscode-extension/test/unit/viewerStatusMenu.test.ts`; `apps/vscode-extension/test/unit/kicadCliSupport.test.ts` | — |
| MCP integration | `ready-for-canary` | Shared contract | Published server compatibility ranges and cross-repository real-pair gates are defined. | `.github/workflows/cross-repo-compatibility.yml`; [`docs/mcp/transport.md`](../mcp/transport.md); [`docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md`](../adr/0008-mcp-2026-07-28-protocol-upgrade.md) | No published KiCad MCP Pro release has been verified against KiCad 11. |
| Tests | `ready-for-canary` | Shared contract | Compatibility, unit, integration, and critical CLI snapshot requirements are release-gated. | `scripts/check-compatibility-contract.test.mjs`; `apps/vscode-extension/test/unit/kicadCliSupport.test.ts`; `corepack pnpm run check:compatibility-contract` | KiCad 11-specific snapshots and real-pair results remain pending. |
| Documentation | `complete` | KiCad Studio | Migration, support boundary, generated dashboard, and stable-release checklist are documented. | [`docs/compatibility/kicad-10-to-11-migration.md`](./kicad-10-to-11-migration.md); [`docs/support-matrix.md`](../support-matrix.md); `scripts/generate-docs-site.mjs` | — |

## No production `pcbnew` / SWIG dependency

**Status:** `complete` — No production pcbnew / SWIG dependency is permitted; KiCad IPC, kicad-cli, and file-backed adapters are the supported integration paths.

Owner: Shared contract. Evidence: `kicadIpcReadiness.directPcbnewImports`; [official source](https://dev-docs.kicad.org/en/apis-and-binding/pcbnew/).

The repository contract keeps `directPcbnewImports.policy` set to
`forbidden-in-production` with an empty allowlist. Native guard execution is
owned by KiCad MCP Pro; this extension repository keeps the claim visible and
release-reviewable.

## Critical CLI Snapshot Contract

The first KiCad 11 nightly/RC evidence bundle must retain these command outputs
so command-surface drift can be reviewed in the pull request rather than inferred
from a pass/fail badge.

<!-- prettier-ignore -->
| Snapshot | Canary probe | Expected artifact | Status | Purpose |
| --- | --- | --- | --- | --- |
| version-about | `version` | `logs/version.stdout.log` | `pending` | Freeze the exact KiCad 11 build identity and compiler/runtime metadata. |
| pcb-drc | `clean-drc` | `logs/clean-drc.stdout.log` | `pending` | Review DRC command output and exit-code drift. |
| schematic-erc | `clean-erc` | `logs/clean-erc.stdout.log` | `pending` | Review ERC command output and report-shape drift. |
| pcb-export-help | `pcb-export-surface` | `logs/pcb-export-help.stdout.log` | `pending` | Review manufacturing and 3D export command availability. |
| schematic-export-help | `schematic-export-surface` | `logs/schematic-export-help.stdout.log` | `pending` | Review schematic PDF, BOM, and netlist command availability. |
| board-statistics | `board-stats` | `logs/board-stats.stdout.log` | `pending` | Review board statistics semantics, including path and Unicode cases. |

## Same-Day Stable Release Checklist

<!-- prettier-ignore -->
| Step | ID | Owner | Status | Action |
| --- | --- | --- | --- | --- |
| 1 | verify-artifact | KiCad Studio | `pending` | Record the official KiCad 11 release URL, artifact size, and digest. |
| 2 | run-native-canary | KiCad MCP Pro | `pending` | Run the pinned CLI and IPC canary against the official artifact. |
| 3 | attach-snapshots | KiCad MCP Pro | `pending` | Attach the summary, failing-fixtures file, and required CLI snapshots. |
| 4 | compare-contracts | Shared contract | `pending` | Compare KiCad 11 command, report, and IPC semantics with the 10.0.5 baseline. |
| 5 | verify-extension | KiCad Studio | `pending` | Run unit, integration, accessibility, build, package, and cross-repository gates. |
| 6 | verify-swig-guard | KiCad MCP Pro | `pending` | Confirm the production pcbnew / SWIG guard remains clean. |
| 7 | update-support-policy | KiCad Studio | `pending` | Update compatibility metadata only after all canaries pass. |
| 8 | regenerate-docs | KiCad Studio | `pending` | Regenerate the support matrix, dashboard, testing strategy, and release notes. |
| 9 | publish-decision | Shared contract | `pending` | Record the reviewed secondary/primary promotion decision and rollback boundary. |

## Promotion Rule

KiCad 11 may move to a secondary or primary support line only after the official
RC or stable artifact is identified, the owning KiCad MCP Pro CLI/IPC canary and
this repository's cross-product gates pass, critical snapshots are attached, the
SWIG guard remains clean, and the support matrix plus changelog are updated in
the same reviewed change.
