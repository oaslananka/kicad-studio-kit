# Native A4: actual output-directory permission denial and recovery

**Scoped evidence: actual Linux EACCES output write failure and in-session recovery PASS. Overall A4 remains PARTIAL — NOT ACCEPTED.**

## User problem and fix

On authentic KiCad CLI **10.0.8** and isolated real VS Code **1.122.0**, the official RoyalBlue54L Feather multi-sheet schematic/PCB project was copied into a disposable trusted workspace. The test created a directory named `fab`, made it read-only (mode `0500`) and verified that the running OS account could not write to it (`EACCES`). The original KiCad design was not modified.

**Before:** BOM export failed but incorrectly suggested opening the project in KiCad, although the actual problem was a nonwritable output folder. Error details could contain a private output path.

**After:** BOM export fails without false success, gives specific writable-folder/permissions guidance, and exposes neither the private path in its notification nor the export-state error; the log records the code only. The test repairs the **disposable** directory mode and repeats the same Command Palette export in the same running VS Code session: a nonempty BOM CSV and success notification appear.

## Evidence

- Real native E2E `test/e2e/nativeA4PermissionRecovery.local.test.ts` **1/1 PASS in 13.1 seconds**. The same test first **FAILED** on the generic message before the fix.
- Focused `exportCommands.test.ts` tests **28/28 PASS**, including write permission denial, sanitized messaging/logging, retry, and ensuring a separate source-file EACCES is not misclassified as output permission failure.
- Original and disposable schematic, PCB, and project SHA-256 hashes unchanged. Genuine failure and recovery screenshots are attached to the local Playwright test.
- No cloud transmission, BoardReadyOps review/approval, manufacturing shipment, publication or third-party contact.

Reproduce with Node 24, genuine KiCad 10 and VS Code Linux prerequisites:

```bash
corepack pnpm --filter kicadstudiokit run build
export KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE=1
export KICADSTUDIO_PLAYWRIGHT_CHANNEL=chrome
xvfb-run -a corepack pnpm --dir apps/vscode-extension exec playwright test --config playwright.config.ts test/e2e/nativeA4PermissionRecovery.local.test.ts --reporter=list
```

No native prerequisites or opt-in causes a deliberate **SKIP**, which is not acceptance PASS.

## Remaining acceptance

Missing/incompatible KiCad CLI in the native GUI, cancellation during execution and truncated CLI output with safe retry remain NOT VERIFIED. One real Linux permission case does not establish all-OS or overall A4 acceptance.
