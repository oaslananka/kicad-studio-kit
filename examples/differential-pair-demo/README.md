# Differential Pair Review

## Purpose

Use this KiCad 10 project to rehearse high-speed review UI and MCP flows with a
small board. It demonstrates the Basic schematic and PCB viewer workflow, DRC
and ERC workflow, and MCP connected workflow.

## Files

- `DIFFERENTIAL_PAIR_DEMO.kicad_pro`: KiCad project.
- `DIFFERENTIAL_PAIR_DEMO.kicad_sch`: schematic smoke target for high-speed review navigation.
- `DIFFERENTIAL_PAIR_DEMO.kicad_pcb`: routed PCB smoke target for viewer and DRC review.

## KiCad Version Compatibility

Verified with KiCad CLI `10.0.3`. This demo validates the review workflow shape
only; it is not a production impedance-controlled layout.

## Extension Workflow

1. Open `examples/differential-pair-demo` in VS Code.
2. Open `DIFFERENTIAL_PAIR_DEMO.kicad_pcb` and verify high-speed review panels can reference the active board.
3. Open `DIFFERENTIAL_PAIR_DEMO.kicad_sch` and verify schematic navigation remains available.
4. Run validation commands and inspect how results appear in Problems, status bar, and project views.

## MCP Workflow

Use the MCP connected workflow to run project summary and board-inspection tools
against this folder. Confirm the MCP tools view displays connected state,
capability metadata, and validation results for the active project.

```powershell
$env:KICAD_MCP_PROJECT_DIR = (Get-Location).Path
kicad-mcp-pro --transport http --port 27185
```

## Smoke Commands

```powershell
$kicadCli = 'C:\Program Files\KiCad\10.0\bin\kicad-cli.exe'
New-Item -ItemType Directory -Force exports | Out-Null
& $kicadCli sch erc --format json --output exports\DIFFERENTIAL_PAIR_DEMO-erc.json --severity-all --exit-code-violations DIFFERENTIAL_PAIR_DEMO.kicad_sch
& $kicadCli pcb drc --format json --output exports\DIFFERENTIAL_PAIR_DEMO-drc.json --severity-all --schematic-parity --exit-code-violations DIFFERENTIAL_PAIR_DEMO.kicad_pcb
```

## Expected Outputs

Validation reports are written under `exports/`. Keep generated reports,
screenshots, and MCP logs out of git.
