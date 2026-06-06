# Troubleshooting

## MCP Incompatible

KiCad Studio 1.4.1 supports `kicad-mcp-pro >=3.5.2 <4.0.0` and recommends the same range. If the status bar shows an incompatible server, install the matching server release, review the repository support matrix, and retry the MCP connection.

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

## KiCad CLI Unavailable (Local/Extension UX)

If the local `kicad-cli` is not found on your system, the extension runs in a degraded mode. The following features will be disabled or blocked:

- **ERC/DRC Checks**: Schematic Electrical Rules Checker and PCB Design Rules Checker.
- **Manufacturing Exports**: Generating Gerbers, Drill Files, IPC-2581, ODB++, SVG, PDF, BOM, and Netlists.
- **3D Exports**: Exporting STEP, STL, VRML, U3D, GLB, and PLY formats.
- **Third-Party Imports**: Importing Altium, Eagle, PADS, CADSTAR, SolidWorks, and Fabmaster boards.
- **Jobset Runner**: Running automated batch configuration and export runs (.kicad_jobset).
- **Auto-Fixes**: MCP tools requiring KiCad execution.

_To restore these features, install KiCad 10.0.x on your local machine and ensure `kicad-cli` is added to your system PATH or configured explicitly in `kicadstudio.cliPath`._
