# KiCad Studio and KiCad MCP Pro Integration

KiCad Studio and KiCad MCP Pro are independent products released from separate
repositories. KiCad Studio is the VS Code extension owned by this repository; the
KiCad MCP Pro server source lives in
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/) (see
[ADR 0009](../adr/0009-split-kicad-mcp-pro-into-separate-repository.md)). They
integrate through MCP protocol surfaces rather than direct source imports. This
repository owns only the extension-side MCP discovery, configuration, and
compatibility metadata.

## Runtime model

1. The VS Code extension discovers or starts an MCP-compatible KiCad MCP Pro server.
2. The extension checks the reported server version and compatibility metadata.
3. The extension calls MCP tools/resources/prompts over the configured transport.
4. The MCP server performs KiCad project, schematic, PCB, export, and validation work through its own Python implementation.
5. Results return as MCP responses and are rendered by the extension.

The extension must treat the server as a process/protocol boundary. The server must not depend on extension internals.

## Compatibility metadata

Compatibility is tracked in:

- `compatibility.yaml`
- `apps/vscode-extension/src/mcp/compatibilityMatrix.ts`
- KiCad MCP Pro (MCP server source in [separate repository](https://oaslananka.github.io/kicad-mcp-pro/))

Run:

```bash
corepack pnpm run check:protocol-schemas
corepack pnpm run check:compatibility-contract
```

## Change rules

Extension-only UI or command changes do not require MCP server changes unless the MCP contract changes.

MCP server tool changes must update server metadata, tests, and any extension adapter assumptions.

Protocol changes must update both product tests, compatibility metadata, release notes, and the integration documentation.

## Extension protocol adapter boundary

The extension keeps protocol-version behavior separate from HTTP execution:

- `apps/vscode-extension/src/mcp/protocol/` owns discovery lifecycle,
  protocol-specific request headers, response metadata such as the current
  session identifier, negotiated-version validation, and the strict registry of
  production-supported protocol adapters.
- `apps/vscode-extension/src/mcp/transport/` owns JSON-RPC serialization,
  Streamable HTTP execution, timeout and retry policy, JSON/SSE response
  parsing, the opt-in legacy `/sse` fallback, and traffic-log evidence. The
  transport returns raw response headers and must not interpret protocol
  sessions.
- `apps/vscode-extension/src/mcp/mcpClient.ts` owns VS Code state, persisted
  extension state, server compatibility cards, diagnostics, and domain result
  normalization. It selects the adapter named by `MCP_PROTOCOL_VERSION` and
  does not embed version-specific lifecycle behavior.

Only `2025-11-25` is production-selectable. The
`test/fixtures/mcp-protocol/2026-07-28-draft.json` envelope is an RC planning
fixture: it is explicitly non-selectable and cannot be treated as compatibility
metadata or a release claim. A final `2026-07-28` adapter must be implemented
from the published specification, validated against published KiCad MCP Pro
artifacts, and activated through a coordinated compatibility change.
