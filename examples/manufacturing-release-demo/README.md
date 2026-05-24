# Manufacturing Release

## Purpose

Use this KiCad 10 project to rehearse release-candidate manufacturing checks. It
demonstrates the DRC and ERC workflow, BOM and netlist workflow, and
Manufacturing export workflow.

## Files

- `MANUFACTURING_RELEASE_DEMO.kicad_pro`: KiCad project.
- `MANUFACTURING_RELEASE_DEMO.kicad_sch`: schematic smoke target for ERC, BOM, and netlist export.
- `MANUFACTURING_RELEASE_DEMO.kicad_pcb`: routed PCB smoke target for DRC, Gerber, and drill export.

## KiCad Version Compatibility

Verified with KiCad CLI `10.0.3`. This demo validates export workflow behavior
and should not be treated as a board fabrication reference.

## Extension Workflow

1. Open `examples/manufacturing-release-demo` in VS Code.
2. Run validation commands from the extension and confirm the manufacturing release gate is visible.
3. Use the project tree to inspect schematic, PCB, BOM, netlist, and manufacturing surfaces.
4. Confirm generated export paths stay under `exports/`.

## MCP Workflow

Start KiCad MCP Pro with this folder selected, then run manufacturing and
validation tools from a compatible MCP client. Use the MCP connected workflow to
confirm the server can inspect the project before exporting.

```powershell
$env:KICAD_MCP_PROJECT_DIR = (Get-Location).Path
kicad-mcp-pro --transport http --port 27185
```

## Smoke Commands

```powershell
$kicadCli = 'C:\Program Files\KiCad\10.0\bin\kicad-cli.exe'
New-Item -ItemType Directory -Force exports | Out-Null
& $kicadCli sch erc --format json --output exports\MANUFACTURING_RELEASE_DEMO-erc.json --severity-all --exit-code-violations MANUFACTURING_RELEASE_DEMO.kicad_sch
& $kicadCli pcb drc --format json --output exports\MANUFACTURING_RELEASE_DEMO-drc.json --severity-all --schematic-parity --exit-code-violations MANUFACTURING_RELEASE_DEMO.kicad_pcb
& $kicadCli sch export netlist --format kicadxml --output exports\MANUFACTURING_RELEASE_DEMO.net MANUFACTURING_RELEASE_DEMO.kicad_sch
& $kicadCli sch export bom --output exports\MANUFACTURING_RELEASE_DEMO-bom.csv MANUFACTURING_RELEASE_DEMO.kicad_sch
& $kicadCli pcb export gerbers --board-plot-params --output exports\gerbers MANUFACTURING_RELEASE_DEMO.kicad_pcb
& $kicadCli pcb export drill --output exports\drill --generate-report --report-path exports\drill\MANUFACTURING_RELEASE_DEMO-drill.rpt MANUFACTURING_RELEASE_DEMO.kicad_pcb
```

## Expected Outputs

Generated ERC, DRC, BOM, netlist, Gerber, and drill outputs are written under
`exports/`. Do not commit those artifacts.
