# OASLANA-46 Performance And Reliability Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeatable KiCad Studio performance and reliability coverage for project discovery, viewer generation, BOM/netlist parsing, KiCad CLI cancellation, and MCP latency budgets.

**Architecture:** Reuse the existing shared `performance/baselines.json` catalog and `scripts/check-performance-budgets.mjs` evaluator. Add a VS Code extension Jest performance lane that writes the same measurement schema as the existing MCP benchmark, then merge extension and MCP measurements in CI before budget evaluation and artifact upload.

**Tech Stack:** Node 24, pnpm 11, Jest/ts-jest, Node `perf_hooks`, GitHub Actions, uv/pytest for the existing MCP benchmark.

---

### Task 1: Extend The Budget Contract

**Files:**
- Modify: `scripts/check-performance-budgets.test.mjs`
- Modify: `scripts/check-performance-budgets.mjs`
- Modify: `performance/baselines.json`

- [x] **Step 1: Write the failing contract tests**

Add tests that require the OASLANA-46 catalog to include CI-required extension measurements for project scan, viewer render/reload, BOM parse, netlist parse, and cancellation. Add a test for loading and merging multiple measurement files so CI can combine extension and MCP outputs.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test scripts/check-performance-budgets.test.mjs`

Expected: fail because the new metric IDs and measurement merge helper do not exist yet.

- [x] **Step 3: Implement the budget contract**

Add the new required metric IDs, baselines, CI-required flags, and a measurement loader that accepts one or more measurement JSON files while preserving validation for duplicate/unknown metrics.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test scripts/check-performance-budgets.test.mjs`

Expected: pass.

### Task 2: Add Extension Performance Harness

**Files:**
- Create: `apps/vscode-extension/test/performance/extensionPerformance.test.ts`
- Modify: `apps/vscode-extension/package.json`
- Modify: `package.json`

- [x] **Step 1: Write the failing performance tests**

Add Jest tests that measure actual extension code paths:

- `discoverKiCadProjects` over single, medium, and synthetic large fixture workspaces.
- `createKiCanvasViewerHtml` for schematic, PCB, large PCB, and reload generation.
- `BomParser.parse` with a generated 1000-component schematic.
- `SExpressionParser.findAllNodes(..., "net")` with a generated 1000-net netlist.
- `KiCadCliRunner.cancelAll()` response against a hanging child-process mock.

The test writes `KICAD_EXTENSION_PERFORMANCE_MEASUREMENTS_JSON` when set.

- [x] **Step 2: Run the focused test and verify RED**

Run: `corepack pnpm --filter kicadstudiokit run test:perf`

Expected: fail because the script is not wired yet.

- [x] **Step 3: Wire and implement the harness**

Add `test:perf` to the extension package and root package. Keep the harness deterministic, use generous catalog thresholds, and emit only schema-compatible measurement JSON.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `KICAD_EXTENSION_PERFORMANCE_MEASUREMENTS_JSON=performance-results/extension-performance.json corepack pnpm --filter kicadstudiokit run test:perf`

Expected: pass and write `performance-results/extension-performance.json`.

### Task 3: Wire CI Artifacts

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/nightly-quality-gates.yml`
- Modify: `scripts/check-performance-budgets.test.mjs`

- [x] **Step 1: Write the failing CI wiring test**

Extend the root performance-budget test to require:

- Root `test:perf` script.
- CI performance job runs extension perf tests.
- CI merges extension and MCP measurement JSON before `check-performance-budgets`.
- Nightly quality gates run `corepack pnpm run test:perf`.
- Performance artifacts include extension measurement JSON and budget report JSON.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test scripts/check-performance-budgets.test.mjs`

Expected: fail on missing scripts/workflow wiring.

- [x] **Step 3: Implement CI wiring**

Update CI and nightly workflow steps without changing pinned third-party action refs.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test scripts/check-performance-budgets.test.mjs`

Expected: pass.

### Task 4: Validate And Ship

**Files:**
- All changed files

- [x] **Step 1: Run issue-specific validation**

Run:

```bash
rm -rf performance-results && \
  KICAD_EXTENSION_PERFORMANCE_MEASUREMENTS_JSON=performance-results/extension-performance.json \
  KICAD_PERFORMANCE_MEASUREMENTS_JSON=performance-results/mcp-tools-list.json \
  corepack pnpm run test:perf
node scripts/check-performance-budgets.mjs \
  --measurements performance-results/extension-performance.json \
  --measurements performance-results/mcp-tools-list.json \
  --output performance-results/budget-report.json
corepack pnpm run check:performance-budgets
```

- [x] **Step 2: Run required repository validation**

Run:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
corepack pnpm run verify:dist
corepack pnpm --filter kicadstudiokit run workflows:lint
corepack pnpm --dir packages/mcp-server run workflows:lint
corepack pnpm --dir packages/mcp-server run workflows:security
corepack pnpm audit --audit-level high
uvx pre-commit run --all-files
gitleaks detect --source . --redact --verbose
```

- [ ] **Step 3: Commit, push, PR, and CI**

Commit with `test(repo): add OASLANA-46 performance reliability lane`, push `codex/OASLANA-46-performance-reliability-tests`, open a PR linked to OASLANA-46 and GitHub issue #47, then watch CI to terminal state.
