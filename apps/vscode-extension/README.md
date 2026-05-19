# KiCad Studio

Canonical repository: https://github.com/oaslananka/kicad-studio-kit/tree/main/apps/vscode-extension

- Extension ID: `oaslananka.kicadstudio`
- Version: `1.0.0`
- Supported MCP: `kicad-mcp-pro >=1.0.0 <2.0.0`

KiCad Studio turns VS Code into a KiCad workspace for viewing schematics and PCBs, running checks, exporting manufacturing outputs, searching libraries, and optionally connecting AI workflows through `kicad-mcp-pro`.

## MCP Compatibility

KiCad Studio 1.0.0 supports `kicad-mcp-pro >=1.0.0 <2.0.0` and was tested against `1.0.0`. If a connected server reports a version outside the required range, MCP-dependent commands are disabled while KiCad-only features continue to work.

## Local Development

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter kicadstudio run build
corepack pnpm --filter kicadstudio run package
```

## Marketplace Dry Run

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter kicadstudio run build
corepack pnpm --filter kicadstudio run package
$vsix = Get-ChildItem -Path apps/vscode-extension -Filter *.vsix -Recurse | Sort-Object LastWriteTime | Select-Object -Last 1
corepack pnpm --filter kicadstudio exec vsce ls --tree --no-dependencies
```
