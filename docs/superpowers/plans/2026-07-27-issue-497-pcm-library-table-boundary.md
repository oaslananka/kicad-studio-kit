# PCM KiCad Library-Table Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract KiCad `sym-lib-table` and `fp-lib-table` discovery, escaping, managed-entry upsert, and uninstall cleanup from `pcmService.ts` without changing install behavior.

**Architecture:** Add a filesystem-backed `PcmLibraryTablePersistence` adapter with a config-directory provider. The adapter owns recursive symbol/footprint discovery, managed library naming, S-expression line serialization, foreign-entry preservation, and managed-entry removal. `PcmService` retains package installation, config selection, state persistence, reindexing, and user-visible events.

**Tech Stack:** TypeScript, Node `fs`/`path`, Jest, repository architecture guards.

## Global Constraints

- Do not import `vscode` from the library-table adapter.
- Preserve existing managed names, descriptions, table roots, and escape behavior.
- Preserve foreign table entries during install, update, and uninstall.
- Keep the production TypeScript import graph cycle-free.
- Do not move config-directory selection, package installation, or reindexing in this phase.

---

### Task 1: Define table behavior with direct tests

**Files:**

- Create: `apps/vscode-extension/test/unit/pcmLibraryTable.test.ts`
- Create: `apps/vscode-extension/src/library/pcmLibraryTable.ts`

- [x] Write failing tests for discovery, upsert, foreign-entry preservation, removal, escaping, and missing install roots.
- [x] Run the focused test and confirm it fails because the module does not exist.
- [x] Implement the minimal adapter with no VS Code import.
- [x] Run direct tests and confirm they pass.

### Task 2: Delegate service table persistence

**Files:**

- Modify: `apps/vscode-extension/src/library/pcmService.ts`
- Test: `apps/vscode-extension/test/unit/pcmService.test.ts`

- [x] Initialize the adapter from `getConfigDir()`.
- [x] Replace direct install refresh and uninstall cleanup with adapter calls.
- [x] Remove table-only discovery, serialization, and escape helpers from the service.
- [x] Run table and service tests.

### Task 3: Enforce and document the boundary

**Files:**

- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/architecture/vscode-hotspots.md`

- [x] Add an architecture regression test for the adapter dependency allowlist.
- [x] Update module counts, line counts, and ownership documentation.
- [x] Run architecture, lint, typecheck, full extension, docs, and repository pre-push gates.
