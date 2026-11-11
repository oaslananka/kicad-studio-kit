# Native A1 — first-open BOM Command Palette discovery

**Scoped acceptance: PASS for immediate CSV/XLSX BOM command visibility after opening an authentic KiCad schematic. A1 overall remains PARTIAL / NOT ACCEPTED.**

## Reproduced customer friction (before fix)

- Linux, installed KiCad CLI 10.0.8 and isolated real VS Code 1.122.0 Extension Development Host, using the official RoyalBlue54L Feather KiCad multi-sheet schematic/PCB demo in a disposable workspace.
- Opening the schematic and immediately searching `>Bill of Materials` in the first Command Palette invocation returned **"No matching commands"**. Only a later palette invocation, after additional delay, showed the CSV and XLSX export commands. The earlier full A4 happy-path test first ran ERC/DRC and therefore could not establish immediate first-open discoverability.

## Correction and new native evidence

- The workspace controller now publishes cheap, editor-specific visibility contexts (schematic open, PCB open and actual workspace trust) promptly when focus/tabs change. The slow, debounced project/AI/CLI discovery still runs separately. Lightweight updates are coalesced to avoid flooding VS Code with context mutations. A completed deep refresh reconciles against the _current_ visible tab, not its possibly stale initial snapshot.
- Rebuilt product; native `test/e2e/nativeA1DirectBom.local.test.ts` **1/1 PASS in 11.5 seconds** on the same real KiCad/VS Code host. The **first** Command Palette search immediately after opening the schematic returned **both `KiCad: Export Bill of Materials (CSV)` and `(XLSX)`** within the native test's 2.5-second visibility limit. No ERC, DRC, focus-switch workaround, direct command execution or repeated menu attempt.
- Focused Jest tests verify that visibility updates occur before slow refresh, report schematic/PCB contexts correctly and preserve the _untrusted_ workspace visibility state; no privilege is granted by showing a command. The runtime `registerTrustedCommand` guard remains authoritative for export execution; no security threshold was removed.
- Captured test attachment is a genuine native host screenshot, not a synthesized Marketplace image. This discovery-only test runs without exporting or changing original design files.

## Local reproduction

Run from the repository root with supported Node 24, real KiCad demo and VS Code Linux prerequisites:

```bash
corepack pnpm --filter kicadstudiokit run build
export KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE=1
export KICADSTUDIO_PLAYWRIGHT_CHANNEL=chrome
xvfb-run -a corepack pnpm --dir apps/vscode-extension exec playwright test --config playwright.config.ts test/e2e/nativeA1DirectBom.local.test.ts --reporter=list
```

Without explicit opt-in or installed genuine KiCad, the test **SKIPS**, which is **NOT TESTED**, not PASS.

## Still not certified

The above is **one A1 user entry point**, not the full 117-command matrix, keyboard/focus/disabled-state/navigation acceptance, native all-OS availability, or the overall A1 milestone. A2–A4 and BoardReadyOps #623 have independent acceptance boundaries.
