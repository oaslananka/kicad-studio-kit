# MCP Workflow Demo

## Purpose

Use this KiCad 10 project to validate MCP client setup and fallback behavior
with a small board. It demonstrates the Basic schematic and PCB viewer workflow,
MCP connected workflow, and MCP degraded workflow.

## Files

- `MCP_DEMO.kicad_pro`: KiCad project.
- `MCP_DEMO.kicad_sch`: schematic smoke target for MCP project summary and validation tools.
- `MCP_DEMO.kicad_pcb`: routed PCB smoke target for board inspection tools.

## KiCad Version Compatibility

Verified with KiCad CLI `10.0.3`. This demo is intentionally small so MCP client
setup problems are easier to isolate.

## Extension Workflow

1. Open `examples/mcp-demo` in VS Code.
2. Open `MCP_DEMO.kicad_sch` and `MCP_DEMO.kicad_pcb`.
3. Open the MCP tools view and verify connected, disconnected, and degraded states.
4. Confirm the project remains inspectable when the MCP server is unavailable.

## MCP Workflow

Start the server for the MCP connected workflow, then point a compatible client
at `http://127.0.0.1:27185/mcp`. Stop the server for the MCP degraded workflow
and confirm clients report a clean connection failure.

```powershell
$env:KICAD_MCP_PROJECT_DIR = (Get-Location).Path
kicad-mcp-pro --transport http --port 27185
```

## Smoke Commands

```powershell
$kicadCli = 'C:\Program Files\KiCad\10.0\bin\kicad-cli.exe'
New-Item -ItemType Directory -Force exports | Out-Null
& $kicadCli sch erc --format json --output exports\MCP_DEMO-erc.json --severity-all --exit-code-violations MCP_DEMO.kicad_sch
& $kicadCli pcb drc --format json --output exports\MCP_DEMO-drc.json --severity-all --schematic-parity --exit-code-violations MCP_DEMO.kicad_pcb
```

## Expected Outputs

Generated reports, screenshots, and MCP logs stay under `exports/` or another
ignored local path. Do not commit runtime output from this example.
