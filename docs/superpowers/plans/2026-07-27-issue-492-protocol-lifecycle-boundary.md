# MCP Protocol Lifecycle Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Move MCP discovery/session/request lifecycle coordination out of `mcpClient.ts` while preserving current `2025-11-25` behavior and keeping draft stateless protocol behavior non-production.

**Architecture:** Add a protocol lifecycle coordinator that owns request IDs, coalesced discovery, protocol headers, response metadata, and session persistence behind a narrow store interface. Add a VS Code Memento-backed session-store adapter. `McpClient` continues to own endpoint configuration, connection/domain state, compatibility cards, diagnostics, and domain result normalization.

**Tech Stack:** TypeScript 6, Jest 30, Node 24, pnpm 11, VS Code Memento API.

## Global Constraints

- Preserve the public `McpClient` constructor and all current `2025-11-25` behavior.
- Keep `2025-11-25` as the only production-selectable protocol.
- Do not implement or activate the draft `2026-07-28` adapter.
- Do not introduce a source dependency on the external MCP server repository.
- Stateless adapters must not receive or persist legacy session state.
- Keep connection state, server-card capture, compatibility warnings, and domain normalization in `McpClient`.
- Every new test must reference `#492` in its name.

---

### Task 1: Lock lifecycle and session-store contracts

**Files:**

- Create: `apps/vscode-extension/test/unit/mcpProtocolLifecycle.test.ts`
- Create: `apps/vscode-extension/src/mcp/protocol/protocolLifecycle.ts`
- Create: `apps/vscode-extension/src/mcp/adapters/vscodeProtocolSessionStore.ts`

- [x] **Step 1: Write failing tests for discovery coalescing, request IDs, 2025 session persistence/reuse, clear-session behavior, and stateless session isolation.**
- [x] **Step 2: Run the focused Jest test and verify RED because the lifecycle/store modules do not exist.**
- [x] **Step 3: Implement the narrow lifecycle and session-store interfaces.**
- [x] **Step 4: Implement coalesced discovery, protocol request execution, response metadata application, and lifecycle-aware session isolation.**
- [x] **Step 5: Run focused tests and verify GREEN with direct lifecycle coverage.**

### Task 2: Integrate lifecycle ownership into McpClient

**Files:**

- Modify: `apps/vscode-extension/src/mcp/mcpClient.ts`
- Modify: `apps/vscode-extension/test/unit/mcpClient.test.ts`
- Modify: `apps/vscode-extension/test/unit/mcpClient.versionGate.test.ts`

- [x] **Step 1: Replace client-owned session ID, request ID, and readiness promise fields with `McpProtocolLifecycle`.**
- [x] **Step 2: Delegate discovery and request execution while retaining client state/card/error behavior.**
- [x] **Step 3: Clear protocol session through the lifecycle when compatibility becomes invalid.**
- [x] **Step 4: Run all MCP client, adapter, transport, and lifecycle tests.**

### Task 3: Enforce architecture ownership and document progress

**Files:**

- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/integration/kicad-studio-mcp.md`
- Modify: `docs/superpowers/plans/2026-07-20-issue-492-mcp-protocol-adapter-boundary.md`

- [x] **Step 1: Add import/dependency guards for the lifecycle and VS Code session-store adapter.**
- [x] **Step 2: Prevent `mcpClient.ts` from regaining request IDs, readiness promises, or direct session-key ownership.**
- [x] **Step 3: Record the completed lifecycle phase without claiming final 2026 compatibility.**
- [x] **Step 4: Run architecture, protocol-schema, compatibility, docs, lint, and typecheck gates.**

### Task 4: Verify and publish the phase

- [x] **Step 1: Run full extension validation and package checks.**
- [x] **Step 2: Review the complete phase-scoped diff and commit with DCO sign-off (`53389e9`).**
- [x] **Step 3: Run the full repository pre-push chain and publish the branch (970 unit, 128 ratchet, 12 security, 76 a11y, repeatable VSIX, docs, protocol, compatibility, supply-chain, and package gates passed).**
- [x] **Step 4: Open a phase-scoped PR without auto-closing the umbrella issue (PR 576).**
- [ ] **Step 5: Merge only after all required/external checks pass, sync canonical main, and update issue progress while keeping final 2026 activation open.**
