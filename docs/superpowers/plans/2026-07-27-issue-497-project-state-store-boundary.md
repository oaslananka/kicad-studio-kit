# Project State Store Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract project selection, project lookup, immutable snapshots, and change events from `stateStores.ts` without changing callers.

**Architecture:** Add `projectStateStore.ts` as the domain owner for `ProjectStateStore` and `ProjectStateSnapshot`. Keep `stateStores.ts` as a compatibility aggregator that re-exports the extracted class and type while diagnostic, MCP, and export stores remain in place.

**Tech Stack:** TypeScript, VS Code event and URI API, Jest, repository architecture guards.

## Global Constraints

- Preserve the existing `state/stateStores` import surface.
- Preserve snapshot shapes and event timing.
- Clone retained and returned project contexts.
- Preserve active-resource serialization and project lookup semantics.
- Keep the production TypeScript graph cycle-free.

---

### Task 1: Define project-store behavior directly

**Files:**

- Create: `apps/vscode-extension/test/unit/projectStateStore.test.ts`
- Create: `apps/vscode-extension/src/state/projectStateStore.ts`

- [x] Write failing tests for immutable project ownership, lookups, snapshots, events, and disposal.
- [x] Run the focused test and confirm it fails because the module does not exist.
- [x] Implement the minimal project state store module.
- [x] Run direct tests and confirm they pass.

### Task 2: Preserve the compatibility surface

**Files:**

- Modify: `apps/vscode-extension/src/state/stateStores.ts`
- Test: existing state-store and multi-project tests.

- [x] Remove project-only types and implementation from `stateStores.ts`.
- [x] Re-export `ProjectStateStore` and `ProjectStateSnapshot` from the aggregator.
- [x] Run state-store, activation, language-model, save-check, and multi-project tests.

### Task 3: Enforce and document the boundary

**Files:**

- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/architecture/vscode-hotspots.md`

- [x] Add an architecture regression test for the project-store dependency allowlist.
- [x] Update module counts, line counts, and ownership documentation.
- [x] Run architecture, lint, typecheck, full extension, docs, and repository pre-push gates.
