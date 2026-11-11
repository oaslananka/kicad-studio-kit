# Native A4 — incompatible BOM CLI recovery guidance

**Scoped result: PASS for BOM capability incompatibility messaging and fail-closed behavior in real VS Code. A4 overall remains PARTIAL / NOT ACCEPTED.**

## User problem

An authentic multi-sheet KiCad demo in a real VS Code extension-host session exposed a confusing recovery message when a configured CLI lacked the native hierarchical BOM capability: the extension stopped the export but incorrectly told the user to verify the project opened in KiCad.

## Validation and repair

- Real VS Code **1.122.0**, Linux GUI with the official RoyalBlue54L Feather multi-sheet KiCad schematic and PCB, copied into an isolated temporary trusted workspace. The test deliberately configures a **controlled unsupported-CLI test executable** that responds to version detection but lacks the BOM command; this does **not** simulate removal of the installed KiCad binary and must not be described as a full missing-installation test.
- **Before fix:** native test FAILED because UI showed generic "verify the project opens in KiCad" guidance instead of the actual unsupported-capability cause.
- **After fix:** the same Command Palette BOM action reports that a compatible KiCad CLI is needed and asks the user to configure KiCad and retry; no BOM file and no success notification are produced. Original and copied project/schematic/PCB SHA-256 values remain unchanged.
- The existing compatibility check still fails closed and other BOM errors retain their separate error paths. New code reuses the exact incompatible-capability error constant; it does not infer success, silently downgrade hierarchical BOMs, weaken version gates or transmit data.
- After code rebuild: **1/1 native Playwright PASS** (10.5s within a three-test combined run) plus the first-open A1 and actual EACCES retry regressions (**3/3 PASS**, 33.7s). Focused export-command unit tests **28/28 PASS**, TypeScript and lint passed.
- A genuine screenshot from the native VS Code host is attached to the Playwright test, not substituted for Marketplace product evidence.

## Run locally

From the repo root with Node 24 and the real KiCad example files on the local Linux host:

§§§bash
corepack pnpm --filter kicadstudiokit run build
export KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE=1
export KICADSTUDIO_PLAYWRIGHT_CHANNEL=chrome
xvfb-run -a corepack pnpm --dir apps/vscode-extension exec playwright test --config playwright.config.ts test/e2e/nativeA4IncompatibleCli.local.test.ts --reporter=list
§§§

When the prerequisites/opt-in are absent, this test **SKIPS** and is not native acceptance PASS.

## Not yet verified

- No-KiCad-installed native GUI workflow; unexpected CLI binary disappearance after detection; repair of CLI configuration and retry in the **same** native session.
- Cancellation midway through a real CLI operation and recovery after truncated or partial CLI output.
- Full A4 manufacturing review/approval and cloud submission remain independently unresolved, including BoardReadyOps #623; no external material was transmitted.
