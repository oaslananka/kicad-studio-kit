# Support Matrix

`compatibility.yaml` is the source of truth for KiCad Studio Kit compatibility metadata. Release dry-runs and CI validate that this matrix stays synchronized with package metadata, extension compatibility code, MCP discovery metadata, and the generated MCP tool catalog.

## Generated Compatibility Summary

<!-- docs-site:compatibility:start -->

Machine-maintained from `compatibility.yaml`. Refresh with
`corepack pnpm run docs:generate`.

### Runtime Baseline

| Runtime | Policy |
| --- | --- |
| KiCad primary | `10.0.x` |
| KiCad latest verified | `10.0.3` |
| VS Code minimum | `1.101.0` |
| Node | `>=24.11.0 <25` |
| pnpm | `>=11.0.0 <12` |
| Python | `>=3.13` |
| MCP protocol | `2025-11-25` |
| MCP protocol (next) | `2026-07-28` |

### KiCad Support

| Range | State | CI | Notes |
| --- | --- | --- | --- |
| 10.0.x | primary | required | Primary optimized KiCad CLI and file-format target. |
| 9.x | deprecated | scheduled | Upstream KiCad 9.x is no longer actively maintained; core workflows remain best-effort while scheduled canaries gather removal evidence. |
| 8.x | deprecated | manual | File-level read and migration support only; removal requires a release note. |

### Product Versions

| Product | Version | Manifest | Compatibility range |
| --- | --- | --- | --- |
| kicad-studio | 1.9.1 | apps/vscode-extension/package.json | &gt;=3.5.2 &lt;4.0.0 |

### Release Gate Inputs

- compatibility.yaml validates
- Product versions match release manifests
- Extension MCP compatibility range matches embedded compatibility metadata
- MCP protocol and tool schema metadata match server discovery metadata
- Required MCP tools exist in the generated tool reference
- KiCad, VS Code, Node, pnpm, and Python support ranges match package metadata

<!-- docs-site:compatibility:end -->

## MCP Compatibility Contract

The product version and runtime ranges above describe the **VS Code extension**,
which is the only product released from this repository. The MCP server is
released separately from
[oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) (see
[ADR 0009](adr/0009-split-kicad-mcp-pro-into-separate-repository.md)), so this
matrix does not track MCP server source compatibility.

What this repository owns is the **client-side integration contract**: the range
of `kicad-mcp-pro` server versions the extension is built and tested against.

| Surface | Owner | Source of truth |
| --- | --- | --- |
| KiCad Studio extension version and runtime ranges | this repository | `apps/vscode-extension/package.json`, `compatibility.yaml` |
| Required compatible `kicad-mcp-pro` range (client contract) | this repository | `compatibility.yaml` `products.kicad-studio.compatibleMcpPro` |
| MCP protocol / tool schema revisions | shared contract | `compatibility.yaml` `mcp`, `@oaslananka/kicad-protocol-schemas` |
| MCP server implementation compatibility | [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) | that repository's `compatibility.yaml` |

The compatible-server range is validated against the extension's embedded
metadata and the last published server version by
`corepack pnpm run check:compatibility-contract` and the cross-repo
compatibility canary.

## Tested KiCad CLI Feature Matrix

This matrix records the user-facing support boundary for `kicad-cli` driven
extension features. The runtime checks intentionally probe CLI command help
before running commands; a version line alone is not enough to enable advanced
exports.

