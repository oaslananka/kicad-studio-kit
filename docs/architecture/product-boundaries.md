# Product Boundaries

The monorepo has three product workspaces, but the products must stay decoupled at source level.

## Allowed dependencies

| From                    | May depend on                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/vscode-extension` | npm dependencies, VS Code APIs, KiCad CLI process calls, MCP protocol data, test harness in tests only                                                             |
| `packages/mcp-server`   | Python dependencies, KiCad Python/CLI integrations, MCP protocol data (transitional — see [ADR-0009](../adr/0009-split-kicad-mcp-pro-into-separate-repository.md)) |
| `packages/mcp-npm`      | Node standard library and the published Python package name (transitional — will move to `oaslananka/kicad-mcp`)                                                   |
| `packages/test-harness` | Node standard library and shared packages only                                                                                                                     |
| future shared packages  | external dependencies and other shared packages only                                                                                                               |

## Forbidden dependencies

- The extension must not import Python server modules such as `kicad_mcp.*`.
- The MCP server must not import VS Code extension source or npm wrapper implementation.
- The npm launcher must not import extension source or Python server source.
- No product may reach into another product with relative imports.
- Production source must not import `@oaslananka/kicad-test-harness` or
  path-reference `packages/test-harness`.
- `packages/*` shared packages must not depend on `apps/*`.

## Integration rule

The products integrate through MCP protocol and metadata:

- `compatibility.yaml`
- `apps/vscode-extension/src/mcp/compatibilityMatrix.ts`
- `packages/mcp-server/src/kicad_mcp/compatibility.py`
- `packages/mcp-server/mcp.json`
- `packages/mcp-server/server.json`
- contract and compatibility checks

Protocol changes must update both product surfaces and the compatibility validation scripts.
Use the [protocol change checklist](protocol-change-checklist.md) when changing
tool names, schemas, capability metadata, transport behavior, server-info
payloads, or extension adapter behavior.

## Enforcement

Run the boundary checker from the repository root:

```bash
corepack pnpm run check:boundaries
```

The checker fails when a product source file imports or path-references another
product workspace implementation, when production source imports the shared test
harness, or when the test harness imports product internals. CI runs the same
check in the metadata job.

Ownership is declared in `.github/CODEOWNERS` for `.github/`, architecture docs,
examples, the extension, the MCP server, the npm wrapper, and shared protocol
schemas. Branch protection guidance is documented in
[branch-protection.md](branch-protection.md).
