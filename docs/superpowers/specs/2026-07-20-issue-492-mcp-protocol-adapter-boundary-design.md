# Issue 492 MCP Protocol Adapter Boundary Design

## Goal

Introduce an explicit, versioned MCP protocol adapter and a transport execution boundary without changing the extension's public `McpClient` API or claiming production support for the unfinalized `2026-07-28` protocol.

## Current problem

`apps/vscode-extension/src/mcp/mcpClient.ts` currently owns JSON-RPC envelope creation, HTTP execution, retries, timeout handling, Streamable HTTP and legacy SSE behavior, session headers, initialize lifecycle, compatibility discovery, state transitions, and domain result normalization. The concentration makes the final MCP `2026-07-28` migration risky because session-based `2025-11-25` behavior is not isolated from transport and extension state.

## Options considered

### Move only HTTP helpers

Extract `fetchWithTimeout`, SSE parsing, and retry helpers but leave initialize/session headers in `McpClient`.

Rejected because it reduces file size without creating a protocol-version boundary. Session behavior would still leak into future stateless requests.

### Implement both 2025 and 2026 adapters now

Create selectable production adapters for `2025-11-25` and `2026-07-28`.

Rejected because the `2026-07-28` specification is still an RC on 2026-07-20. Production code must not freeze draft envelope details or claim compatibility before the final specification and published server artifacts exist.

### Versioned active adapter plus non-production draft fixture

Create a protocol adapter contract, a production `2025-11-25` implementation, a strict registry, an independent HTTP JSON-RPC transport, and a draft fixture describing expected `2026-07-28` properties. The registry rejects the draft version with a structured diagnostic.

Chosen because it preserves current behavior, establishes the migration seam, and prevents unfinalized details from becoming runtime truth.

## Architecture

```text
mcp/
  protocol/
    protocolAdapter.ts
    mcp2025ProtocolAdapter.ts
    protocolAdapterRegistry.ts
  transport/
    httpJsonRpcTransport.ts
  mcpClient.ts

test/fixtures/mcp-protocol/
  2026-07-28-draft.json
```

Exact filenames may be adjusted for repository conventions, but ownership stays as follows:

- The protocol adapter owns protocol version, lifecycle/discovery request construction, version-specific headers, session metadata extraction, and discovery-result compatibility checks.
- The HTTP transport owns JSON-RPC serialization, request IDs supplied by the caller, timeout/abort behavior, retry/backoff, Streamable HTTP endpoint execution, opt-in legacy SSE fallback, response parsing, and traffic logging.
- `McpClient` owns extension state, persisted state, compatibility card construction, user diagnostics, and domain result normalization.

## Protocol contract

The active adapter contract exposes:

- `version` and lifecycle identity;
- discovery request creation from client metadata;
- request header creation from method and optional persisted session state;
- response metadata extraction;
- discovery-result validation;
- readiness reuse rules.

The `2025-11-25` adapter must preserve:

- `initialize` discovery;
- `MCP-Protocol-Version: 2025-11-25`;
- optional `MCP-Session-Id` request reuse and response extraction;
- current initialize result compatibility when `protocolVersion` is absent;
- a structured mismatch error when a server explicitly negotiates another version.

The future stateless adapter is not implemented in production. The draft fixture records expected RC properties such as `server/discover`, request `_meta`, method/name routing headers, and the absence of protocol sessions. Tests must state that the fixture is draft and non-selectable.

## Transport contract

The transport receives a complete protocol request context and returns the parsed JSON-RPC payload plus raw response headers. It does not know what a session header means. This prevents session state from becoming a transport-global assumption.

The transport preserves current behavior:

- POST to `<baseEndpoint>/mcp`;
- JSON and `text/event-stream` response parsing;
- legacy `/sse` fallback only when explicitly enabled and the primary endpoint returns 404 or 405;
- transient retry for timeout, 408, 429, 5xx, network/fetch failures;
- no retry for deterministic protocol or client failures;
- traffic log request, response, and error evidence.

## Compatibility and diagnostics

Production selection uses `compatibility.yaml` through `MCP_PROTOCOL_VERSION`. The registry supports only versions with implemented adapters. Unsupported active versions raise `UnsupportedMcpProtocolVersionError` with a stable code, requested version, supported versions, and remediation hint.

An explicit discovery mismatch raises `McpProtocolVersionMismatchError` with expected and received versions. Existing servers that omit the negotiated version remain supported during the current compatibility window.

## Testing

TDD evidence will cover:

- production registry selection and structured unsupported-version diagnostics;
- exact 2025 initialize request, headers, session extraction, readiness reuse, and mismatch validation;
- transport JSON/SSE parsing, fallback policy, timeout signal, retries, and non-transient failures;
- existing `McpClient` session, connection, version-gate, trust, and domain-normalization suites unchanged;
- a client mismatch regression referencing `#492`;
- the draft `2026-07-28` fixture remaining non-selectable and stateless;
- protocol schema, compatibility, real-pair, product, security, package, and cross-platform CI gates.

## Scope boundaries

This change does not:

- enable the final `2026-07-28` protocol;
- change `compatibility.yaml` active protocol metadata;
- update KiCad MCP Pro server source;
- add a direct source dependency on the external server repository;
- adopt Tasks, MCP Apps, caching, multi-round-trip requests, or new authorization behavior;
- change user configuration or the public `McpClient` command API.
