# Manufacturing Release Wizard

KiCad Studio 2.6.0 adds `KiCad: Manufacturing Release Wizard` for projects connected to a compatible `kicad-mcp-pro` server. The wizard is optional; the existing KiCad-only manufacturing export remains available without MCP.

## Requirements

- A workspace folder containing a KiCad project.
- A connected `kicad-mcp-pro` server satisfying `>=3.0.0 <4.0.0`; `>=3.2.0 <4.0.0` is recommended.
- Workspace trust, because the wizard can invoke local tooling through the MCP server.

## Flow

1. Pick a KiCad variant. If the project has one variant, it is selected automatically. If the project has no variants, the wizard uses the default release variant.
2. Run `project_quality_gate_report` through MCP.
3. Stop when schematic, connectivity, transfer, or manufacturing gates return `FAIL` or `BLOCKED`.
4. Show gate hints from the MCP payload when available.
5. Confirm the intended output folder.
6. Invoke `export_manufacturing_package`.
7. Reveal the output folder on success, or show the structured MCP `error_code`, `message`, and `hint` on failure.

## Failure Handling

When the server returns a structured error, KiCad Studio shows the main message in the notification and links the error code to `docs/troubleshooting.md`. Short hints are shown inline; longer hints stay in the troubleshooting document so notifications remain readable.

## Independence

The wizard never gates KiCad-only viewers, DRC/ERC through `kicad-cli`, BOM/netlist, library search, or standard export commands. If MCP is missing or incompatible, this command is unavailable while the rest of the extension remains usable.
