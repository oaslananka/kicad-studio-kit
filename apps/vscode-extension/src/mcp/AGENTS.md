# MCP Client Boundary Agent Instructions

These instructions apply to `apps/vscode-extension/src/mcp/**` and supplement the parent
extension and root instructions.

## Ownership boundary

KiCad MCP Pro is an external repository and published-artifact dependency. This subtree
owns only the KiCad Studio extension-side client, protocol adapter, compatibility state,
transport/session lifecycle and UI-facing normalization.

Do not copy, import or recreate KiCad MCP Pro implementation modules in this repository.

## Contract sources

Treat these as the integration contract:

- root `compatibility.yaml`;
- published `@oaslananka/kicad-protocol-schemas`;
- extension protocol adapters and server-info/capability parsing;
- published KiCad MCP Pro artifacts exercised by cross-repository canaries.

Do not infer support from tool names or a successful TCP/HTTP connection alone.

## Fail-closed compatibility

- Unsupported, malformed or contradictory protocol/server metadata must fail closed or
  degrade explicitly; do not silently enable MCP-dependent actions.
- Preserve structured error semantics instead of flattening all failures into success-like
  empty responses.
- Remote endpoints require explicit opt-in. Keep loopback/local transport as the safe
  default and preserve token/trust checks for remote use.
- Workspace-trust restrictions apply to state-changing MCP operations and context pushes.

## Protocol lifecycle ownership

- `protocol/protocolLifecycle.ts` owns request IDs, request execution, coalesced discovery,
  response metadata and lifecycle-aware session reuse.
- The VS Code session-store adapter owns persisted protocol-session state behind its narrow
  interface.
- `mcpClient.ts` owns endpoint settings, connection state, compatibility presentation,
  diagnostics and domain normalization.

Do not push lifecycle responsibilities back into a monolithic client without a reviewed
architecture reason and regression tests.

## Protocol changes

Changes to tool names, schemas, capabilities, transport behavior, server-info payloads,
compatibility metadata or adapter behavior must follow
`docs/architecture/protocol-change-checklist.md`.

Update compatibility metadata, contract tests and both product release notes where the
cross-repository contract requires it. Validate against published artifacts rather than
local server source.
