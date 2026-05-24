# USB-C Power Intake

## Purpose

Use this KiCad 10 project to rehearse a compact power-input review flow before
working with a larger USB-C design. It demonstrates the Basic schematic and PCB
viewer workflow, DRC and ERC workflow, and MCP degraded workflow with small files
that are easy to inspect in code review.

## Files

- `USB_C_POWER.kicad_pro`: KiCad project.
- `USB_C_POWER.kicad_sch`: schematic smoke target for power-input review steps.
- `USB_C_POWER.kicad_pcb`: routed PCB smoke target for board viewer, DRC, and export checks.

## KiCad Version Compatibility

Verified with KiCad CLI `10.0.3`. This demo is intentionally small and is not a
production USB-C reference design; use it to validate workflow behavior,
diagnostic surfaces, and file handling.

## Extension Workflow

1. Open `examples/usb-c-power` in VS Code.
2. Open `USB_C_POWER.kicad_sch` and verify the schematic viewer loads without generated reports.
3. Open `USB_C_POWER.kicad_pcb` and verify fit-to-screen, zoom, and project tree behavior.
4. Run validation commands and confirm power-review diagnostics are displayed without blocking navigation.

## MCP Workflow

Run the MCP connected workflow when a local server is available. For the MCP
degraded workflow, stop the server and confirm KiCad Studio still opens the
project, explains the unavailable MCP state, and keeps read-only project
inspection available.

```powershell
$env:KICAD_MCP_PROJECT_DIR = (Get-Location).Path
kicad-mcp-pro --transport http --port 27185
```

## Smoke Commands

```powershell
$kicadCli = 'C:\Program Files\KiCad\10.0\bin\kicad-cli.exe'
New-Item -ItemType Directory -Force exports | Out-Null
& $kicadCli sch erc --format json --output exports\USB_C_POWER-erc.json --severity-all --exit-code-violations USB_C_POWER.kicad_sch
& $kicadCli pcb drc --format json --output exports\USB_C_POWER-drc.json --severity-all --schematic-parity --exit-code-violations USB_C_POWER.kicad_pcb
```

## Expected Outputs

ERC and DRC reports are generated under `exports/`. Do not commit generated
reports, screenshots, or local MCP logs from this example.
