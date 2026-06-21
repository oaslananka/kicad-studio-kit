# Product Boundaries

This repository releases one product — the KiCad Studio VS Code extension
(`apps/vscode-extension`) — alongside private shared packages. The KiCad MCP Pro
server is released separately from
[oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) (see
[ADR 0009](../adr/0009-split-kicad-mcp-pro-into-separate-repository.md)). The two
products stay decoupled at source level and integrate only through the MCP
protocol contract.

## Allowed dependencies

| From                                                                            | May depend on                                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/vscode-extension`                                                         | npm dependencies, VS Code APIs, KiCad CLI process calls, MCP protocol data, test harness in tests only |
| (removed — see [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)) | Python dependencies, KiCad Python/CLI integrations, MCP protocol data                                  |

| `packages/test-harness` | Node standard library and shared packages only |
| future shared packages | external dependencies and other shared packages only |

## Forbidden dependencies

- The extension must not import Python server modules such as `kicad_mcp.*`.
- The MCP server must not import VS Code extension source.
- No product may reach into another product with relative imports.
- Production source must not import `@oaslananka/kicad-test-harness` or
  path-reference `packages/test-harness`.
- `packages/*` shared packages must not depend on `apps/*`.

## Integration rule

The products integrate through MCP protocol and metadata:

- `compatibility.yaml`
- `apps/vscode-extension/src/mcp/compatibilityMatrix.ts`
- `oaslananka/kicad-mcp` (source lives in the [kicad-mcp repo](https://github.com/oaslananka/kicad-mcp))
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
examples, the extension, the MCP server, and shared protocol
schemas. Branch protection guidance is documented in
[branch-protection.md](branch-protection.md).
