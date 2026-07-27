# MCP State Store Boundary Plan

## Goal

Extract MCP connection-state ownership from the broad state-store aggregator while preserving the existing import surface and strengthening immutable nested metadata handling.

## Scope

- Add `apps/vscode-extension/src/state/mcpStateStore.ts`.
- Move `McpStateStore` and its MCP-specific clone helpers out of `stateStores.ts`.
- Preserve aggregator imports through a compatibility re-export.
- Add direct tests for nested cloning, legacy operating-mode defaults, redaction, events, and disposal.
- Add a reviewed architecture dependency allowlist.
- Update hotspot ownership, module counts, and line counts.

## Out of Scope

- MCP transport/protocol decomposition.
- MCP client behavior or compatibility policy changes.
- Diagnostic or export state extraction.
- Shared type migration unless required by this boundary.

## Test-Driven Steps

### 1. Establish the direct contract

- [x] Write failing tests for nested metadata cloning, defaults, redaction, events, and disposal.
- [x] Run the focused test and confirm it fails because the module does not exist.
- [x] Implement the minimal MCP state store module.
- [x] Run direct tests and confirm they pass.

### 2. Preserve the compatibility surface

- Modify: `apps/vscode-extension/src/state/stateStores.ts`
- Test: existing state-store, quality-gate, fix-queue, sidebar, and activation tests.

- [x] Remove MCP-only implementation and clone helpers from `stateStores.ts`.
- [x] Re-export `McpStateStore` from the aggregator.
- [x] Run existing MCP state consumers and state-store tests.

### 3. Lock architecture and documentation

- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/architecture/vscode-hotspots.md`

- [x] Add an architecture regression test for the MCP-store dependency allowlist.
- [x] Update module counts, line counts, and ownership documentation.
- [x] Run architecture, lint, typecheck, full extension, docs, and repository pre-push gates.
