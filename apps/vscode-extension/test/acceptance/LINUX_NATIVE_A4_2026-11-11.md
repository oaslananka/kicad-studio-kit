# Native Linux A4 — real KiCad 10 project-to-report acceptance

**Scoped result: the successful end-to-end local export path PASSED; the complete A4 milestone remains PARTIAL because native error/retry recovery and every supported project shape are not yet accepted.** This document records a locally executed test, not a claim about production cloud review or manufacturing clearance.

## Executed native acceptance — 2026-11-11

- Host: Linux (MSI), supported Node 24.22.1, actual KiCad CLI 10.0.8 and isolated VS Code Extension Development Host 1.122.0 under Xvfb/Chrome.
- Source: installed authentic `/usr/share/kicad/demos/royalblue54L_feather` multi-sheet schematic plus PCB. The fixture was copied into a disposable VS Code workspace; real user projects, profiles and external accounts were untouched.
- Test: `test/e2e/nativeA4ProjectToReport.local.test.ts` opt-in native Playwright **1/1 PASS** (37.1 seconds; total 37.8 seconds).
- Verified user actions on the live VS Code UI: discover KiCad project, open schematic, invoke ERC from Command Palette and read `kicad-cli:erc` Problems; open PCB, invoke DRC and read `kicad-cli:drc` Problems; export a nonempty BOM CSV and a real `%PDF-` schematic PDF under the disposable local `fab/` folder.
- Independent real KiCad 10 CLI comparison: **59/59 BOM component references identical**, no missing and no extra references. This verifies reference membership for this sample; it does not establish every BOM field or manufacturing readiness.
- Original and disposable schematic/PCB/project file SHA-256 fingerprints remained unchanged during the entire UI run.
- The extension now uses real KiCad CLI BOM export for hierarchical schematics, validates the schema and row format before presenting output, and never silently treats an incomplete root-only scan as a complete hierarchical BOM. Single-sheet parser behavior remains local.
- Real VS Code Marketplace screenshots were recaptured by the checked-in native capture workflow after command-menu changes; docs gallery was synchronized by the docs generator. Screenshots are not substituted for the A4 run evidence.

## Reproduce without touching the personal VS Code profile

From the repository root, with Node 24 and the installed KiCad 10 demo:

```bash
corepack pnpm --filter kicadstudiokit run build
export KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE=1
export KICADSTUDIO_PLAYWRIGHT_CHANNEL=chrome
xvfb-run -a corepack pnpm --dir apps/vscode-extension exec playwright test --config playwright.config.ts test/e2e/nativeA4ProjectToReport.local.test.ts --reporter=list
```

The test skips unless deliberately opted in with the authentic local fixture and native tools. **SKIP is not PASS**.

## Remaining A4 acceptance boundary

- Native user-visible failure recovery: missing/incompatible CLI, invalid/incomplete KiCad project, unwritable output directory, dismissed dialog and retry after repair are **NOT VERIFIED** in this native E2E.
- This run verifies local CSV/PDF existence and 59 reference IDs, not full BOM metadata truth, Gerber/fabrication package, all report exporters, all OS hosts or approved handoff to a manufacturer.
- No external upload, BoardReadyOps cloud review, signed approval or shipment was carried out. The independent #623 governance acceptance remains open.
- A1 full control matrix, A2 true complete 16/32-layer geometry/connectivity, and A3 physical HiDPI/responsive accessibility are not upgraded by this A4 test.

**Acceptance rule:** keep A4 overall PARTIAL until a native failure/recovery flow is exercised against a disposable project and the user-visible retry/cleanup is proven, without weakening quality gates or source integrity.
