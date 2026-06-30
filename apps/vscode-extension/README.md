![KiCad Studio marketplace hero](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/marketplace/hero.png)

# KiCad Studio Kit

**A focused VS Code workspace for professional KiCad review, validation, manufacturing handoff, and AI-assisted MCP workflows.**

[![CI](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/codeql.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/codeql.yml)
[![Security](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/security.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/oaslananka/kicad-studio-kit/badge)](https://scorecard.dev/viewer/?uri=github.com/oaslananka/kicad-studio-kit)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13405/badge)](https://www.bestpractices.dev/projects/13405)

[![Open VSX](https://img.shields.io/open-vsx/v/oaslananka/kicadstudiokit?label=Open%20VSX)](https://open-vsx.org/extension/oaslananka/kicadstudiokit)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-install-blue)](https://marketplace.visualstudio.com/items?itemName=oaslananka.kicadstudiokit)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/oaslananka/kicad-studio-kit/blob/main/LICENSE)

KiCad Studio turns VS Code into a KiCad-aware engineering cockpit: project navigation, schematic and PCB inspection, DRC/ERC review, repeatable release outputs, and MCP readiness for AI-assisted workflows.

- Extension ID: `oaslananka.kicadstudiokit`
- Version: `1.9.3`
- Supported KiCad projects: KiCad 8.x, 9.x, and 10.x project, schematic, PCB, DRC, and jobset files
- Supported MCP server: `kicad-mcp-pro >=3.5.2 <4.0.0`
- Canonical repository: https://github.com/oaslananka/kicad-studio-kit/tree/main/apps/vscode-extension

## Quick Start

1. Install **KiCad Studio** from the Visual Studio Marketplace or Open VSX.
2. Open a folder containing a `.kicad_pro`, `.kicad_sch`, or `.kicad_pcb` file.
3. Run **KiCad: Detect kicad-cli** if KiCad is not already available on `PATH`.
4. Open a schematic or PCB file to inspect the design inside VS Code.
5. Run **KiCad: Run DRC** or **KiCad: Run ERC** to populate Problems and validation views.
6. Optional: start `kicad-mcp-pro` and connect your AI client with the generated `.vscode/mcp.json` schema.

## Core Workflow

![Open a project, inspect the PCB, and run DRC](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/marketplace/core-workflow.gif)

## Feature Matrix

| Workflow                 | KiCad Studio                                                                                         | Engineering value                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Project navigation       | Native VS Code sidebar for KiCad projects, boards, schematics, jobsets, rules, and generated outputs | Keeps hardware and software workspace context together                         |
| Schematic and PCB review | Custom editors with KiCad-aware controls and CLI fallback paths                                      | Inspect design files without losing KiCad as the source of truth               |
| DRC/ERC validation       | Problems integration, freshness state, quality gates, and focused validation views                   | Separates fresh failures from stale reports                                    |
| Manufacturing handoff    | Repeatable BOM, netlist, plot, drill, and jobset-driven export commands                              | Turns review output into reproducible release artifacts                        |
| MCP readiness            | `kicad-mcp-pro` discovery, version gating, tool status, and workspace context                        | Keeps AI-assisted commands safe when the MCP server is missing or incompatible |
| Localization             | Marketplace copy plus extension string infrastructure                                                | Prepared for maintained user-facing locales                                    |

## Screenshots

### Project Tree

![KiCad Studio project tree](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/screenshots/project-tree.png)

### Schematic Viewer

![KiCad Studio schematic viewer](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/screenshots/schematic-viewer.png)

### PCB Viewer

![KiCad Studio PCB viewer](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/screenshots/pcb-viewer.png)

### DRC Results

![KiCad Studio DRC results](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/screenshots/drc-results.png)

### MCP Tools Dashboard

![KiCad Studio MCP tools dashboard](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/screenshots/mcp-tools-dashboard.png)

## KiCad CLI-Only Comparison

| Workflow             | KiCad CLI-only                                                     | KiCad Studio                                                               |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Open project context | Requires remembering paths, commands, and output locations         | Discovers KiCad project structure inside the active VS Code workspace      |
| Inspect design state | Exports or external KiCad windows are needed for most review loops | Keeps schematic and PCB review next to source changes                      |
| Run DRC/ERC          | Terminal output and report files must be correlated manually       | Problems, validation views, and quality gates show actionable diagnostics  |
| Share AI context     | Scripts must manually expose project files and tool capabilities   | MCP dashboard gates compatible `kicad-mcp-pro` tools and workspace context |

## MCP Compatibility

KiCad Studio 1.9.3 supports `kicad-mcp-pro >=3.5.2 <4.0.0` and was tested against `3.9.2`. If a connected server reports a version outside the required range, MCP-dependent commands are disabled while KiCad-only features continue to work.

## Marketplace Listing Copy

The manual Marketplace and Open VSX checklist and English short/long listing copy live in [docs/marketplace-listing.md](docs/marketplace-listing.md).

## Release Notes

Release notes for Marketplace and Open VSX users live in [CHANGELOG.md](CHANGELOG.md).

## Local Development

```powershell
corepack enable
corepack pnpm run dev:doctor -- --ci
corepack pnpm install --frozen-lockfile
corepack pnpm --filter kicadstudiokit run marketplace:check
corepack pnpm --filter kicadstudiokit run build
corepack pnpm --filter kicadstudiokit run package
```

## Marketplace Dry Run

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter kicadstudiokit run marketplace:check
corepack pnpm --filter kicadstudiokit run build
corepack pnpm --filter kicadstudiokit run package
corepack pnpm --filter kicadstudiokit exec vsce ls --tree --no-dependencies
```

## Support and Sponsorship

Use GitHub Issues for reproducible bugs, feature requests, Marketplace rendering problems, and KiCad compatibility reports. Include the KiCad version, operating system, extension version, and the command or file type that reproduced the issue.

Commercial users who rely on KiCad Studio for release, manufacturing, or AI-assisted review workflows can sponsor continued development through the repository sponsor links and support channels.
