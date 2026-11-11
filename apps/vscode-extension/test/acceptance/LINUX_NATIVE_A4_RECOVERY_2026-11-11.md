# Native A4 local BOM output failure and recovery — 2026-11-11

**Scoped outcome: PASS for a blocked local output folder followed by retry in one real VS Code session. Overall A4 remains PARTIAL / NOT ACCEPTED.** This evidence does not certify every failure, operating system, manufacturer handoff or cloud review.

## Real tested journey

- Linux MSI test host; actual KiCad CLI **10.0.8**; isolated VS Code **1.122.0** Extension Development Host under Xvfb/Chrome. Official multi-sheet KiCad demo: `royalblue54L_feather`, copied to a disposable workspace. No real user project or profile modified.
- Run `test/e2e/nativeA4OutputRecovery.local.test.ts` with explicit local acceptance opt-in: **1/1 PASS** (34.2 seconds on initial native verification). Real GUI actions: open schematic, invoke ERC, open PCB, invoke DRC, return to schematic and request BOM CSV export from the Command Palette.
- Introduce a controlled failure **only in the disposable workspace** by placing a regular file named `fab` where the output folder must be created. The existing file remains byte-for-byte intact; no BOM is produced and the VS Code error notification appears. No false "Export completed successfully." notification.
- Improve the user-visible guidance: a blocking regular file results in "rename or move the blocking file, or choose another output folder inside this workspace." Permission errors have separate writable-folder guidance. Local absolute paths are not included in output error notifications or the output-directory error-code log.
- Repair by removing the disposable blocker. Retry **the same Command Palette export in the same running VS Code session**: the new BOM CSV is created successfully and VS Code shows the success notification.
- Original and copied `.kicad_pro`, `.kicad_sch`, `.kicad_pcb` SHA-256 values stay unchanged. Screenshots of the real blocked and recovered states are attached to the Playwright run; they are not synthetic Marketplace images.
- Unit coverage also verifies blocked-folder no-overwrite, exact helpful message, safe logging, successful retry and pre-existing workspace-confined output safety behavior.

## Reproduce

With Node 24, installed VS Code test prerequisites, KiCad 10 and official demo on Linux:

```bash
corepack pnpm --filter kicadstudiokit run build
export KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE=1
export KICADSTUDIO_PLAYWRIGHT_CHANNEL=chrome
xvfb-run -a corepack pnpm --dir apps/vscode-extension exec playwright test --config playwright.config.ts test/e2e/nativeA4OutputRecovery.local.test.ts --reporter=list
```

When not explicitly opted in, the test deliberately **SKIPS**, which is not PASS.

## Remaining acceptance

- This test proves **blocked local output file → user-visible error → repair → successful retry**, not actual filesystem permission denial, incompatible/missing KiCad executable at runtime, mid-operation cancellation or recovery from partial CLI output.
- The earlier [A4 happy-path native evidence](LINUX_NATIVE_A4_2026-11-11.md) independently verified a real BOM (59/59 native reference IDs) and a schematic PDF; do not substitute this controlled output-path test for that engineering parity.
- A1 command availability immediately after opening a schematic (before running ERC/DRC) needs a separate targeted native acceptance test. The recovery test follows the already verified A4 ERC/DRC sequence and does not claim standalone A1 menu acceptance.
- No actual cloud review, manufacturing approval, signed handoff, production release, shipment or external data transmission occurred. #623 remains separately open.
