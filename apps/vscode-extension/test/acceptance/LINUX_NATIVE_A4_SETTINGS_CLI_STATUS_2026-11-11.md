# A4 scoped native acceptance: CLI Settings UI repair and visible status accuracy

**Result: PASS for this single Linux VS Code user journey.** The overall A1–A4 product/milestone acceptance remains PARTIAL.

## User problem and test

- Real **VS Code 1.122.0** Extension Development Host with installed genuine **KiCad CLI 10.0.8** and an isolated copy of the official multi-sheet `RoyalBlue54L-Feather` schematic/PCB/project. Original source checksums remain unchanged; no customer designs, external uploads or manufacturing steps.
- Controlled incompatible KiCad 9 CLI fixture initially selected. The first BOM command fails closed with actionable guidance. Bottom status bar correctly says KiCad 9.0.0 initially.
- User opens actual VS Code **Settings** via `Ctrl+,`, searches `@id:kicadstudio.kicadCliPath` in the native modal, enters the real installed KiCad 10 CLI path and **presses Enter** to commit (changing focus alone is not sufficient in this UI).
- **Before fix**: BOM export works after repairing the path in the same session, but the status bar falsely keeps the old KiCad 9.0.0 and deprecated warning.
- **After fix**: the status bar refreshes to **KiCad 10.0.8**, does not show KiCad 9, and the same-session BOM CSV export succeeds. The user never restarts VS Code. Source/working-copy `.kicad_sch`, `.kicad_pcb`, and `.kicad_pro` hashes remain unchanged. The CLI detector discards an outdated pending probe when settings change, and a newly invalid path clears the old status rather than retaining a false version.

## Evidence

- Native Playwright: `test/e2e/nativeA4SettingsCliStatus.local.test.ts`, **1/1 PASS (17.5s)** on the final product source. Test attaches an authentic screenshot and records `A4_NATIVE_SETTINGS_UI_CLI_INDICATOR_AND_BOM=PASS`.
- Unit-level previously failing case (`cli: undefined` leaves KiCad 9 label): **RED on baseline** (1 failure / 28 other tests passing), **GREEN after fix**. Three focused status-bar / CLI detector suites: **59/59 PASS**, plus TypeScript and ESLint PASS.
- Explicit local opt-in invocation:

  `KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE=1 KICADSTUDIO_PLAYWRIGHT_CHANNEL=chrome xvfb-run -a corepack pnpm --dir apps/vscode-extension exec playwright test --config playwright.config.ts test/e2e/nativeA4SettingsCliStatus.local.test.ts --reporter=list`

- Generic CI **SKIP does not equal real native PASS**. This evidence does not verify a fully absent KiCad installation on a fresh OS, intensive real KiCad computation cancellation across platforms, or BoardReadyOps governed external approval (#623).
