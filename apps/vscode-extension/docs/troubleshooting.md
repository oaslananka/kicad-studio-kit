# Troubleshooting

## MCP Incompatible

KiCad Studio 2.7.0 supports `kicad-mcp-pro >=3.0.0 <4.0.0` and recommends `>=3.2.0 <4.0.0`. If the status bar shows an incompatible server, upgrade the server and retry the MCP connection.

## cli-timeout

`kicad-cli` did not finish within the server timeout. Confirm that the project opens in KiCad, raise the MCP-side timeout if needed, and retry the operation.

## cli-unavailable

The MCP server could not find `kicad-cli`. Set `KICAD_MCP_KICAD_CLI` to an absolute executable path or install KiCad on the machine running `kicad-mcp-pro`.

## validation-failed

The requested MCP operation failed a project or payload validation check. Review the notification hint, run the Quality Gates view, and fix any blocking schematic, connectivity, transfer, or manufacturing rows before retrying.

## configuration-error

The MCP server rejected the current environment or project configuration. Check `.vscode/mcp.json`, especially `KICAD_MCP_PROJECT_DIR`, `KICAD_MCP_PROFILE`, and transport settings.

## cli-command-failed

The MCP server invoked a KiCad CLI command that exited unsuccessfully. Open the KiCad Studio MCP log, inspect the redacted request/response pair, and reproduce the equivalent KiCad CLI command if needed.

## tool-execution-failed

The MCP server accepted the request but the tool failed during execution. Re-run the relevant quality gate, inspect the structured hint, and retry after correcting the blocking condition.
