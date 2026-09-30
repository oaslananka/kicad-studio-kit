# KiCad Studio Marketplace Listing

Issue: #710

This checklist keeps Visual Studio Marketplace and Open VSX presentation tied
to authentic extension-host captures.

## Manual Review Checklist

- Run corepack pnpm --filter kicadstudiokit run marketplace:capture on the
  approved Linux capture host with KiCad CLI available.
- Confirm the capture uses the sanitized pass_i2c_sensor_hub fixture and the
  controlled 1280x720 dark-theme layout.
- Confirm product screenshots are real VS Code Extension Development Host
  captures. Do not use Pillow/canvas-drawn or AI-generated UI as product
  evidence.
- Confirm MARKETPLACE.md remains product-focused: Quick Start, real captures,
  capabilities, compatibility, privacy/network access, and license/support.
- Run corepack pnpm --filter kicadstudiokit run marketplace:check before
  packaging.
- Run corepack pnpm --filter kicadstudiokit run package:validate after
  packaging and verify the packaged README comes from MARKETPLACE.md.

## English Listing Copy

Short description:

KiCad Studio brings KiCad project navigation, schematic and PCB review, DRC/ERC
diagnostics, manufacturing handoff, and guarded MCP workflows into VS Code.

Long description:

KiCad Studio turns VS Code into a practical KiCad workspace for reviewing design
files, running validation, inspecting BOM data, preparing manufacturing outputs,
and connecting compatible MCP tooling while keeping KiCad as the source of
truth.