| KiCad line | Tested patch | Support state | Required validation                         | Extension feature state                                                                                                                                                                          |
| ---------- | ------------ | ------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10.0.x     | 10.0.3       | Primary       | Required release gate and KiCad canary lane | Core DRC/ERC, BOM/netlist, Gerbers/drill, jobsets, design variants, 3D PDF, STEPZ/XAO, and ODB++ are supported when command probes pass.                                                         |
| 9.x        | 9.0.9        | Deprecated    | Scheduled non-blocking KiCad canary lane    | Core DRC/ERC, BOM/netlist, Gerbers/drill, jobsets, ODB++, and manufacturing package workflows remain best-effort when command probes pass; KiCad 10-only variants and 3D PDF remain unavailable. |
| 8.x        | 8.0.x        | Deprecated    | Manual compatibility check                  | Core file-level read, migration, DRC/ERC, BOM/netlist, and Gerber workflows are best-effort when command probes pass; jobsets, variants, 3D PDF, and ODB++ remain unavailable.                   |
| <8         | none         | Unsupported   | None                                        | KiCad Studio reports the detected CLI as unsupported and does not claim feature compatibility.                                                                                                   |

## KiCad 10 PCB Import Workflow Matrix

`compatibility.yaml` tracks extension-facing PCB import workflows under
`kicad.pcbImportWorkflows`. KiCad Studio shows or runs importer commands only
after probing `kicad-cli pcb import --help`; this prevents the extension from
claiming GUI-only importers as CLI-backed workflows.

| Source format  | Extension command              | KiCad 10 CLI state | User-facing behavior                                                                                                                                                  |
| -------------- | ------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Altium         | `kicadstudio.importAltium`     | Supported          | Command remains available and validates `--format altium` before opening the picker.                                                                                  |
| Allegro        | `kicadstudio.importAllegro`    | Blocked            | Command is registered for future compatibility, hidden unless `--format allegro` is advertised, and reports a deterministic warning when invoked without CLI support. |
| CADSTAR        | `kicadstudio.importCadstar`    | Supported          | Command remains available and validates `--format cadstar` before opening the picker.                                                                                 |
| Eagle          | `kicadstudio.importEagle`      | Supported          | Command remains available and validates `--format eagle` before opening the picker.                                                                                   |
| Fabmaster      | `kicadstudio.importFabmaster`  | Supported          | Command remains available and validates `--format fabmaster` before opening the picker.                                                                               |
| gEDA/Lepton    | `kicadstudio.importGeda`       | Probe-gated        | Existing command remains available but does not run unless the installed CLI help advertises `geda`.                                                                  |
| PADS           | `kicadstudio.importPads`       | Supported          | Command remains available and validates `--format pads` before opening the picker.                                                                                    |
| P-CAD          | `kicadstudio.importPcad`       | Supported          | Command remains available and validates `--format pcad` before opening the picker.                                                                                    |
| SolidWorks PCB | `kicadstudio.importSolidworks` | Supported          | Command remains available and validates `--format solidworks` before opening the picker.                                                                              |

