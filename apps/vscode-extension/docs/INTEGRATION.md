# KiCad Studio and KiCad MCP Pro Integration

KiCad Studio integrates with `kicad-mcp-pro` as an optional capability for AI-assisted design review, rule editing, project automation, quality gates, and manufacturing release workflows.

## Compatibility

KiCad Studio 1.8.0 requires and recommends `kicad-mcp-pro >=3.5.2 <4.0.0`. The extension was tested against `3.9.2`.

## Discovery

The extension checks:

- `uvx kicad-mcp-pro --version`
- `kicad-mcp-pro --version`
- `pip show kicad-mcp-pro`

## Canonical Links

- Repository: https://github.com/oaslananka/kicad-studio-kit/tree/main/apps/vscode-extension
- MCP server: https://oaslananka.github.io/kicad-mcp-pro/
- Manufacturing export docs: https://oaslananka.github.io/kicad-studio-kit/workflows/manufacturing-export/
