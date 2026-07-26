# Viewer State Store Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract viewer surface state, cloning, reload/error transitions, and diagnostic redaction from `stateStores.ts` without changing callers or viewer behavior.

**Architecture:** Add `viewerStateStore.ts` as the domain owner for `ViewerStateStore` and `ViewerStateSnapshot`. Keep `stateStores.ts` as a compatibility aggregator that re-exports the extracted class and type while the remaining project, diagnostic, MCP, and export stores stay in place.

**Tech Stack:** TypeScript, VS Code event API, Jest, repository architecture guards.

## Global Constraints

- Preserve the existing `state/stateStores` import surface.
- Preserve event timing and snapshot shapes.
- Deep-clone viewer engine capabilities, selected areas, active layers, and project context.
- Preserve error redaction in diagnostic bundle snapshots.
- Keep the production TypeScript graph cycle-free.

---

### Task 1: Define viewer-store behavior directly

**Files:**

- Create: `apps/vscode-extension/test/unit/viewerStateStore.test.ts`
- Create: `apps/vscode-extension/src/state/viewerStateStore.ts`

- [x] Write failing tests for nested cloning, project ownership, reload transitions, and redaction.
- [x] Run the focused test and confirm it fails because the module does not exist.
- [x] Implement the minimal viewer state store module.
- [x] Run direct tests and confirm they pass.

### Task 2: Preserve the compatibility surface

**Files:**

- Modify: `apps/vscode-extension/src/state/stateStores.ts`
- Test: existing viewer provider and multi-project tests.

- [x] Remove viewer-only types, implementation, and clone helper from `stateStores.ts`.
- [x] Re-export `ViewerStateStore` and `ViewerStateSnapshot` from the aggregator.
- [x] Run state-store, viewer-provider, and multi-project tests.

### Task 3: Enforce and document the boundary

**Files:**

- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/architecture/vscode-hotspots.md`

- [x] Add an architecture regression test for the viewer-store dependency allowlist.
- [x] Update module counts, line counts, and ownership documentation.
- [x] Run architecture, lint, typecheck, full extension, docs, and repository pre-push gates.
