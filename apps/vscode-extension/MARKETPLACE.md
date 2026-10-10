# KiCad Studio Kit

**Review, validate, and prepare KiCad projects without leaving Visual Studio Code.**

KiCad Studio Kit adds KiCad-aware project navigation, schematic and PCB viewers,
DRC/ERC diagnostics, BOM and manufacturing workflows, plus guarded MCP
integration for AI-assisted engineering.

## Quick Start

1. Install **KiCad Studio Kit**.
2. Open a folder containing a .kicad_pro, .kicad_sch, or .kicad_pcb file.
3. Make sure kicad-cli is available on PATH, or run **KiCad: Detect kicad-cli**.
4. Open a schematic or PCB directly in VS Code.
5. Run DRC/ERC from the Command Palette or the KiCad Studio sidebar.

## What You Get

- **Project context in one sidebar** — projects, schematics, boards, validation,
  BOM, netlists, variants, libraries, rules, and MCP status.
- **Real design review surfaces** — schematic and PCB custom editors with
  KiCanvas and explicit CLI fallback paths.
- **Validation where you work** — DRC/ERC results flow into VS Code Problems and
  KiCad Studio validation views.
- **Release-oriented tooling** — BOM, netlist, plot, drill, jobset, and
  manufacturing package workflows.
- **Fail-closed MCP integration** — MCP-dependent features stay disabled when
  the configured server is missing or incompatible.

## Real Product Captures

These images are captured from the real VS Code Extension Development Host using
the repository's sanitized KiCad fixture project. They are not AI-generated UI
mockups.

### Project workspace

![KiCad Studio project workspace](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/screenshots/project-tree.png)

### Schematic review

![KiCad Studio schematic viewer](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/screenshots/schematic-viewer.png)

### PCB review

![KiCad Studio PCB viewer](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/screenshots/pcb-viewer.png)

### DRC in VS Code Problems

![KiCad Studio DRC results](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/screenshots/drc-results.png)

### Bill of Materials

![KiCad Studio Bill of Materials](https://raw.githubusercontent.com/oaslananka/kicad-studio-kit/main/apps/vscode-extension/assets/screenshots/bom-table.png)

## Requirements and Compatibility

- Visual Studio Code ^1.101.0
- KiCad project formats from KiCad 8.x, 9.x, and 10.x
- kicad-cli for CLI-backed validation and export workflows
- Optional MCP integration: kicad-mcp-pro >=3.5.2 <5.0.0

MCP integration currently uses protocol `2025-11-25`; the `2026-07-28`
protocol remains disabled pending separately verified activation.

KiCad remains the source of truth for design files. Viewer fallback and
compatibility state are surfaced explicitly instead of silently substituting
unsupported behavior.

## Privacy and Network Access

KiCad Studio telemetry is **off by default**. Sending telemetry also requires an
explicitly configured telemetry endpoint.

Network access can occur when you explicitly use features backed by external
services, including MCP endpoints, configured AI providers, component search
providers, KiCad package repositories, or documentation links. Review those
integrations and their credentials before enabling them.

## License and Support

Current project-authored source is licensed under **PolyForm Noncommercial
1.0.0**. Commercial use requires a separate written license. Earlier revisions
published under MIT retain the rights granted for those versions.

Use the repository's GitHub Issues for reproducible bugs, compatibility reports,
and feature requests. Include your KiCad version, operating system, extension
version, and the command or file type that reproduced the issue.