Allegro fixture coverage is tracked by
[`kicad-10-0-3-regressions`](kicad-fixture-corpus.md#fixture-coverage). The
fixture records the stable boundary: KiCad 10 PCB Editor supports Cadence
Allegro `.brd` import, while current stable CLI help does not advertise
`--format allegro`.

## KiCad 10.0.3 Feature-Parity Matrix

The full KiCad 10.0.3 parity contract lives in
[`docs/compatibility/kicad-10-0-3-feature-parity.md`](compatibility/kicad-10-0-3-feature-parity.md)
and is machine-validated from `compatibility.yaml` `kicad10FeatureParity`.
It covers importer, CLI/export, GUI/editor, IPC, VS Code extension, MCP server,
and release artifact surfaces.

Every `supported` feature must link to a test, fixture, command probe, or smoke
path. Every `partial` or `blocked` feature must link to a GitHub issue. KiCad
11 readiness risks stay in the separate readiness section so the KiCad 10.0.3
matrix remains the stable release boundary.

## KiCad 11 Readiness

KiCad 11 is not a primary support target yet. The readiness contract is tracked
separately from the current KiCad 10.0.x support boundary so release gates keep
protecting users on the stable line while maintainers test the next major line.

| Readiness item         | Current contract                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Stable baseline        | KiCad 10.0.x remains primary and release-blocking.                                                                                         |
| Direct SWIG imports    | Production `pcbnew` imports are forbidden by a guard script in the [`oaslananka/kicad-mcp`](https://github.com/oaslananka/kicad-mcp) repo. |
| Allowed `pcbnew` paths | Guarded by the kicad-mcp repository.                                                                                                       |
| IPC parity matrix      | `compatibility.yaml` `kicadIpcReadiness.ipcApi.requiredFor`.                                                                               |
| Current nightly smoke  | Run from [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) with a configured nightly `kicad-cli`.                            |
| KiCad 11 RC smoke      | Run from [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) once the installed prerelease reports `11.0.x`.                   |
| Migration guide        | [`docs/compatibility/kicad-10-to-11-migration.md`](compatibility/kicad-10-to-11-migration.md).                                             |

Status surfaces:

- The status bar shows the detected KiCad support line and warns on deprecated or unsupported CLIs.
- The `KiCad Studio Commands` status menu lists feature-level availability with precise unsupported reasons.
- Advanced commands such as ODB++, 3D PDF, STEPZ, and XAO export require both their documented KiCad line and a successful `kicad-cli` capability probe.
- KiCad 9.x remains in feature gates for migration compatibility, but status
  surfaces label it deprecated because upstream active maintenance ended after
  KiCad 10.0.0.
- KiCad 10.0.3 patch-specific regression coverage is tracked by
  [`kicad-10-0-3-regressions`](kicad-fixture-corpus.md#fixture-coverage).

Freshness sources checked on 2026-05-27:

- KiCad 10.0.3 release notes: <https://www.kicad.org/blog/2026/05/KiCad-10.0.3-Release/>
- KiCad 10.0.3 GitHub release tag: <https://github.com/KiCad/kicad-source-mirror/releases/tag/10.0.3>
- KiCad 10.0.0 GitHub release note for KiCad 9.x active-maintenance EOL: <https://github.com/KiCad/kicad-source-mirror/releases/tag/10.0.0>
- KiCad 9.0.9 release notes: <https://www.kicad.org/blog/2026/04/KiCad-9.0.9-Release/>
- KiCad 9.0.9 RC note for final 9.0 bug-fix policy: <https://www.kicad.org/blog/2026/04/KiCad-Version-9.0.9-Release-Candidate-1-Available/>
- KiCad 10.0 CLI reference: <https://docs.kicad.org/10.0/en/cli/cli.html>
- KiCad 10.0 PCB Editor import reference: <https://docs.kicad.org/10.0/en/pcbnew/pcbnew.html>
- KiCad nightly CLI reference: <https://docs.kicad.org/master/en/cli/cli.html>
- KiCad PCB Python bindings deprecation notice: <https://dev-docs.kicad.org/en/apis-and-binding/pcbnew/>
- KiCad nightly and release candidate guidance: <https://www.kicad.org/help/nightlies-and-rcs/>
- KiCad 9.0 CLI reference: <https://docs.kicad.org/9.0/en/cli/cli.html>
- KiCad 8.0 CLI reference: <https://docs.kicad.org/8.0/en/cli/cli.html>

## Lifecycle States

| State      | Meaning                                                               |
| ---------- | --------------------------------------------------------------------- |
| Primary    | Actively optimized and release-blocking in compatibility gates.       |
| Supported  | Expected to work and covered by scheduled or product-specific checks. |
| Deprecated | Still handled where practical, but support removal may be scheduled.  |
| Dropped    | Not tested, not supported, and only mentioned for migration context.  |

## Current Platform Policy

| Surface      | Primary    | Supported              | Deprecated | Gate                                     |
| ------------ | ---------- | ---------------------- | ---------- | ---------------------------------------- |
| KiCad        | 10.0.x     | none                   | 9.x, 8.x   | `compatibility.yaml` + release preflight |
| VS Code      | current    | `engines.vscode` 1.101 | none       | extension manifest + VS Code canary      |
| MCP protocol | 2025-11-25 | 2025-11-25             | older      | well-known server card + matrix          |
| Node         | 24.x       | `>=24.11.0 <25`        | older      | root and extension package metadata      |
| pnpm         | 11.x       | `>=11.0.0 <12`         | older      | root package metadata                    |
| Python       | 3.13       | 3.13, 3.14             | older      | `pyproject.toml` and CI                  |

The MCP protocol revision `2026-07-28` is the tracked next protocol target. It is
recorded as `nextProtocolVersion` in `compatibility.yaml` and surfaced in the
generated runtime baseline above, but it is not yet adopted: the active protocol
stays `2025-11-25` until the Python MCP SDK ships 2026-07-28 support. The phased
upgrade plan and per-file change list are maintained in
[ADR 0008](adr/0008-mcp-2026-07-28-protocol-upgrade.md).

## Minimum-Bump Policy

Runtime support boundaries are intentional product decisions, not incidental package metadata.
Every boundary must be changed in `compatibility.yaml`, the relevant package manifest, this
document, and the nearest release note or product changelog.

VS Code:

- `apps/vscode-extension/package.json` `engines.vscode` is the install-time floor.
- The floor should be no more than one VS Code minor behind current stable.
- `@types/vscode`, extension API usage, and canary lanes stay aligned with that floor.
- Lowering the floor is blocked in CI unless `apps/vscode-extension/CHANGELOG.md` changes in
  the same PR with compatibility context.

Python:

- `requires-python` in the kicad-mcp-pro source (see [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)) is the MCP server install-time floor.
- The supported Python window is two minor versions wide for the current stable product line.
- The current product line tracks the official two-minor bugfix window: Python 3.13 and 3.14.
  The drift workflow opens a tracking issue when the official bugfix window moves again.
- Lowering the floor is blocked in CI unless the MCP server changelog changes in the same PR with compatibility context.

KiCad:

- `compatibility.yaml` declares the primary KiCad line, deprecated previous lines,
  upstream EOL annotations, and latest verified patch release.
- The primary KiCad line should match the official current stable line once the canary lane is
  green.
- Lowering the primary line or widening support back to an older line requires both product
  changelogs because it changes extension UX and MCP server behavior.

Authoritative drift sources are declared in `compatibility.yaml` under `runtimePolicy.sources`:

- VS Code stable and insiders release feeds from `update.code.visualstudio.com`.
- Python release lifecycle metadata from `peps.python.org/api/python-releases.json`.
- KiCad current release text from `kicad.org/download/linux`.

## Automated Drift Detection

Runtime drift is enforced by scripts in the [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) repository.

Pull requests run local policy checks that:

- verify `engines.vscode` is parseable and matches `compatibility.yaml`;
- verify `requires-python` is parseable and matches `compatibility.yaml`;
- verify the Python support window starts at the package lower bound;
- block lowered VS Code, Python, or KiCad support boundaries without product changelog evidence;
- require this document to change whenever runtime support metadata changes.

The scheduled drift workflow fetches the authoritative sources above. When current stable versions
move beyond policy, it opens or updates a GitHub compatibility issue named
`Runtime support policy drift`. The issue is the tracking surface for raising `engines.vscode`,
Python support, or KiCad primary support after canary validation passes.

## Release Gate

Run the compatibility gate before any release PR is merged:

```powershell
corepack pnpm run check:compatibility-contract
```

The gate fails when:

- `compatibility.yaml` is missing or malformed.
- package versions drift from the matrix.
- `engines.vscode`, Node, pnpm, or Python ranges drift from the matrix.
- the extension MCP compatibility constants drift from the matrix.
- the MCP server well-known metadata drifts from the matrix.
- a required MCP tool listed in the matrix is missing from the generated tool catalog.
- runtime minimums are malformed, out of sync, or lowered without changelog evidence.

## Support Drop Process

Before moving a platform from supported to deprecated or from deprecated to dropped:

- update `compatibility.yaml`;
- update this support matrix;
- update extension warnings or MCP server warnings where applicable;
- update CI/canary coverage if the support boundary changes;
- mention the change in release notes;
- link a compatibility regression or support-drop issue.
