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
| VS Code minimum | `1.99.0` |
| Node | `>=24.11.0 <25` |
| pnpm | `>=11.0.0 <12` |
| Python | `>=3.12` |
| MCP protocol | `2025-11-25` |

### KiCad Support

| Range | State | CI | Notes |
| --- | --- | --- | --- |
| 10.0.x | primary | required | Primary optimized KiCad CLI and file-format target. |
| 9.x | supported | scheduled | Core PCB, schematic, validation, and export workflows remain supported. |
| 8.x | deprecated | manual | File-level read and migration support only; removal requires a release note. |

### Product Versions

| Product | Version | Manifest | Compatibility range |
| --- | --- | --- | --- |
| kicad-studio | 1.0.0 | apps/vscode-extension/package.json | >=1.0.0 <2.0.0 |
| kicad-mcp-pro | 1.0.0 | packages/mcp-server/pyproject.toml | >=1.0.0 <2.0.0 |

### Release Gate Inputs

- compatibility.yaml validates
- Product versions match release manifests
- Extension MCP compatibility range matches embedded compatibility metadata
- MCP protocol and tool schema metadata match server discovery metadata
- Required MCP tools exist in the generated tool reference
- KiCad, VS Code, Node, pnpm, and Python support ranges match package metadata

<!-- docs-site:compatibility:end -->

## Lifecycle States

| State      | Meaning                                                               |
| ---------- | --------------------------------------------------------------------- |
| Primary    | Actively optimized and release-blocking in compatibility gates.       |
| Supported  | Expected to work and covered by scheduled or product-specific checks. |
| Deprecated | Still handled where practical, but support removal may be scheduled.  |
| Dropped    | Not tested, not supported, and only mentioned for migration context.  |

## Current Platform Policy

| Surface      | Primary    | Supported             | Deprecated | Gate                                     |
| ------------ | ---------- | --------------------- | ---------- | ---------------------------------------- |
| KiCad        | 10.0.x     | 9.x                   | 8.x        | `compatibility.yaml` + release preflight |
| VS Code      | current    | `engines.vscode` 1.99 | none       | extension manifest + VS Code canary      |
| MCP protocol | 2025-11-25 | 2025-11-25            | older      | well-known server card + matrix          |
| Node         | 24.x       | `>=24.11.0 <25`       | older      | root and extension package metadata      |
| pnpm         | 11.x       | `>=11.0.0 <12`        | older      | root package metadata                    |
| Python       | 3.12       | 3.12, 3.13            | older      | `pyproject.toml` and CI                  |

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

- `packages/mcp-server/pyproject.toml` `requires-python` is the MCP server install-time floor.
- The supported Python window is two minor versions wide for the current stable product line.
- The current 1.0.x line remains pinned to Python 3.12 and 3.13 until Python 3.14 validation is
  complete; the drift workflow opens a tracking issue when the official bugfix window moves.
- Lowering the floor is blocked in CI unless `packages/mcp-server/CHANGELOG.md` changes in the
  same PR with compatibility context.

KiCad:

- `compatibility.yaml` declares the primary KiCad line, supported previous line, deprecated line,
  and latest verified patch release.
- The primary KiCad line should match the official current stable line once the canary lane is
  green.
- Lowering the primary line or widening support back to an older line requires both product
  changelogs because it changes extension UX and MCP server behavior.

Authoritative drift sources are declared in `compatibility.yaml` under `runtimePolicy.sources`:

- VS Code stable and insiders release feeds from `update.code.visualstudio.com`.
- Python release lifecycle metadata from `peps.python.org/api/python-releases.json`.
- KiCad current release text from `kicad.org/download/linux`.

## Automated Drift Detection

Runtime drift is enforced by `packages/mcp-server/scripts/runtime_policy.py` and
`.github/workflows/runtime-drift.yml`.

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
corepack pnpm run check:compatibility
Push-Location packages/mcp-server
corepack pnpm run release:check
Pop-Location
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
