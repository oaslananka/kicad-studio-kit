# Issue #497 CLI Capability Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the extension's only production import cycle and establish a pure, typed KiCad CLI capability model with a fail-closed architecture guard.

**Architecture:** Move immutable capability types and version helpers into `kicadCliCapabilities.ts`. Keep discovery/probing in `kicadCliDetector.ts` and product-facing support descriptions in `kicadCliSupport.ts`. Add a dependency-free relative-import graph checker to prevent production cycles from returning.

**Tech Stack:** TypeScript 6, Node.js 24 ESM scripts, Jest, pnpm 11.

## Global Constraints

- Preserve all KiCad CLI discovery, probing, support-state, and feature-state behavior.
- Add no runtime dependency.
- Keep #492 MCP client/protocol work out of scope.
- Do not combine viewer, export-command, PCM, component-search, state-store, type, or constant decomposition in this PR.
- Keep compatibility re-exports for existing detector consumers.
- Fail the root repository gate when any production TypeScript import cycle exists.
- Inspect every bot and agent finding before merge.

---

### Task 1: Add the production import-cycle guard

**Files:**

- Create: `scripts/lib/typescript-import-graph.mjs`
- Create: `scripts/check-vscode-architecture.mjs`
- Create: `scripts/check-vscode-architecture.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `extractRelativeImportSpecifiers(source): string[]`
- Produces: `buildTypeScriptImportGraph(rootDirectory): Map<string, Set<string>>`
- Produces: `findImportCycles(graph): string[][]`
- Produces: `validateVscodeArchitecture(repoRoot): { files: number; cycles: string[][] }`

- [ ] **Step 1: Write tests for import extraction, resolution, cycle detection, current repository state, and root script wiring.**
- [ ] **Step 2: Run `node --test scripts/check-vscode-architecture.test.mjs`; expect failure because the implementation module does not exist.**
- [ ] **Step 3: Implement deterministic relative-import resolution and strongly connected component detection.**
- [ ] **Step 4: Wire `check:vscode-architecture` into root `check` immediately after `check:boundaries`.**
- [ ] **Step 5: Run the architecture tests; expect the repository-state assertion to fail on the existing detector/support cycle.**

### Task 2: Extract the pure capability model

**Files:**

- Create: `apps/vscode-extension/src/cli/kicadCliCapabilities.ts`
- Create: `apps/vscode-extension/test/unit/kicadCliCapabilities.test.ts`
- Modify: `apps/vscode-extension/src/cli/kicadCliDetector.ts`
- Modify: `apps/vscode-extension/src/cli/kicadCliSupport.ts`
- Modify: `apps/vscode-extension/src/commands/viewerStatusMenu.ts`
- Modify: `apps/vscode-extension/test/unit/kicadCliDetector.test.ts`
- Modify: `apps/vscode-extension/test/unit/kicadCliSupport.test.ts`

**Interfaces:**

- Produces: `KiCadCliCapabilityName`
- Produces: `KiCadCliCapabilitySnapshot`
- Produces: `parseKiCadMajor(cli): number | undefined`
- Produces: `deriveCommandVersionStatus(detectedMajor, commandMinimumMajor): string`

- [ ] **Step 1: Write the new capability-model unit tests; expect module-not-found failure.**
- [ ] **Step 2: Move the immutable types and pure helpers without changing their logic.**
- [ ] **Step 3: Update detector/support imports and add compatibility re-exports.**
- [ ] **Step 4: Update the direct viewer-status type import to the model module.**
- [ ] **Step 5: Run focused Jest, lint, typecheck, and architecture tests; expect all to pass and zero cycles.**

### Task 3: Record hotspot order and verify release confidence

**Files:**

- Create: `docs/architecture/vscode-hotspots.md`
- Modify: `docs/superpowers/specs/2026-07-23-issue-497-cli-capability-boundary-design.md`

**Interfaces:**

- Produces: a dated dependency/churn map and phase order for the remaining #497 work.

- [ ] **Step 1: Record line-count, recent-churn, owner boundary, risk, and required test lane for each hotspot.**
- [ ] **Step 2: Run focused unit tests, architecture guard, extension check, performance budgets, repeatable VSIX, and package validation.**
- [ ] **Step 3: Run `bash scripts/run-validation-host.sh corepack pnpm run check`; expect exit 0.**
- [ ] **Step 4: Publish a GitHub-signed PR, triage all bot/agent findings, record the sole-maintainer owner review, and merge only on a clean final head.**
