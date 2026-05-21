# Support Matrix

`compatibility.yaml` is the source of truth for KiCad Studio Kit compatibility metadata. Release dry-runs and CI validate that this matrix stays synchronized with package metadata, extension compatibility code, MCP discovery metadata, and the generated MCP tool catalog.

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

## Support Drop Process

Before moving a platform from supported to deprecated or from deprecated to dropped:

- update `compatibility.yaml`;
- update this support matrix;
- update extension warnings or MCP server warnings where applicable;
- update CI/canary coverage if the support boundary changes;
- mention the change in release notes;
- link a compatibility regression or support-drop issue.
