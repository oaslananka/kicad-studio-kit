# ADR 0002: MCP Contract-First Integration

Status: Accepted

Date: 2026-05-30

## Context

The two products in the monorepo — the VS Code extension and the MCP server —
integrate through the Model Context Protocol (MCP). Before this ADR, the
integration surface was documented but the exact contract boundary was not
formally defined.

The products must stay independent at source level while interoperating at
runtime. This requires a clear contract that both sides implement and that
can be validated in CI.

## Decision

Adopt a contract-first integration model:

1. **Compatibility metadata** — All integration surfaces are declared in
   `compatibility.yaml` at the repository root, with matching assertions in
   the extension (`apps/vscode-extension/src/mcp/compatibilityMatrix.ts`) and
   the MCP server (`oaslananka/kicad-mcp/src/kicad_mcp/compatibility.py`).

2. **MCP manifests** — The MCP server declares its capabilities through
   `mcp.json` and `server.json` under the [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) repository. The extension
   reads these manifests at runtime to determine which tools and features
   are available.

3. **MCP protocol** — Tool names, parameter schemas, capability metadata,
   transport behavior, and server-info payloads are part of the integration
   contract. Any change to these requires updating both product surfaces and
   the compatibility validation scripts.

4. **Contract checks** — `corepack pnpm run check:protocol-schemas` and
   `corepack pnpm run check:compatibility-contract` validate the extension-side
   protocol schema and compatibility metadata. MCP server contract checks run in
   [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).

5. **Protocol change checklist** — The PR template requires a protocol impact
   section. The full checklist is documented in
   `docs/architecture/protocol-change-checklist.md`.

## Consequences

- Positive: Either product can be developed and released independently as
  long as the contract is preserved.
- Positive: CI catches contract drift before release.
- Positive: Newcomers can understand the integration surface from the
  manifests and contract tests.
- Negative: Protocol changes require coordinated updates in both products,
  adding overhead for cross-cutting features.
- Negative: The compatibility metadata must be kept in sync manually or
  through CI enforcement. Outdated metadata can block valid releases.

## Alternatives Considered

- **Shared protocol schema package**: Rejected. The MCP protocol version
  and JSON-RPC layer are standard; our product-specific contract is best
  expressed through compatibility tests rather than a shared schema that
  would couple the products at build time.
- **Extension imports server compatibility module directly**: Rejected.
  Would violate the no-cross-product-imports boundary (ADR 0004).

## Related

- Documented in `docs/architecture/product-boundaries.md`.
- Protocol change checklist: `docs/architecture/protocol-change-checklist.md`.
- Issue #67.
