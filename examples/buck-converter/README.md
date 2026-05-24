# Buck Converter Review

## Purpose

Use this KiCad 10 project to exercise power-stage review flows without a large
board. It demonstrates the Basic schematic and PCB viewer workflow, DRC and ERC
workflow, and BOM and netlist workflow.

## Files

- `BUCK_CONVERTER.kicad_pro`: KiCad project.
- `BUCK_CONVERTER.kicad_sch`: schematic smoke target for component and netlist review.
- `BUCK_CONVERTER.kicad_pcb`: routed PCB smoke target for DRC and layout review.

## KiCad Version Compatibility

Verified with KiCad CLI `10.0.3`. This demo is a workflow sample, not a
production buck-converter reference design.

## Extension Workflow

1. Open `examples/buck-converter` in VS Code.
2. Inspect `BUCK_CONVERTER.kicad_sch` in the schematic viewer.
3. Inspect `BUCK_CONVERTER.kicad_pcb` in the PCB viewer.
4. Use the extension BOM, netlist, and diagnostics surfaces to verify review navigation.

## MCP Workflow

Start KiCad MCP Pro with this folder as `KICAD_MCP_PROJECT_DIR`, then run MCP
tool discovery, project summary, and validation requests from a compatible MCP
client. Stop the server afterward and verify the extension reports the degraded
state cleanly.

```powershell
$env:KICAD_MCP_PROJECT_DIR = (Get-Location).Path
kicad-mcp-pro --transport http --port 27185
```

## Smoke Commands

```powershell
$kicadCli = 'C:\Program Files\KiCad\10.0\bin\kicad-cli.exe'
New-Item -ItemType Directory -Force exports | Out-Null
& $kicadCli sch erc --format json --output exports\BUCK_CONVERTER-erc.json --severity-all --exit-code-violations BUCK_CONVERTER.kicad_sch
& $kicadCli pcb drc --format json --output exports\BUCK_CONVERTER-drc.json --severity-all --schematic-parity --exit-code-violations BUCK_CONVERTER.kicad_pcb
& $kicadCli sch export netlist --format kicadxml --output exports\BUCK_CONVERTER.net BUCK_CONVERTER.kicad_sch
& $kicadCli sch export bom --output exports\BUCK_CONVERTER-bom.csv BUCK_CONVERTER.kicad_sch
```

## Expected Outputs

Generated ERC, DRC, BOM, and netlist files are written under `exports/`. Keep
those files out of git unless a future release-smoke issue promotes a specific
artifact.
