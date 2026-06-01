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

## Release Lifecycle

### Source of truth

The canonical schema source lives in
[oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp). Publishing a
new version of `@oaslananka/kicad-protocol-schemas` requires a version tag push
in the **kicad-mcp** repository. The kicad-mcp npm publish workflow creates a
GitHub release and pushes the package to npm. The kicad-studio-kit repository
then consumes the published version as a dependency.

### When to release

A new npm release of `@oaslananka/kicad-protocol-schemas` is required when:

- Adding a new schema file for an MCP tool, capability, or server-info surface.
- Adding, removing, or renaming fields in an existing schema.
- Bumping `schemaVersion` for breaking or additive changes.
- Changing compatibility metadata that the Studio extension or MCP server reads
  from the package exports (`readSchema`, `compatibility`).

### When a release is NOT required

A schema release is **not** required when:

- Changes are limited to the kicad-studio-kit monorepo (extension adapters,
  MCP server Python code, tests, documentation, CI workflows).
- Schema content is unchanged and only consumer code is modified.
- The change is a Studio-only internal refactor that does not affect the
  published contract surface.

In those cases, consume the existing npm version without bumping the dependency.

### Cross-repo release process

1. Schema change committed and tagged in `oaslananka/kicad-mcp`.
2. Tag push triggers the kicad-mcp publish workflow: `npm publish` + GitHub
   Release creation.
3. Published version becomes available on npm after registry propagation.
4. `minimumReleaseAge` in `pnpm-workspace.yaml` must be satisfied (or the new
   version added to `minimumReleaseAgeExclude`) before CI accepts the version.
5. Studio bumps the dependency in `package.json`, runs the protocol-schemas
   contract gate, and completes a PR targeting the studio main branch.

### CI validation gates

The following checks ensure cross-repo integrity:

```bash
## Protocol schemas package resolves and exports match expectations
corepack pnpm run check:protocol-schemas

## Protocol-impact PRs must complete the protocol section of the PR template
corepack pnpm run check:protocol-pr-template

## Compatibility matrix validates against published schemas
corepack pnpm run check:compatibility

## Full contract suite
corepack pnpm run test:contract
```

### pnpm minimumReleaseAge policy

The `pnpm-workspace.yaml` `minimumReleaseAge: 1440` rule prevents CI from
accepting freshly published packages before 24 hours of registry propagation.
When a new protocol-schemas version must bypass this window (e.g. a CI pipeline
consuming a schema release from minutes ago), add the exact version to
`minimumReleaseAgeExclude`. Revert the exclusion when the age requirement is
satisfied or on the next version bump.

### cleanup

The local `packages/protocol-schemas/` directory is a migration remnant from
the pre-npm era. It remains on disk only as a reference during the transition
and will be removed in a follow-up PR once the npm-based consumption is fully
validated in CI (tracked in
[#288](https://github.com/oaslananka/kicad-studio-kit/issues/288)). Do not
introduce new code that depends on the local path.

## Migration

Schema migrations are additive before they are breaking. Renames keep the old
field accepted for one minor line while producers emit the new field. The next
major schema version may remove the deprecated field only after extension and
MCP server contract tests both validate the replacement payload.

Run the full schema contract gate from the repository root:

```bash
corepack pnpm run check:protocol-schemas
```
