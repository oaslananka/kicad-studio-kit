# Issue 492 MCP Protocol Adapter Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Follow test-driven development and verification-before-completion.

**Goal:** Establish a production-safe versioned MCP protocol and transport boundary while preserving current `2025-11-25` behavior.

**Architecture:** A strict protocol registry selects the active adapter. The 2025 adapter owns initialize/session semantics. An independent HTTP JSON-RPC transport owns execution/retry/parsing. `McpClient` keeps state and domain responsibilities. The 2026 RC is represented only by a non-production fixture.

**Tech stack:** TypeScript 6, Jest 30, Node 24, pnpm 11, VS Code extension host, published protocol-schema package.

## Global constraints

- Work only on issue `#492`.
- Preserve the public `McpClient` constructor call sites and runtime behavior.
- Keep `2025-11-25` as the only production-selectable protocol.
- Do not change external KiCad MCP Pro source or import it directly.
- Do not update compatibility metadata to claim `2026-07-28` support.
- Every new test must reference `#492` in its name or fixture metadata.
- Every non-trivial commit must carry a DCO sign-off.

### Task 1: Lock the protocol adapter contract with failing tests

**Files:**

- Create: `apps/vscode-extension/test/unit/mcpProtocolAdapter.test.ts`
- Create: `apps/vscode-extension/test/fixtures/mcp-protocol/2026-07-28-draft.json`

- [ ] Test production registry selection for `2025-11-25`.
- [ ] Test structured rejection of unsupported/draft versions.
- [ ] Test 2025 initialize request construction and client metadata.
- [ ] Test protocol/session headers with and without a session ID.
- [ ] Test response session extraction and discovery reuse rules.
- [ ] Test explicit negotiated-version mismatch diagnostics.
- [ ] Test that the 2026 fixture is marked draft, stateless, and non-selectable.
- [ ] Run the focused Jest command and verify RED because protocol modules do not exist.

### Task 2: Implement the production 2025 protocol adapter and registry

**Files:**

- Create: `apps/vscode-extension/src/mcp/protocol/protocolAdapter.ts`
- Create: `apps/vscode-extension/src/mcp/protocol/mcp2025ProtocolAdapter.ts`
- Create: `apps/vscode-extension/src/mcp/protocol/protocolAdapterRegistry.ts`

- [ ] Define versioned request, discovery, response metadata, and readiness interfaces.
- [ ] Add structured unsupported-version and mismatch error classes.
- [ ] Implement the exact current 2025 initialize/session behavior.
- [ ] Keep absent response `protocolVersion` backward compatible.
- [ ] Resolve only `2025-11-25` from the production registry.
- [ ] Run adapter tests and verify GREEN.

### Task 3: Lock the HTTP transport contract with failing tests

**Files:**

- Create: `apps/vscode-extension/test/unit/mcpHttpJsonRpcTransport.test.ts`

- [ ] Test primary `/mcp` JSON execution and serialized JSON-RPC envelope.
- [ ] Test `text/event-stream` parsing.
- [ ] Test legacy `/sse` fallback is opt-in and limited to 404/405.
- [ ] Test timeout signals and actionable timeout errors.
- [ ] Test exponential retry for transient responses/network errors.
- [ ] Test deterministic failures are not retried.
- [ ] Test traffic logger request/response/error calls.
- [ ] Run the focused Jest command and verify RED because the transport module does not exist.

### Task 4: Implement the independent HTTP JSON-RPC transport

**Files:**

- Create: `apps/vscode-extension/src/mcp/transport/httpJsonRpcTransport.ts`

- [ ] Define a transport interface independent of VS Code state and protocol sessions.
- [ ] Move timeout, response parsing, SSE parsing, retry classification, and backoff into the transport.
- [ ] Return raw response headers to the protocol adapter.
- [ ] Preserve the exact Streamable HTTP and opt-in legacy SSE behavior.
- [ ] Keep injected fetch/sleep seams for deterministic tests.
- [ ] Run transport tests and verify GREEN.

### Task 5: Integrate the boundary into McpClient with TDD

**Files:**

- Modify: `apps/vscode-extension/src/mcp/mcpClient.ts`
- Modify: `apps/vscode-extension/test/unit/mcpClient.test.ts`
- Modify: `apps/vscode-extension/test/unit/mcpClient.versionGate.test.ts`

- [ ] Add a failing regression for an explicit negotiated protocol mismatch.
- [ ] Replace `initializePromise` with protocol-ready lifecycle terminology.
- [ ] Select the active adapter from `MCP_PROTOCOL_VERSION`.
- [ ] Delegate discovery/header/response metadata behavior to the adapter.
- [ ] Delegate HTTP execution/retry/parsing to the transport.
- [ ] Remove migrated transport and session-specific helpers from `mcpClient.ts`.
- [ ] Keep state/card/domain normalization in `McpClient`.
- [ ] Run all MCP client/adapter/transport unit tests and verify GREEN.

### Task 6: Verify protocol and product acceptance criteria

**Files:**

- Update the plan checkboxes and protocol-impact PR evidence only.

- [ ] Run extension format, lint, and typecheck.
- [ ] Run focused MCP unit tests with coverage disabled for iteration.
- [ ] Run the complete extension unit coverage gate.
- [ ] Run extension security tests.
- [ ] Run `check:protocol-schemas` and `check:compatibility-contract`.
- [ ] Run real-server compatibility flow where the published artifact is available.
- [ ] Run extension build, package, and package validation.
- [ ] Run `git diff --check` and review the complete diff.
- [ ] Commit with DCO sign-off.
- [ ] Push and open a draft PR linked to `#492`.
- [ ] Watch required GitHub checks to terminal state, address review findings, then mark ready.
