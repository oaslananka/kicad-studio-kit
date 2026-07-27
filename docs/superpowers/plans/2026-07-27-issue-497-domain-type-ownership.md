# Domain Type Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete hotspot decomposition by moving Component Search and BOM-owned type definitions out of the broad shared type file while preserving compatibility imports.

**Architecture:** Add dependency-free `components/componentSearchTypes.ts` and `bom/bomTypes.ts` modules. Production owners import their domain types directly. `types.ts` remains a compatibility aggregator through type-only re-exports. `constants.ts` remains the deliberate central manifest/command/settings contract because no extracted phase requires duplicating or inverting that ownership.

**Tech Stack:** TypeScript, Jest compile-time fixtures, repository architecture graph checks.

## Global Constraints

- Preserve every public type name and structural shape.
- Existing imports from `types.ts` must continue to compile.
- New type modules must be dependency-free and contain no runtime code.
- Do not move unrelated viewer, diagnostics, MCP, export, or project types.
- Do not split `constants.ts` without a concrete owning runtime boundary.

---

### Task 1: Lock domain and compatibility type contracts

**Files:**

- Create: `apps/vscode-extension/test/unit/domainTypes.test.ts`
- Create: `apps/vscode-extension/src/components/componentSearchTypes.ts`
- Create: `apps/vscode-extension/src/bom/bomTypes.ts`

- [x] **Step 1: Write a failing compile/runtime fixture**

Import the new domain modules and legacy `types.ts` aliases, construct representative BOM/search values, and prove assignment compatibility in both directions.

- [x] **Step 2: Run the direct test and verify red**

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false test/unit/domainTypes.test.ts
```

Expected: module resolution failure for the two new type modules.

- [x] **Step 3: Implement dependency-free domain type modules**

Move `BomEntry`, `BomSummary`, `BomWebviewMessage`, `ComponentPriceBreak`, `ComponentOffer`, and `ComponentSearchResult` without structural changes.

- [x] **Step 4: Re-export the moved types from `types.ts`**

Use type-only exports so existing consumers remain source-compatible.

- [x] **Step 5: Run the direct test and verify green**

### Task 2: Migrate production owners to direct imports

**Files:**

- Modify: `apps/vscode-extension/src/bom/*.ts`
- Modify: `apps/vscode-extension/src/components/*.ts`
- Modify: `apps/vscode-extension/src/library/pcmService.ts`

- [x] **Step 1: Replace broad imports with owning-domain imports**

Component Search modules and clients import `ComponentSearchResult` locally; BOM modules import BOM types locally; cross-domain consumers use the owning module.

- [x] **Step 2: Keep compatibility consumers and tests valid**

Do not force downstream callers to migrate in this phase.

- [x] **Step 3: Run focused BOM, PCM, Component Search, lint, and typecheck gates**

### Task 3: Enforce final ownership and document the architecture

**Files:**

- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/architecture/vscode-hotspots.md`

- [x] **Step 1: Add dependency-free type-module guards**

Require both type modules to have zero production dependencies and no VS Code/Node imports.

- [x] **Step 2: Guard direct owner imports and compatibility exports**

Prevent Component Search/BOM production modules from drifting back to the broad shared type file for moved definitions.

- [x] **Step 3: Update final module/line counts and ownership rationale**

Record the compatibility aggregator and the deliberate central `constants.ts` decision.

- [x] **Step 4: Run architecture and docs gates**

### Task 4: Verify, publish, and close the umbrella work

- [x] **Step 1: Run the full extension validation host**
- [x] **Step 2: Review and commit the phase-scoped diff**

  Evidence: initial phase commit `c94b918`; 19 files, 363 insertions, 89 deletions.

- [x] **Step 3: Run full repository pre-push and publish the branch**

  Evidence: 963 unit, 128 ratchet, 12 security, 76 a11y; 158 modules / 0 cycles; docs index 610.1 kB; repeatable VSIX and package validation passed.

- [ ] **Step 4: Open a phase-scoped PR and wait for every required/external check**
- [ ] **Step 5: Squash merge only when CLEAN, sync canonical main, update final acceptance criteria, verify post-merge checks, and close the umbrella issue manually.**
