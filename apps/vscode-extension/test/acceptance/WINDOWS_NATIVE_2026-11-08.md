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
node .\node_modules\@playwright\test\cli.js test test/e2e/nativeTaskHub.windows.local.test.ts --workers=1 --reporter=list
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

- **PARTIAL:** clicking the actual **KiCad Studio → KiCad Project → PCB** row now has a separate native Windows **PASS**. General Explorer double-click / `Ctrl+P` direct-file association remains PENDING and must not be conflated with the explicit project-tree command.
- **PASS (scoped Windows):** real KiCad CLI 10.0.8 native webview error recovery with the CH224A sample now passes, with actual SVG rendered and source SHA-256 unchanged. Other invalid/broken CLI/error paths and Linux still PENDING.
- **PENDING:** real high-density 8/16/32-layer engineering fixture proof, nets/pads/vias/zones, performance, repeatable reopen, original-file immutability and DRC/ERC/BOM/export verification. The eight-layer **synthetic** trace fixture does not satisfy this gate.
- **PENDING:** all other commands, shortcuts, sidebars and search/filter controls; responsive/dark/light/high-contrast/HiDPI/accessibility; native full project-to-report-to-safe-handoff preparation and **Node 24** complete quality gate.
- Linux MSI maintains separate concurrent uncommitted implementation/evidence. Reconcile both branches manually after acceptance; do not overwrite that work.

**All four owner-approved local acceptance categories remain PENDING. No PR (including draft/dependency), merge, release or deployment before all pass.**

## Further verified Windows native tests — 2026-11-08

Two **separately attributable** opt-in native tests were added at `test/e2e/nativeRealCli.windows.local.test.ts`:

- **Real KiCad CLI SVG error recovery — 1/1 PASS (18.1s).** In an isolated VS Code 1.122.0 host, the copied CH224A benchmark PCB was opened in the custom PCB viewer, then KiCanvas source mounting was deliberately made to fail. The normal Reload command recovered using the **installed actual KiCad CLI 10.0.8**, produced a visible SVG with paths, and did not mutate either the source fixture or isolated copy (both SHA-256 values preserved). A separate short-lived local CLI export independently returned exit 0 and a 35,361-byte SVG, with an unchanged source hash. No external design transfer or persistent artifact.
- **KiCad Project tree selection — 1/1 PASS (12.2s).** After waiting for real extension activation (KiCad/AI/MCP status bar, not only a contributed command), opened the KiCad Studio activity-bar section and clicked the CH224A PCB row in its own tree. A real custom PCB editor webview mounted. The tree can briefly render an empty/Welcome state while its provider initializes; first exploratory runs without the activation gate were inconclusive and are **not** counted as product defects or passing acceptance.

Note: VS Code's ordinary Explorer double-click / `Ctrl+P` did not consistently open the custom viewer automatically in this isolated host; this separate default-editor-association UX remains **PENDING**. These two tests do not authorize finishing any of the four local gates or creating a PR. The fixture is a real benchmark PCB but is not sufficient evidence for high-density engineering performance.

### Final combined Windows native regression run

Both new real-CLI/project-tree tests and the existing four opt-in Task Hub/viewer tests were run **together with one worker: 6/6 PASS (approximately 1.1 minutes)**. This gives a repeatable Windows-local acceptance baseline for those six scenarios only. Do not count this as a full command/UX/engineering/e2e gate or as a Node 24 toolchain acceptance.
