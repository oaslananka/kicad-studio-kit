# Windows native UI acceptance — 2026-11-08

**LOCAL ONLY — PR_OPEN_GATE: LOCKED.** This is one Windows acceptance batch, not a claim that all shipped controls or all four engineering gates are complete.

## Reproduction and scope

- Clean disposable VS Code **1.122.0 Extension Development Host**, with copied KiCad fixture files, fresh user-data and extensions directories. Installed regular VS Code 1.145.2 is not modified.
- Starting repository main: `ed4891efe883d8cafca975c8a8f604b56691f8e4`. Work occurs only on a separate local, unpublished branch; no PR/release/deployment.
- Real KiCad CLI **10.0.8** is installed but not in `PATH`. The test configures the executable explicitly when checking capability health.
- Runner Node **26.13.0** is outside the repository's required **Node 24** range. Passing these native UI checks does **not** count as a full Node 24 quality gate.
- Windows opt-in test invocation, from `apps/vscode-extension`:

```powershell
$env:KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE = '1'
node .\node_modules\@playwright\test\cli.js test test/e2e/nativeRealCli.windows.local.test.ts test/e2e/nativeTaskHub.windows.local.test.ts --workers=1 --reporter=list
```

A skipped test without this opt-in is **not** a PASS. Playwright screenshot attachments are obtained from the isolated real VS Code host, not synthesized media. No real external cloud approvals, manufacturing submissions or user-design transfers.

## Verified native interactions

| Workflow                                             | Status | Real effect established                                                                                            |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| Activation and Explorer workspace/status affordances | PASS   | Existing `viewer.test.ts` Windows activation smoke 1/1                                                             |
| Task Hub → Maintain → Settings                       | PASS   | QuickPick selections open real Health webview                                                                      |
| CLI/AI/MCP/BoardReadyOps/Viewer health cards         | PASS   | All five cards rendered in native webview                                                                          |
| Refresh CLI capability                               | PASS   | Executes installed KiCad CLI, reports 10.0.8                                                                       |
| Native VS Code Settings                              | PASS   | Settings button opened genuine Settings editor                                                                     |
| Explorer fixture + explicit PCB custom editor        | PASS   | `KiCad: Open as PCB Viewer` mounts webview                                                                         |
| KiCanvas mount failure recovery                      | PASS   | Injected actual source-append failure; Reload requests a **test CLI** SVG and produces a visible SVG fallback      |
| Eight-copper-layer **synthetic regression fixture**  | PASS   | Actual interactive KiCanvas loaded with 8 copper layer traces, no automatic SVG fallback                           |
| Fit and zoom                                         | PASS   | Live KiCanvas camera zoom changed ~1.2× and Fit restored the original value                                        |
| Grid toggle                                          | PASS   | Actual KiCanvas grid layer opacity changed; not just a pressed-state label                                         |
| Layer focus/solo/all                                 | PASS   | `In3.Cu` focus, one-visible-layer count, then restored All                                                         |
| Net search/highlight/clear                           | PASS   | `TEST` reported 8 tracks; real canvas pixel differences measured on highlight and returned to baseline after Clear |

Four independent opt-in Windows scenarios ran together **4/4 PASS (39.1s)** after the local source fix. A subsequent strengthened eight-layer test with direct camera/grid-model checks and canvas pixel-difference assertions passed independently **1/1 (13.0s)**. Scoped Prettier, ESLint, TypeScript and development webpack build were successful. The affected viewer-controller/HTML/provider Jest suites also passed **106/106** tests, and the browser webview KiCanvas checks passed **6/6** (including 4/8/16/32 copper-layer inspection, net and reference interactions). These browser webview fixtures are not a substitute for authentic dense native projects. These are attributable local runs, not a claim that every command was tested.

## Defect and bounded source fix

Before this fix, the eight-copper-layer fixture repeatedly entered `CLI SVG fallback loaded` immediately after the KiCanvas surface initially appeared blank — with both default and forced software WebGL. KiCanvas had reported loaded, but the extension sampled the first unpainted frame **before fitting the board**. The local fix tries supported Fit / optional board camera focus and checks the actual canvas for a bounded 1.6-second painting interval. It still requests CLI SVG if the surface remains blank and still aborts stale viewer generations.

After rebuilding the extension, the eight-layer viewer and controls passed under both default and software WebGL startup. This is a **tested local Windows correction**, not yet a cross-platform/release acceptance.

## Open acceptance work

