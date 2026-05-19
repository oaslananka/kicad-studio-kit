# Migrating From KiCad 9 To KiCad 10

## What Changed

KiCad 10 introduces workflow changes that matter to extension users:

- design variants
- graphical DRC rule files (`.kicad_dru`)
- time-domain tuning metadata
- newer viewer entities such as hop-over display and grouping features
- 3D PDF export support in `kicad-cli`

## Recommended Upgrade Path

1. Update your local KiCad installation to KiCad 10.
2. Update VS Code to 1.99 or newer before installing KiCad Studio 2.7.0.
3. Re-run `KiCad: Detect kicad-cli` so the extension refreshes CLI capability detection.
4. Open the project in KiCad 10 once and save it before testing in VS Code.
5. Confirm that your `.kicad_pro` contains the expected variant data if you plan to use the Variants sidebar.
6. Add or open any `.kicad_dru` file so KiCad Studio can expose it through the DRC Rules view.

## Extension Features To Verify After Migration

- schematic viewer loads `.kicad_sch`
- PCB viewer shows layer metadata
- DRC/ERC commands still run
- 3D PDF export appears only when KiCad 10 is available
- active design variants can be switched
- tuning profiles are visible in the PCB metadata sidebar

## KiCad 10 Checklist

- `KiCad: Detect kicad-cli` reports a KiCad 10.x binary.
- The `Variants` view is visible when a project contains native KiCad 10 variant data.
- `KiCad: Export 3D PDF` appears and succeeds on a board file.
- BOM and export commands can pass an active variant automatically.
- `.kicad_dru` files highlight correctly and show hover help for rule keywords.
- MCP context push includes the active variant and current visible layer set when MCP is enabled.
- Local development and CI use Node.js 24.x/npm 11; extension runtime support is governed by the VS Code engine.

## Known Caveats

- Upstream KiCanvas support for newer KiCad 10 entities may continue to improve over time.
- If an entity renders incompletely in the embedded viewer, use `Open in KiCad` as the source of truth.
- CLI import/export capabilities still depend on the exact `kicad-cli` shipped with the installed KiCad build.
