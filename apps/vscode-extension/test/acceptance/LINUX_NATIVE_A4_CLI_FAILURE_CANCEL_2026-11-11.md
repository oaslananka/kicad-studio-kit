# Native A4: configured CLI disappearance, partial output, user cancel and recovery

**Scoped evidence: PASS for three intentionally controlled failure/retry paths in a real VS Code Extension Development Host. Overall A4 remains PARTIAL / NOT ACCEPTED.**

## Environment and user journey

- Genuine VS Code **1.122.0** on Linux and genuine installed KiCad CLI **10.0.8**. Official RoyalBlue54L Feather multi-sheet schematic/PCB/project copied to an isolated, disposable trusted workspace. Original KiCad software and user projects untouched.
- §test/e2e/nativeA4VanishedCliRecovery.local.test.ts§ runs the real Command Palette BOM CSV export. The configured CLI points to a temporary, executable launcher which dispatches normally to the real installed KiCad. The test does **not** uninstall KiCad and does **not** prove that system-wide KiCad discovery is unavailable.
- After a first valid exported BOM, the test moves only the disposable launcher away. The same VS Code session now gets an actual OS-level missing launcher error. The user receives a specific instruction to restore/configure the KiCad CLI path. No new BOM is produced and no previous successful BOM is damaged. Restoring the launcher and retrying succeeds **without restarting VS Code**.
- Next, the isolated launcher deliberately writes an incomplete temporary native BOM CSV and exits nonzero **once**. The extension reports a failed/incomplete export with actionable retry guidance; the partial temporary working file and directory are removed and **not published** as the final CSV. The preexisting successful output remains unchanged. A subsequent export through real installed KiCad succeeds.
- Finally, a controlled launcher starts a delayed cancellable operation. The test clicks **Cancel in the actual VS Code progress notification**. The abort is typed and path-safe; the product shows a neutral cancellation notice, returns the export surface to idle (not ready/success), produces no new BOM and lets the user retry successfully in the same GUI session. The launcher uses §exec sleep§ only for the intentionally delayed step and is then restored to actual KiCad.
- Original and copied §.kicad_sch§, §.kicad_pcb§ and §.kicad_pro§ SHA-256 values stay unchanged throughout. This test does not transmit any private design, perform BoardReadyOps cloud review, manufacture, ship or publish a release.
- Native screenshots of CLI disappearance, recovery, incomplete-output recovery and cancellation recovery are attached to the local Playwright run. They are not synthetic or Marketplace material.

## Exact evidence and reproducibility

- Real VS Code GUI composite test: **1/1 PASS** after fixes; individual stage markers demonstrate initial real BOM export, detected disappearance, successful restoration, discarded incomplete CSV, retry, user Cancel, and final retry.
- Focused unit tests verify typed absence and cancellation errors, path-safe diagnostics, failed CLI exit, neutral cancellation state and subsequent successful export. Product TypeScript and lint are required to pass.
- Opt-in native test invocation:

§§§bash
corepack pnpm --filter kicadstudiokit run build
export KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE=1
export KICADSTUDIO_PLAYWRIGHT_CHANNEL=chrome
xvfb-run -a corepack pnpm --dir apps/vscode-extension exec playwright test --config playwright.config.ts test/e2e/nativeA4VanishedCliRecovery.local.test.ts --reporter=list
§§§

When the genuine host prerequisites or explicit opt-in are absent, the native test **SKIPS**; that is **NOT VERIFIED**, not PASS.

## Remaining acceptance

- Truly missing KiCad installation on a new device, changed CLI settings via the actual Settings UI, unsupported old versions, genuine upstream mid-command crashes and real cancellation during a computationally expensive KiCad run on all platforms remain outside this controlled test.
- A1 complete command/keyboard matrix, A2 authentic full 16/32-layer copper and A3 hands-on HiDPI/themes/responsive acceptance are independent. BoardReadyOps #623 governed cloud approval/handoff remains open. **Do not claim overall A4 or product acceptance from these scenario-specific results.**
