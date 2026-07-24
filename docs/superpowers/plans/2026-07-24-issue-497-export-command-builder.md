# Issue #497 Export Command Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic KiCad CLI export argument construction from `exportCommands.ts` into a pure typed module while preserving the existing public API and behavior.

**Architecture:** A new `exportCommandBuilder.ts` owns command kinds, structured options, defaults, output naming, version gates, and argument arrays. `exportCommands.ts` keeps a compatibility wrapper that reads VS Code configuration and delegates to the pure builder; `KiCadExportService` remains unchanged apart from consuming the wrapper.

**Tech Stack:** TypeScript 6, Jest, VS Code extension APIs, pnpm, Webpack.

## Global Constraints

- Preserve every command token, order, output suffix, default, layer list, and KiCad-major gate.
- Keep `buildCliExportCommands()` and its existing type exports available from `exportCommands.ts`.
- Keep the pure builder free of VS Code, filesystem, process, runner, detector, logger, and UI dependencies.
- Keep the production TypeScript graph at zero cycles.
- Do not modify MCP or unrelated hotspot modules.
- Require DCO sign-off on every non-trivial commit.

---

### Task 1: Define and implement the pure builder contract

**Files:**
- Create: `apps/vscode-extension/test/unit/exportCommandBuilder.test.ts`
- Create: `apps/vscode-extension/src/cli/exportCommandBuilder.ts`

**Interfaces:**
- Consumes: command kind, source path, output directory, and typed build options.
- Produces: deterministic `string[][]` KiCad CLI argument sequences.

- [ ] Write a failing focused test importing `buildExportCommands()` and the command types from the new module.
- [ ] Verify RED because `exportCommandBuilder.ts` does not exist.
- [ ] Move the existing command-kind union, options interface, default Gerber layers, command switch, output naming, common 3D arguments, and variant-argument helper into the pure module without changing command tokens.
- [ ] Add a table-driven test covering every command kind and KiCad version gate.
- [ ] Assert that the module source contains no `vscode` import.
- [ ] Run the focused test and verify GREEN.
- [ ] Commit with `git commit -s -m "refactor(kicad-studio): extract export command builder"`.

### Task 2: Preserve the compatibility wrapper and service behavior

**Files:**
- Modify: `apps/vscode-extension/src/cli/exportCommands.ts`
- Modify: `apps/vscode-extension/test/unit/exportCommands.test.ts`

**Interfaces:**
- Consumes: existing VS Code settings and optional caller overrides.
- Produces: the unchanged `buildCliExportCommands()` API and unchanged service behavior.

- [ ] Re-export the command types from `exportCommandBuilder.ts`.
- [ ] Keep `buildCliExportCommands()` in `exportCommands.ts`; resolve settings exactly as before and delegate to `buildExportCommands()`.
- [ ] Remove only the command switch and helpers now owned by the pure module.
- [ ] Strengthen the existing settings test to prove configured IPC, theme, precision, and BOM values reach the pure builder through the wrapper.
- [ ] Run builder and export-service unit tests, lint, typecheck, security tests, and architecture validation.
- [ ] Commit with `git commit -s -m "refactor(kicad-studio): delegate export command construction"`.

### Task 3: Record ownership and run release-confidence gates

**Files:**
- Modify: `docs/architecture/vscode-hotspots.md`
- Modify: `scripts/check-vscode-architecture.test.mjs`

**Interfaces:**
- Consumes: final source line counts and architecture graph.
- Produces: accurate issue #497 ownership documentation and updated graph expectation.

- [ ] Update the production module count and hotspot table using measured line counts.
- [ ] Document phase 3a ownership and explicitly leave execution/service decomposition for later phases.
- [ ] Run focused unit, coverage, security, integration-relevant, lint, typecheck, and architecture gates.
- [ ] Run `bash scripts/run-validation-host.sh corepack pnpm run check` and require exit 0.
- [ ] Commit with `git commit -s -m "docs(kicad-studio): record export builder ownership"`.
