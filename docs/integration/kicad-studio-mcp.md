# KiCad Studio and KiCad MCP Pro Integration

KiCad Studio and KiCad MCP Pro are independent products in one repository. They integrate through MCP protocol surfaces rather than direct source imports.

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
- `oaslananka/kicad-mcp` (MCP server source in [separate repository](https://github.com/oaslananka/kicad-mcp))

Run:

```bash
corepack pnpm run check:protocol-schemas
corepack pnpm run check:compatibility-contract
```

## Change rules

Extension-only UI or command changes do not require MCP server changes unless the MCP contract changes.

MCP server tool changes must update server metadata, tests, and any extension adapter assumptions.

Protocol changes must update both product tests, compatibility metadata, release notes, and the integration documentation.