- **PASS (scoped Windows):** the actual **KiCad Studio → KiCad Project → PCB** row, Explorer PCB double-click, `Ctrl+P` PCB Quick Open and Explorer schematic double-click all opened the relevant custom viewer after extension activation. The normal file-open behavior is verified in the isolated Windows host, not yet Linux or every VS Code version.
- **PASS (scoped Windows):** real KiCad CLI 10.0.8 native webview error recovery with the CH224A sample now passes, with actual SVG rendered and source SHA-256 unchanged. Other invalid/broken CLI/error paths and Linux still PENDING.
- **PENDING:** real high-density 8/16/32-layer engineering fixture proof, nets/pads/vias/zones, performance, repeatable reopen, original-file immutability and DRC/ERC/BOM/export verification. The eight-layer **synthetic** trace fixture does not satisfy this gate.
- **PENDING:** all other commands, shortcuts, sidebars and search/filter controls; responsive/dark/light/high-contrast/HiDPI/accessibility; native full project-to-report-to-safe-handoff preparation and **Node 24** complete quality gate.
- Linux MSI maintains separate concurrent uncommitted implementation/evidence. Reconcile both branches manually after acceptance; do not overwrite that work.

**All four owner-approved local acceptance categories remain PENDING. No PR (including draft/dependency), merge, release or deployment before all pass.**

## Further verified Windows native tests — 2026-11-08

Two **separately attributable** opt-in native tests were added at `test/e2e/nativeRealCli.windows.local.test.ts`:

- **Real KiCad CLI SVG error recovery — 1/1 PASS (18.1s).** In an isolated VS Code 1.122.0 host, the copied CH224A benchmark PCB was opened in the custom PCB viewer, then KiCanvas source mounting was deliberately made to fail. The normal Reload command recovered using the **installed actual KiCad CLI 10.0.8**, produced a visible SVG with paths, and did not mutate either the source fixture or isolated copy (both SHA-256 values preserved). A separate short-lived local CLI export independently returned exit 0 and a 35,361-byte SVG, with an unchanged source hash. No external design transfer or persistent artifact.
- **KiCad Project tree selection — 1/1 PASS (12.2s).** After waiting for real extension activation (KiCad/AI/MCP status bar, not only a contributed command), opened the KiCad Studio activity-bar section and clicked the CH224A PCB row in its own tree. A real custom PCB editor webview mounted. The tree can briefly render an empty/Welcome state while its provider initializes; first exploratory runs without the activation gate were inconclusive and are **not** counted as product defects or passing acceptance.

Historical note: Early Explorer / `Ctrl+P` attempts occasionally opened the text editor when the test did not await activation. Subsequent opt-in regression tests that waited for the real MCP status indicator demonstrated normal custom-editor default selection. No production manifest/association changes were necessary. These tests do not authorize finishing any of the four local gates or creating a PR. The fixture is a real benchmark PCB but is not sufficient evidence for high-density engineering performance.

### Final combined Windows native regression run

Both new real-CLI/project-tree tests and the existing four opt-in Task Hub/viewer tests were run **together with one worker: 6/6 PASS (approximately 1.1 minutes)**. This gives a repeatable Windows-local acceptance baseline for those six scenarios only. Do not count this as a full command/UX/engineering/e2e gate or as a Node 24 toolchain acceptance.

## Default custom editor acceptance — follow-up

The `contributes.customEditors` manifest already sets `priority: "default"` for `*.kicad_pcb` and `*.kicad_sch`, in line with the VS Code Custom Editor API. **No production editor-association setting was added.** The earlier inconsistent direct-file opening is reproducible as a readiness race in native test setup: command-palette contribution visibility alone does not prove full extension activation. The new acceptance tests first wait for the actual KiCad/AI/MCP status indicator, then exercise the original native file-opening UI.

Three explicit additional Windows-native tests were introduced in `nativeRealCli.windows.local.test.ts`:

- **Explorer double-click on `sample.kicad_pcb` → KiCanvas custom PCB editor**, 1/1 PASS.
- **`Ctrl+P` Quick Open on `sample.kicad_pcb` → KiCanvas custom PCB editor**, 1/1 PASS.
- **Explorer double-click on `sample.kicad_sch` → schematic custom viewer**, 1/1 PASS.

The entire nine-scenario opt-in Windows Playwright set was then run **9/9 PASS using one worker (approximately 2.8 minutes)**, including actual KiCad 10.0.8 SVG fallback, project tree, Task Hub/Health and eight-copper-layer net/camera/layer tests. One eight-layer scenario took roughly **1.3 minutes** in this cumulative run versus about 10 seconds in its prior targeted run; investigate this intermittent acceptance-host latency instead of interpreting the 9/9 functional result as a performance SLA. Neither native Linux acceptance nor dense real PCB performance is accepted by this run.

