# Windows native VS Code UI acceptance — 2026-11-08

**Phase A; PR_OPEN_GATE: LOCKED.** This is a local-only evidence note, not a release or all-controls acceptance.

## Environment and isolation

- Physical Windows 11, repository `oaslananka/kicad-studio-kit`, starting main `ed4891efe883d8cafca975c8a8f604b56691f8e4`.
- VS Code isolated Extension Development Host **1.122.0**; no regular user-profile modifications. Installed production VS Code 1.145.2 was separately verified.
- Real local KiCad 10.0.8: `C:\Program Files\KiCad\10.0\bin\kicad-cli.exe`. The binary works with its absolute path but is not in shell PATH.
- Playwright runner launched with host Node 26.13.0; the project build/quality requirement is Node 24, so these are native UI checks, **not** an authoritative Node 24 full quality run.
- Disposable fixture workspaces/profiles. No third-party communication, cloud approval, production design transfer or release actions.

## Reproducible native runs

From `apps/vscode-extension` in an isolated local Windows environment:

```powershell
$env:KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE = '1'
node .\\node_modules\\@playwright\\test\\cli.js test test/e2e/nativeTaskHub.windows.local.test.ts --workers=1 --reporter=list
```

Observed final grouped run: **2/2 PASS**, 21.4 seconds; Prettier and scoped ESLint **PASS**. The dedicated tests are deliberately opt-in on Windows; a skip on CI is **not** an acceptance PASS. Authentic Playwright screenshots are attached by the test when run.

## Directly observed native results

| Control or workflow                                                                                        | Result                | Evidence                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Extension activation, Explorer fixture files, KiCad/AI/MCP status items and Task Hub command-palette entry | **PASS**              | `test/e2e/viewer.test.ts`, Windows native host, 1/1                                                                                                                                                                                                                |
| Command palette -> Task Hub -> Maintain -> Open settings panel                                             | **PASS**              | `test/e2e/nativeTaskHub.windows.local.test.ts`, isolated Windows host                                                                                                                                                                                              |
| Settings webview renders CLI, AI, MCP, BoardReadyOps and Viewer health cards                               | **PASS**              | Same native UI test                                                                                                                                                                                                                                                |
| `Refresh detection` executes real KiCad CLI and reports `KiCad 10.0.8`                                     | **PASS**              | Same native UI test, observed CLI label                                                                                                                                                                                                                            |
| `Open VS Code Settings` navigates to VS Code's native settings editor                                      | **PASS**              | Same native UI test                                                                                                                                                                                                                                                |
| Explicit `KiCad: Open as PCB Viewer` command mounts native custom PCB editor                               | **PASS**              | Same native UI test, isolated disposable fixture, 2/2 combined Windows suite                                                                                                                                                                                       |
| `Ctrl+P` opening `sample.kicad_pcb` mounts KiCanvas custom editor without explicit command                 | **FAIL / UNRESOLVED** | 2 native diagnostics: source editor tab opened, but no viewer iframe within 30 seconds. Documented Explorer -> explicit open-as path is PASS. Default-editor behavior versus test harness focus remains unresolved; this is not yet confirmed as a product defect. |
| Renderer mount-error -> CLI SVG fallback on Windows                                                        | **NOT ACCEPTED**      | Existing `viewer.test.ts` cannot yet reach viewer after `Ctrl+P`; a separate explicit-open diagnostic had Quick Pick sequencing failures. Test path must be stabilized before product behavior is judged.                                                          |

## Remaining work

- Complete individual control/shortcut coverage and _click outcome_ for all declared commands. Do not infer NATIVE_PASS from command registration.
- Resolve Windows default-open vs explicit-open semantics using real Explorer project tree and documented user flow, then retest the renderer fallback with a stable explicit viewer launch.
- Run original-source integrity, genuine 8/16/32-layer fixtures (where supported), responsive/dark/light/HiDPI, accessibility, screenshot provenance, full local Node 24 quality and native end-to-end safe report preparation.
- **All four owner-mandated acceptance gates remain PENDING. Absolutely no PR, draft PR, dependency PR, merge, release or deploy.**
