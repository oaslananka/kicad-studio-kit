# KiCad Studio and KiCad MCP Pro Integration

KiCad Studio integrates with `kicad-mcp-pro` as an optional capability for AI-assisted design review, rule editing, project automation, quality gates, and manufacturing release workflows.

## Compatibility

For supported KiCad, MCP protocol, and `kicad-mcp-pro` versions, consult the [current support matrix](https://oaslananka.github.io/kicad-studio-kit/support-matrix.html) and [extension guide](https://oaslananka.github.io/kicad-studio-kit/extension/). These are updated with the released extension rather than pinning a historical compatibility range in this bundled guide.

An incompatible MCP server disables MCP-dependent commands without disabling KiCad-only workflows.

## Discovery

KiCad Studio checks for **existing installations** without downloading or installing a server:

- Installed `uv` tools (`uv tool list`) and the corresponding `kicad-mcp-pro version` executable.
- `kicad-mcp-pro version` on the executable path or in supported user-local installation paths.
- Python package metadata (`pip show kicad-mcp-pro` or `python -m pip show kicad-mcp-pro`).
- `pipx list`.

Detection does not run `uvx`, because it could download a package instead of reporting the actual installed version.

## Canonical Links

- Repository: https://github.com/oaslananka/kicad-studio-kit/tree/main/apps/vscode-extension
- MCP server: https://oaslananka.github.io/kicad-mcp-pro/
- Support matrix: https://oaslananka.github.io/kicad-studio-kit/support-matrix.html
- Manufacturing export docs: https://oaslananka.github.io/kicad-studio-kit/workflows/manufacturing-export.html