**All four owner-mandated acceptance gates remain PENDING. PR_OPEN_GATE: LOCKED.**

## Authentic KiCad 10 eight-copper-layer demo and cross-platform baseline

**Evidence, not a complete A2/A3/A4 acceptance.** The vendor-installed KiCad 10 `royalblue54L_feather/RoyalBlue54L-Feather.kicad_pcb` is an authentic engineering demo rather than a synthetic sample. Source parsing before GUI launch established **8 copper layers, 71 footprints and 183 vias** (3,619,149 bytes on Windows). The source and isolated copy had matching SHA-256 digests before and after the native tests.

- **Windows, isolated native VS Code 1.122.0, Node 26.13.0:** opt-in `test/e2e/nativeOfficialKiCadDemo.windows.local.test.ts` passed **1/1** twice (initial 12.1s, strengthened topology-verification run 12.5s). The actual custom PCB editor reported `KiCanvas` and `Interactive renderer loaded`; actual interactive readiness was ~10.8–11.0s after starting the test. It displayed **95 nets**, 35 renderer-sourced layer-color swatches (these are _not_ 35 copper layers), GND highlight/clear and In3.Cu focus/solo/restore. Browser screenshot attached to the Playwright test. Both source and copied PCB hashes remained unchanged.
- **Linux MSI, isolated native VS Code 1.122.0 with supported Node 24.22.1:** the **separate existing, uncommitted** `test/e2e/engineeringDemo.local.test.ts` on MSI's other local branch passed **1/1**; measured load **12,279ms**, complete test 30.1s. This also exercised GND search/clear, inner-copper focus/visibility, zone fills and U1 reference focus; copy hash preserved. **The two OS checkouts are not identical commit trees** (Windows local commits plus MSI's separate modified files), so this is cross-platform functional evidence, not an identical-artifact release comparison. On MSI Node 24, TypeScript `--noEmit` and related three Jest viewer suites also passed **106/106**.
- **Windows synthetic eight-layer repeatability:** after phase instrumentation, two isolated, sequential native repetitions both passed in **12.0s**; native launch 4.3–4.6s, interactive ready ~9.5–9.6s and screenshots/net assertions complete ~11.3s. The earlier **1.3-minute** outlier within a longer combined suite did not recur. It remains an unresolved performance anomaly; two repeats are insufficient for a high-density performance SLA.
- **Reference-only KiCad CLI native engineering baseline:** in a disposable copy of the same real demo, `kicad-cli pcb drc --format json --severity-all` produced a report in **77,026ms** with **283 reported violation entries**, **0 unconnected items** and 0 schematic-parity entries; `kicad-cli sch erc --format json --severity-all` produced a report in **7,829ms** covering **5 sheets**. Both commands exited 0; **exit 0 does not mean DRC/ERC has zero findings**, because `--exit-code-violations` was not requested. All original and disposable PCB/schematic SHA-256 hashes were unchanged. The reports were temporary reference output, not a verified extension-vs-KiCad DRC/ERC finding-parity test. No design submission, PCB manufacturing order or external service contact occurred.

**PENDING:** actual extension DRC/ERC/BOM report parity with those CLI references, more extensive high-density multilayer benchmarks (including 16/32 copper), full native control matrix, current installed VS Code 1.145.2, and full stable Node 24 release quality. **PR_OPEN_GATE remains LOCKED** until all four owner-approved native gates fully pass.

## Dense 12-copper-layer stress and CLI DRC/ERC diagnostic fidelity — 2026-11-08

**Genuine high-density board discovery:** Installed KiCad 10 `vme-wren/vme-wren.kicad_pcb` has **12 actual copper layers, 1,508 footprints, 4,374 vias, 8,629 net declarations** and is roughly **70 MB** (package files differ somewhat between Windows and Linux). The vendor demo directory is copied into a disposable isolated VS Code workspace. This is a genuine engineering stress case, not a generated sparse-layer diagram.

