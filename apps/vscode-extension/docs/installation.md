# Installation

## Requirements

- VS Code 1.95 or newer
- Node.js 20 or newer for local development
- KiCad 6 or newer for basic support
- KiCad 10 for variants, tuning metadata, and 3D PDF export

## KiCad CLI Setup

### Windows

KiCad Studio checks common KiCad install locations under `Program Files` and `Program Files (x86)`, including KiCad 10.

If auto-detection fails:

1. Open VS Code settings.
2. Search for `kicadstudio.kicadCliPath`.
3. Set the full path to `kicad-cli.exe`.

### macOS

The extension checks the KiCad app bundle plus common Homebrew paths.

### Linux

The extension checks:

- `/usr/bin/kicad-cli`
- `/usr/local/bin/kicad-cli`
- `/snap/bin/kicad-cli`
- `flatpak run --command=kicad-cli org.kicad.KiCad`
- `~/.local/bin/kicad-cli`

## MCP Setup

If `kicad-mcp-pro` is installed:

1. Run `KiCad: Setup MCP Integration`.
2. Review or accept the generated `.vscode/mcp.json`.
3. Configure `kicadstudio.mcp.endpoint` if you use HTTP mode.

## CI/CD Note

- `oaslananka/kicad-studio-kit` owns the automated CI/CD workflows.
- Dependency maintenance is handled by Renovate and normal pull request checks.
