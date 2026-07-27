# Export State Store Boundary Plan

## Goal

Extract export, BOM, and netlist lifecycle state from the broad state-store aggregator while preserving the existing import surface and diagnostic redaction behavior.

## Scope

- Add `apps/vscode-extension/src/state/exportStateStore.ts`.
- Move `ExportStateStore` and its export-surface types out of `stateStores.ts`.
- Preserve aggregator imports through a compatibility re-export.
- Add direct tests for lifecycle isolation, snapshots, error normalization, redaction, events, and disposal.
- Add a reviewed architecture dependency allowlist.
- Update hotspot ownership, module counts, and line counts.

## Out of Scope

- Export command orchestration or CLI argument generation.
- BOM/netlist provider behavior.
- Diagnostic state extraction.
- Shared type migration unless required by this boundary.

## Test-Driven Steps

### 1. Establish the direct contract

- [x] Write failing tests for lifecycle isolation, snapshots, errors, redaction, events, and disposal.
- [x] Run the focused test and confirm it fails because the module does not exist.
- [x] Implement the minimal export state store module.
- [x] Run direct tests and confirm they pass.

### 2. Preserve the compatibility surface

- Modify: `apps/vscode-extension/src/state/stateStores.ts`
- Test: existing state-store, export-command, BOM-view, and netlist-view tests.

- [x] Remove export-only implementation and types from `stateStores.ts`.
- [x] Re-export `ExportStateStore`, `ExportSurfaceKind`, and `ExportStateSnapshot` from the aggregator.
- [x] Run existing export state consumers and state-store tests.

### 3. Lock architecture and documentation

- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/architecture/vscode-hotspots.md`

- [x] Add an architecture regression test for the export-store dependency allowlist.
- [x] Update module counts, line counts, and ownership documentation.
- [x] Run architecture, lint, typecheck, full extension, docs, and repository pre-push gates.
