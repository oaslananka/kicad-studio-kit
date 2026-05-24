# LED Basic

## Purpose

Use this compact KiCad 10 project as the first smoke target for KiCad Studio and
KiCad MCP Pro. It demonstrates the Basic schematic and PCB viewer workflow, DRC
and ERC workflow, and BOM and netlist workflow without requiring a large board.

## Files

- `KICAD_TEST.kicad_pro`: KiCad project.
- `KICAD_TEST.kicad_sch`: schematic with a two-pin input, current-limiting resistor, LED, and ground net.
- `KICAD_TEST.kicad_pcb`: routed PCB suitable for viewer, DRC, and manufacturing-export smoke commands.

## KiCad Version Compatibility

Verified with KiCad CLI `10.0.3`. The files use KiCad 10 project, schematic,
and PCB formats and are intended as small demo assets rather than a reference
electrical design.

## Extension Workflow

1. Open `examples/led-basic` in VS Code.
2. Open `KICAD_TEST.kicad_sch` and verify the schematic viewer fits the sheet.
3. Open `KICAD_TEST.kicad_pcb` and verify the PCB viewer, zoom controls, layer state, and project tree.
4. Run the extension validation commands and confirm DRC/ERC status is visible in the UI.

## MCP Workflow

The MCP connected workflow uses this project as a read-only board inspection
target. The MCP degraded workflow can be exercised by starting the extension
without the server and confirming the UI keeps project files inspectable.

```powershell
$env:KICAD_MCP_PROJECT_DIR = (Get-Location).Path
kicad-mcp-pro --transport http --port 27185
```

## Smoke Commands

```powershell
$kicadCli = 'C:\Program Files\KiCad\10.0\bin\kicad-cli.exe'
New-Item -ItemType Directory -Force exports | Out-Null
& $kicadCli sch erc --format json --output exports\KICAD_TEST-erc.json --severity-all --exit-code-violations KICAD_TEST.kicad_sch
& $kicadCli pcb drc --format json --output exports\KICAD_TEST-drc.json --severity-all --schematic-parity --exit-code-violations KICAD_TEST.kicad_pcb
& $kicadCli sch export netlist --format kicadxml --output exports\KICAD_TEST.net KICAD_TEST.kicad_sch
& $kicadCli sch export bom --output exports\KICAD_TEST-bom.csv KICAD_TEST.kicad_sch
& $kicadCli pcb export gerbers --board-plot-params --output exports\gerbers KICAD_TEST.kicad_pcb
& $kicadCli pcb export drill --output exports\drill --generate-report --report-path exports\drill\KICAD_TEST-drill.rpt KICAD_TEST.kicad_pcb
```

## Expected Outputs

Generated reports and manufacturing files are written under `exports/`, which is
ignored by git. Keep screenshots or rendered outputs outside the repository
unless a future release smoke workflow explicitly promotes them.
