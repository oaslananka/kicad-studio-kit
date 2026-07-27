# Diagnostic State Store Boundary Plan

## Goal

Extract DRC/ERC diagnostic state ownership from the compatibility aggregator while preserving validation, project scoping, Problems integration, freshness transitions, and existing imports.

## Scope

- Add `apps/vscode-extension/src/state/diagnosticStateStore.ts`.
- Move `DiagnosticStateStore`, diagnostic snapshot types, and diagnostic-only helpers out of `stateStores.ts`.
- Preserve aggregator imports through compatibility re-exports.
- Add direct tests for normalization, project isolation, failures, stale transitions, Problems metadata, cloning, events, and disposal.
- Add a reviewed architecture dependency allowlist.
- Update hotspot ownership, module counts, and line counts.

## Out of Scope

- KiCad CLI execution or validation parsing.
- Diagnostic UI/provider rendering.
- Shared diagnostic type migration unless required by this boundary.
- MCP protocol/client decomposition.

## Test-Driven Steps

### 1. Establish the direct contract

- [x] Write failing tests for normalization, project isolation, failures, stale transitions, cloning, events, and disposal.
- [x] Run the focused test and confirm it fails because the module does not exist.
- [x] Implement the minimal diagnostic state store module.
- [x] Run direct tests and confirm they pass.

### 2. Preserve the compatibility surface

- Modify: `apps/vscode-extension/src/state/stateStores.ts`
- Test: existing state-store, multi-project, validation-view, sidebar, activation, save-check, and language-model tests.

- [x] Remove diagnostic-only implementation and helpers from `stateStores.ts`.
- [x] Re-export `DiagnosticStateStore` and `DiagnosticStateSnapshot` from the aggregator.
- [x] Run existing diagnostic consumers and state-store tests.

### 3. Lock architecture and documentation

- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/architecture/vscode-hotspots.md`

- [x] Add an architecture regression test for the diagnostic-store dependency allowlist.
- [x] Update module counts, line counts, and ownership documentation.
- [x] Run architecture, lint, typecheck, full extension, docs, and repository pre-push gates.
