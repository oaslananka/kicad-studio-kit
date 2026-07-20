# Product Boundaries

This repository releases one product — the KiCad Studio VS Code extension
(`apps/vscode-extension`) — alongside private shared test and fixture packages.
The KiCad MCP Pro server is developed and released from the separate
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/) repository. See
[ADR 0009](../adr/0009-split-kicad-mcp-pro-into-separate-repository.md).

The products remain source-decoupled and integrate only through published MCP
contracts, compatibility metadata, and canary evidence.

## Allowed dependencies

| Local surface             | May depend on                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `apps/vscode-extension`   | npm dependencies, VS Code APIs, KiCad CLI process calls, MCP protocol data, and the private test harness in tests only |
| `packages/kicad-fixtures` | fixture-generation dependencies and repository contract metadata                                                       |
| `packages/test-harness`   | Node standard library and shared test-only packages                                                                    |
| Future shared packages    | external dependencies and other shared packages, but not product internals                                             |

KiCad MCP Pro owns its Python dependencies, KiCad Python/CLI integrations,
server transport, server manifests, protocol-schema source, and publish
workflows in its own repository.

## Forbidden dependencies

- The extension must not import Python server modules such as `kicad_mcp.*`.
- KiCad MCP Pro must not import VS Code extension source.
- No product may reach into another repository's implementation through copied
  or relative source imports.
- Production source must not import `@oaslananka/kicad-test-harness` or
  path-reference `packages/test-harness`.
- `packages/*` shared packages must not depend on `apps/*`.
- Removed local MCP server, launcher, or schema-source workspaces must not be
  reintroduced.

## Integration rule

The products integrate through these explicit surfaces:

- this repository's `compatibility.yaml` client contract;
- `apps/vscode-extension/src/mcp/compatibilityMatrix.ts` and the extension
  protocol adapter;
- published `@oaslananka/kicad-protocol-schemas` schemas;
- published `kicad-mcp-pro` server artifacts;
- cross-repository contract, real-pair, and compatibility canaries.

Protocol changes must update each affected owner and the published-artifact
release order. Use the
[protocol change checklist](protocol-change-checklist.md) when changing tool
names, schemas, capability metadata, transport behavior, server-info payloads,
compatibility metadata, or extension adapter behavior.

## Enforcement

Run the boundary and ownership checks from the repository root:

```bash
corepack pnpm run check:boundaries
corepack pnpm run check:mcp-split-docs
```

The boundary checker fails when local production source imports another product
implementation, when production source imports the shared test harness, or when
the test harness imports product internals. The MCP split-doc checker prevents
active operational guidance from assigning work to removed local MCP paths or a
retired repository name.

This repository's `.github/CODEOWNERS` covers its local CI, architecture docs,
examples, extension, fixtures, and shared test packages. KiCad MCP Pro source
and protocol-schema source ownership is declared and enforced in the KiCad MCP
Pro repository. Branch protection guidance for this repository is documented in
[branch-protection.md](branch-protection.md).
