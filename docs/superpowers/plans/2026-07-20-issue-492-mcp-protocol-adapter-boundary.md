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

- [x] Test production registry selection for `2025-11-25`.
- [x] Test structured rejection of unsupported/draft versions.
- [x] Test 2025 initialize request construction and client metadata.
- [x] Test protocol/session headers with and without a session ID.
- [x] Test response session extraction and discovery reuse rules.
- [x] Test explicit negotiated-version mismatch diagnostics.
- [x] Test that the 2026 fixture is marked draft, stateless, and non-selectable.
- [x] Run the focused Jest command and verify RED because protocol modules do not exist.

### Task 2: Implement the production 2025 protocol adapter and registry

**Files:**

- Create: `apps/vscode-extension/src/mcp/protocol/protocolAdapter.ts`
- Create: `apps/vscode-extension/src/mcp/protocol/mcp2025ProtocolAdapter.ts`
- Create: `apps/vscode-extension/src/mcp/protocol/protocolAdapterRegistry.ts`

- [x] Define versioned request, discovery, response metadata, and readiness interfaces.
- [x] Add structured unsupported-version and mismatch error classes.
- [x] Implement the exact current 2025 initialize/session behavior.
- [x] Keep absent response `protocolVersion` backward compatible.
- [x] Resolve only `2025-11-25` from the production registry.
- [x] Run adapter tests and verify GREEN.

### Task 3: Lock the HTTP transport contract with failing tests

**Files:**

- Create: `apps/vscode-extension/test/unit/mcpHttpJsonRpcTransport.test.ts`

- [x] Test primary `/mcp` JSON execution and serialized JSON-RPC envelope.
- [x] Test `text/event-stream` parsing.
- [x] Test legacy `/sse` fallback is opt-in and limited to 404/405.
- [x] Test timeout signals and actionable timeout errors.
- [x] Test exponential retry for transient responses/network errors.
- [x] Test deterministic failures are not retried.
- [x] Test traffic logger request/response/error calls.
- [x] Run the focused Jest command and verify RED because the transport module does not exist.

### Task 4: Implement the independent HTTP JSON-RPC transport

**Files:**

- Create: `apps/vscode-extension/src/mcp/transport/httpJsonRpcTransport.ts`

- [x] Define a transport interface independent of VS Code state and protocol sessions.
- [x] Move timeout, response parsing, SSE parsing, retry classification, and backoff into the transport.
- [x] Return raw response headers to the protocol adapter.
- [x] Preserve the exact Streamable HTTP and opt-in legacy SSE behavior.
- [x] Keep injected fetch/sleep seams for deterministic tests.
- [x] Run transport tests and verify GREEN.

### Task 5: Integrate the boundary into McpClient with TDD

**Files:**

- Modify: `apps/vscode-extension/src/mcp/mcpClient.ts`
- Modify: `apps/vscode-extension/test/unit/mcpClient.test.ts`
- Modify: `apps/vscode-extension/test/unit/mcpClient.versionGate.test.ts`

- [x] Add a failing regression for an explicit negotiated protocol mismatch.
- [x] Replace `initializePromise` with protocol-ready lifecycle terminology.
- [x] Select the active adapter from `MCP_PROTOCOL_VERSION`.
- [x] Delegate discovery/header/response metadata behavior to the adapter.
- [x] Delegate HTTP execution/retry/parsing to the transport.
- [x] Remove migrated transport and session-specific helpers from `mcpClient.ts`.
- [x] Keep state/card/domain normalization in `McpClient`.
- [x] Run all MCP client/adapter/transport unit tests and verify GREEN.

### Task 6: Verify protocol and product acceptance criteria

**Files:**

- Update the plan checkboxes and protocol-impact PR evidence only.

- [x] Run extension format, lint, and typecheck.
- [x] Run focused MCP unit tests with coverage disabled for iteration.
- [x] Run the complete extension unit coverage gate.
- [x] Run extension security tests.
- [x] Run `check:protocol-schemas` and `check:compatibility-contract`.
- [x] Run real-server compatibility flow where the published artifact is available. The VPS-2 command was executed; all four flows reported `real-server skipped` because `uv` is unavailable, which is tracked by #490. GitHub real-pair CI remains required before the PR is marked ready.
- [x] Run extension build, package, and package validation.
- [x] Run `git diff --check` and review the complete diff.
- [x] Commit with DCO sign-off.
- [ ] Push and open a draft PR linked to `#492`.
- [ ] Watch required GitHub checks to terminal state, address review findings, then mark ready.
