# Configuration

Configuration is resolved in this order:

1. CLI arguments
2. Environment variables
3. `.env`
4. `~/.config/kicad-mcp-pro/config.toml`
5. Built-in defaults

The active project can also be changed at runtime with `kicad_set_project()`.

## CLI Diagnostics

```bash
kicad-mcp-pro health --json
kicad-mcp-pro doctor --json
kicad-mcp-pro version --json
```

`health --json` is a fast install/configuration check and does not require a
running KiCad IPC server. `doctor --json` adds deeper KiCad CLI and IPC probes
but reports unavailable KiCad as a degraded diagnostic state instead of printing
a stack trace.

## Environment Aliases

Existing `KICAD_MCP_*` variables continue to work. The server also accepts these
interop aliases for launchers and editors:

| Alias | Internal field |
|---|---|
| `KICAD_API_TOKEN` | KiCad IPC token |
| `KICAD_CLI_PATH` | `kicad-cli` path |
| `KICAD_MCP_TIMEOUT_MS` | IPC timeout in milliseconds |
| `KICAD_MCP_RETRIES` | IPC connection retries |
| `KICAD_MCP_HEADLESS` | Headless preference |
| `KICAD_MCP_WORKSPACE_ROOT` | Workspace root for path safety |

Diagnostics only report whether tokens are configured. Token values are never
printed.

## Workspace Safety

When `KICAD_MCP_WORKSPACE_ROOT` is set, project artifact reads and writes must
stay under that root. Without an explicit workspace root, the active project root
is used for normal project artifacts and the current working directory is the
fallback before a project is selected.
