# Native Linux A2 acceptance — authentic KiCad 10 dense PCB

**Scoped acceptance evidence; A2 and the overall A1–A4 milestone are NOT ACCEPTED.**

The portable opt-in Playwright test `test/e2e/nativePartialPreview.local.test.ts` now exercises the same actual VS Code editor workflow on Linux and Windows. It is skipped on ordinary CI runs because it requires a locally installed genuine KiCad 10 demo, VS Code Extension Host, Chrome and a Linux Xvfb display (or the corresponding Windows desktop). No synthetic board is substituted.

## Verified Linux run — 2026-11-10

- Runtime: supported Node 24.22.1 / pnpm 11.28.3; installed VS Code 1.122.0 Extension Development Host under Xvfb with Chrome; installed KiCad CLI 10.0.8.
- Authentic source: installed `vme-wren.kicad_pcb`, 12 copper layers, 128 source zone declarations. The demo is copied to an isolated disposable VS Code workspace; original and copied SHA-256 values were equal before and after the native GUI test. No external service or manufacturing action.
- User workflow: open board in real custom editor → metadata-only large file → deliberately invalid region rejected → bounded region preview → **Load next page** → visible, persistent PARTIAL warning → in-region omitted zone evidence → explicitly inspect partial **In2.Cu**, then explicitly plot original **In2.Cu**, **B.Cu**, **F.Cu**, reloading the interactive viewer before choosing another layer. Disabled partial export and net/reference controls remained unavailable. Open-in-KiCad path remained visible.
- Recorded native displayed SVG shapes: **206** from the accumulated bounded In2.Cu preview versus **9,368** from full original In2.Cu, **14,554** from full B.Cu, and **26,466** from full F.Cu. Full-original status explicitly said **not DRC or net-continuity validation**. Source SHA-256 unchanged. **1/1 native Playwright PASS in 2.2 minutes**.
- Separate actual KiCad CLI 10.0.8 full-board F.Cu/B.Cu output was independently confirmed from a disposable copy; original PCB SHA-256 remained intact. CLI output shape counts alone are not a zone-fill, connectivity or manufacturing acceptance test.

## Re-run without touching the personal VS Code profile

Build the extension using the repository's supported Node 24 and pnpm 11; run from the extension package directory with the actual installed KiCad 10 demo at `/usr/share/kicad/demos/vme-wren/vme-wren.kicad_pcb`:

```bash
export KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE=1
export KICADSTUDIO_PLAYWRIGHT_CHANNEL=chrome
xvfb-run -a corepack pnpm exec playwright test --config playwright.config.ts test/e2e/nativePartialPreview.local.test.ts --reporter=list
```

For Windows, retain `KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE=1` and the installed KiCad 10 demo path under Program Files. Both paths are explicitly opt-in; skipping is **NOT PASS**.

## Not verified / remaining

- The bounded PARTIAL geometry omits **all 128 original zone fills** and cannot prove complete pads, net continuity or engineering parity. Native full-layer SVG is visual inspection only, not an interactive full-board PCB editor or DRC proof.
- Authentic 16/32-copper-layer dense boards, pan/zoom streaming, full KiCad-vs-UI pad/via/zone/net truth, repeated reopen and full A1 interactions, A3 responsive UX and A4 safe project-to-report handoff remain NOT VERIFIED or PENDING; no cloud review or fabrication signoff.
