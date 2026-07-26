# PCM Installed-State Persistence Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract VS Code global-state and KiCad `installed_packages.json` ownership from `pcmService.ts` without changing install, update, or uninstall behavior.

**Architecture:** Add a Node-backed `PcmInstalledPackagePersistence` adapter with a minimal `get`/`update` storage interface and a config-directory provider. The adapter owns installed-state validation, managed-identifier history, preservation of foreign KiCad PCM records, and serialization of extension-managed records. `PcmService` retains the in-memory map, install orchestration, library tables, reindexing, and change events.

**Tech Stack:** TypeScript, Node `fs`/`path`, VS Code Memento-compatible storage, Jest, repository architecture guards.

## Global Constraints

- Do not import `vscode` from the persistence adapter.
- Preserve the state key `kicadstudio.pcm.installedPackages.v1`.
- Preserve existing `installed_packages.json` field names and timestamp conversion.
- Preserve foreign package records while replacing or removing extension-managed records.
- Keep the production TypeScript import graph cycle-free.
- Do not move KiCad library-table behavior in this phase.

---

### Task 1: Define persistence behavior with direct tests

**Files:**

- Create: `apps/vscode-extension/test/unit/pcmPersistence.test.ts`
- Create: `apps/vscode-extension/src/library/pcmPersistence.ts`

**Interfaces:**

- Produces: `PCM_INSTALLED_STATE_KEY`, `PcmStateStorage`, `PcmInstalledPackagePersistence.read()`, and `PcmInstalledPackagePersistence.write()`.

- [x] Write failing tests for malformed-state filtering, state writes, foreign-record preservation, managed-record removal, malformed JSON recovery, and timestamp serialization.
- [x] Run the focused test and confirm it fails because the module does not exist.
- [x] Implement the minimal adapter with no VS Code import.
- [x] Run the focused tests and confirm they pass.

### Task 2: Delegate service persistence

**Files:**

- Modify: `apps/vscode-extension/src/library/pcmService.ts`
- Test: `apps/vscode-extension/test/unit/pcmService.test.ts`

**Interfaces:**

- Consumes: `PcmInstalledPackagePersistence` from Task 1.
- Produces: unchanged `PcmService` public behavior.

- [x] Initialize the adapter from `context.globalState` and `getConfigDir()`.
- [x] Replace constructor reads and install/uninstall writes with adapter calls.
- [x] Remove persistence-only helpers and imports from `pcmService.ts`.
- [x] Run persistence and service tests.

### Task 3: Enforce and document the boundary

**Files:**

- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/architecture/vscode-hotspots.md`

**Interfaces:**

- Produces: an architecture allowlist requiring only `node:fs`, `node:path`, and `./pcmCatalog` imports.

- [x] Add an architecture regression test for the adapter dependency allowlist.
- [x] Update module counts, line counts, and ownership documentation.
- [x] Run architecture, lint, typecheck, full extension, docs, and repository pre-push gates.
