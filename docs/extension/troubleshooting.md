# Extension Troubleshooting

## KiCad CLI Not Found

Run `KiCad: Detect kicad-cli` from the command palette, or set
`kicadstudio.kicadCliPath` in the extension settings. The supported KiCad version policy is
documented in the [support matrix](../support-matrix.md).

## Workspace Trust Blocks Commands

Restricted Workspace Trust keeps read-only language and viewer features available, but disables
commands that launch local processes or write generated files. Manage trust from VS Code with
`workbench.action.manageTrust`.

## Viewer Does Not Render

Check that the workspace contains a valid `.kicad_sch` or `.kicad_pcb` file and that the file is
not empty or malformed. Viewer behavior and rendering fallback policy are covered by the generated
viewer and test strategy references:

- [Extension views](views.md)
- [Testing strategy](../testing-strategy.md)
- [Performance baselines](../performance-baselines.md)

## MCP Tools Are Disconnected

Use the MCP Tools view to inspect endpoint, transport, profile, server-info, and capability state.
For setup details, see:

- [MCP overview](../mcp/)
- [MCP transport](../mcp/transport.md)
- [KiCad Studio MCP integration](../integration/kicad-studio-mcp.md)

## Error Reporting

Telemetry and error reporting are opt-in and disabled by default. The policy and event classes are
documented in [telemetry and error reporting](../telemetry.md).
