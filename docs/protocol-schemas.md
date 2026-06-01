# Protocol Schemas

KiCad Studio Kit consumes `@oaslananka/kicad-protocol-schemas` from npm as the
compatibility contract source of truth between the VS Code extension and
`kicad-mcp-pro`. The canonical source repository is
[oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).

The schemas are product-neutral JSON Schema Draft 2020-12 documents. They do
not import VS Code APIs, Python server modules, or product runtime code. The
extension consumes the package validators, while MCP server contract tests load
the same `schemas/*.schema.json` files directly with Python `jsonschema`.

> **Migration remnant**: The `packages/protocol-schemas/` directory remains on
> disk as a local reference during the transition. Studio no longer resolves
> schemas from this path. The directory will be removed in a follow-up cleanup
> PR after the npm-based consumption is fully validated in CI.

## Contracts

- `mcp-tool-discovery.schema.json` validates `tools/list` discovery payloads.
- `mcp-tool-capability.schema.json` validates advertised tool metadata.
- `extension-active-context.schema.json` validates IDE context pushed from the
  extension to MCP tools.
- `normalized-diagnostic.schema.json` validates DRC/ERC diagnostic records.
- `bom-netlist-summary.schema.json` validates shared BOM and netlist summaries.
- `mcp-server-health.schema.json` validates server health/version payloads.
- `compatibility-manifest.schema.json` validates cross-product schema support.
- `kicad-mcp-server-info.schema.json` validates the server-info capability
  contract surfaced through well-known metadata and MCP resources.

## Versioning

Each schema has `x-kicad-studio-kit.schemaVersion` in `MAJOR.MINOR.PATCH`
format. Breaking schema changes require a major version bump. Additive fields
use a minor version bump, and documentation-only or constraint-only fixes use a
patch bump.

Consumers must reject unknown major versions by default. A fallback path may
only be used when the caller explicitly chooses degraded compatibility behavior
and records the diagnostic.

## Migration

Schema migrations are additive before they are breaking. Renames keep the old
field accepted for one minor line while producers emit the new field. The next
major schema version may remove the deprecated field only after extension and
MCP server contract tests both validate the replacement payload.

Run the full schema contract gate from the repository root:

```bash
corepack pnpm run check:protocol-schemas
```