- **PASS — documented conservative default:** Native Windows Playwright `nativeDenseKiCadDemo.windows.local.test.ts` confirmed that the viewer opens the board with `Metadata only` and an explicit title describing the default **10 MiB interactive size limit**. This scoped guard test completed **1/1 in 11.1 seconds**. No attempt should count this fallback as interactive engineering rendering.
- **FAIL / OPEN — explicit larger-board interactive rendering:** The same local test set `kicadstudio.viewer.largeFileThresholdBytes` to **110 MiB** only in an isolated test profile; the custom PCB webview mounted and initially identified KiCanvas, but its status remained `Rendering vme-wren.kicad_pcb…` after **110 seconds**. The opt-in interactive acceptance test failed after ~2.2 minutes. Do not silently raise the global 10 MiB default, wait indefinitely, or substitute metadata/SVG for a passing interactive proof. The issue may involve large-file transfer/decoding or KiCanvas parsing/rendering; the exact bottleneck is **not yet established**. A read-only, bounded pipeline profile and a scalable user-facing rendering strategy are needed. **This blocks high-density A2 acceptance.**
- **KiCad CLI DRC 10.0.8 actual schema:** A real CH224A fixture PCB report contained **195 violation records**, with each record having `description`, `severity`, `type`, `items`, and item-level `description`, `pos: {x,y}`, `uuid`. Real RoyalBlue54L schematic ERC JSON had 5 sheets, nested `sheets[].violations`, and the same item coordinates/type structure (first sheet contained 38 violation records). These are CLI reference shapes, **not** a claim that every extension diagnostic matches the full reports yet.
- **Reproduced and locally fixed diagnostic bug:** The previous extension `KiCadCheckService` treated nested item descriptions as separate violations (unit fixture: 2 DRC issues became **4** diagnostics; 1 ERC issue became **2**). It ignored `items[].pos`, so distinct faults could both point at the first `(at ...)` node, and emitted the generic `rule` code instead of KiCad `type`. The local repair now collects each violation once, maps item coordinates to the **nearest available source `at` position**, retains rule type, and builds coordinate candidates once per report rather than for each issue. This is **nearest-location navigation, not UUID-exact object identification**.
- **Local regression:** New `test/unit/kicadCheckService.test.ts` first failed both red tests on the old implementation, then passed after the repair. Combined **5 targeted Jest suites / 124 unit tests PASS**, scoped Prettier, ESLint, and TypeScript `--noEmit` PASS. Full supported Node24 and actual extension-vs-CLI diagnostic parity on large live boards remain PENDING.
- Linux small-board CLI DRC took materially longer under a memory-constrained runner; neither source file nor project repository was modified. Avoid repeating unbounded DRC work on the 8 GiB Linux host.

**Owner gate:** A1–A4 all PENDING; `PR_OPEN_GATE=LOCKED`. No PR/push/merge/release/deployment or external manufacturing communication.

## Large-board render bottleneck: bounded native profile and rejected recovery — 2026-11-08

The genuine KiCad 10 VME Wren PCB remains a **failed A2 interactive case**, not a release acceptance. A new, opt-in and **read-only** `test/e2e/nativeDenseProfile.windows.local.test.ts` profiles webview status changes and one-second event-loop heartbeats in an isolated Windows VS Code Extension Host. One bounded profile passed as an _instrumentation run_ (not a render PASS):

- Real VME source was copied to a temporary workspace; only a test-local `110 MiB` interactive threshold was set. The host tab opened after **4,076 ms**.
- Webview heartbeat saw `Opening interactive renderer…` at approximately **1,301 ms**, `Decoding and normalizing file…` at **2,002 ms**, and `Rendering vme-wren.kicad_pcb…` at **3,000 ms** (all relative to that webview document's startup).
- **No subsequent one-second heartbeat arrived** during the remaining **32-second bounded host observation**; only those three stage samples were logged. The native test itself completed as a valid instrumentation test in about 53 seconds. This is evidence that the KiCanvas processing stage stalled the webview event loop; it does **not** establish which individual parser/drawing operation is responsible.
- A **single-layer F.Cu SVG export** of a disposable copy using installed native KiCad 10 CLI was stopped after a **40,073 ms** controlled process timeout; it created **no completed SVG** within that window. Original vendor PCB SHA-256 stayed unchanged. Therefore simply switching all large boards to on-demand CLI SVG is **not validated** as a quick fallback.
- A deliberately limited host-side 30-second watchdog prototype was tested locally. Its unit controls passed (**112 viewer tests, scoped TS/ESLint PASS**) but the **real 70 MB Windows native test FAILED**: it did **not** observe the expected reloaded metadata panel within a 65-second window. **The entire watchdog production-code, unit-test and failed native-test patch was reverted.** It is neither a completed repair nor a shipping feature. The original 10 MiB metadata-only guard remains unchanged.

The next engineering solution must prevent heavy full-board rendering from monopolizing the webview's JavaScript thread and should preserve genuine per-layer engineering accuracy. Investigate bounded progressive/viewport rendering or another demonstrably responsive rendering pipeline; retain the existing safe metadata-only behavior until a true native test proves improvement. Do not automatically raise the shipped threshold or count metadata/SVG export as KiCanvas interactive success.

**Owner gate:** A1–A4 PENDING; PR_OPEN_GATE=LOCKED. No push, PR, merge, release, deploy, or external manufacturing data transfer.
