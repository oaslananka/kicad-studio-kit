# Protocol Schemas

KiCad Studio Kit consumes `@oaslananka/kicad-protocol-schemas` from npm as the
compatibility contract source of truth between the VS Code extension and
`kicad-mcp-pro`. The canonical source repository is
[oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).

The schemas are product-neutral JSON Schema Draft 2020-12 documents. They do
not import VS Code APIs, Python server modules, or product runtime code. The
extension consumes the package validators, while MCP server contract tests load
the same `schemas/*.schema.json` files directly with Python `jsonschema`.

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

## Cross-repo Compatibility

The kicad-studio VS Code extension and kicad-mcp-pro MCP server define their
compatibility contract in `compatibility.yaml`. Both repositories maintain an
independent copy of this file with overlapping ranges for the two products.

### Compatibility contract (compatibility.yaml)

Each repo's `compatibility.yaml` declares the sibling product's acceptable range:

| Field                                        | kicad-studio-kit | kicad-mcp  |
| -------------------------------------------- | ---------------- | ---------- |
| `products.kicad-studio.compatibleMcpPro`     | `>=3.5.2 <4.0.0` | —          |
| `products.kicad-mcp-pro.compatibleExtension` | `>=1.0.0 <2.0.0` | same field |
| `mcp.protocolVersion`                        | `2025-11-25`     | same field |
| `kicad.primary`                              | `10.0.x`         | same field |

### Current CI coverage

1. **Cross-repo compatibility canary** (`.github/workflows/cross-repo-compatibility.yml`):
   - Runs on `workflow_dispatch`, `push to main`, and PRs touching relevant files.
   - Validates published artifacts: npm `@oaslananka/kicad-protocol-schemas` resolves
     and imports correctly, and published `kicad-mcp-pro` is smoketested from PyPI.
   - Guards against re-introducing the local `packages/protocol-schemas` directory.
   - Runs `check:compatibility-contract` and `check:protocol-schemas` against published artifacts,
     not the local workspace sibling.
   - Does **not** require a real KiCad installation.
   - See `scripts/check-cross-repo-compatibility.mjs` for the helper script.

2. **kicad-mcp CI has no job installing the latest published kicadstudiokit VSIX
   and running compatibility checks.** The kicad-mcp workflow tests the MCP
   server against schemas and local tools, but never against a real VSIX.

3. **No scheduled cross-repo cron job detects protocol drift.** Neither repo has
   a periodic workflow that fetches the latest sibling release and runs the full
   compatibility gate beyond the canary.

### Canary scope

The cross-repo compatibility canary validates **published artifacts only**:

| Check                                    | What it verifies                                                |
| ---------------------------------------- | --------------------------------------------------------------- |
| npm `@oaslananka/kicad-protocol-schemas` | Package resolves and exports `validateProtocolPayload`          |
| PyPI `kicad-mcp-pro`                     | Published version resolves (smoke-test, not full integration)   |
| `compatibility.yaml`                     | Studio declares the external `compatibleMcpPro` range            |
| Guard                                    | `packages/protocol-schemas` local directory must NOT exist      |
| `check:protocol-schemas`                 | Existing npm-schema resolution check                            |
| `check:compatibility-contract`           | Existing compatibility matrix validation                        |

The canary does **not** replace a full cross-repo contract test (which would require
installing a VSIX or running the complete MCP server via PyPI). It is a lightweight
regression gate that publishes a compatibility summary on every relevant change.

### Release coordination

> **Note**: The [Release Coordination Runbook](./RELEASE-COORDINATION.md) is
> the standalone single-source-of-truth for sequencing, verifying, and
> recovering from multi-product releases. This section summarizes the
> protocol-specific parts; the runbook has the full operational details.

Both products currently ship independently from their own release-please
workflows, with overlapping version ranges providing backward-compatibility
guarantees. Protocol-breaking changes must follow a sequenced two-step release:

1. **kicad-mcp-pro ships first** with backward-compatible protocol — widens
   `compatibleExtension` range.
2. **kicad-studio ships second** with tightened `compatibleMcpPro` range.

Non-breaking releases can ship independently in any order.

### Emergency flow

If a kicad-mcp-pro release breaks a deployed kicad-studio instance:

- **Option A (preferred)**: Yank the broken PyPI/npm version, pin the
  affected extension range to the last known good version, cut a patch
  extension release with a pinned `compatibleMcpPro` upper bound. See
  [Rollback, pin, and yank](./RELEASE-COORDINATION.md#d-release-freeze-rollback-pin-and-yank)
  in the runbook for per-registry procedures.
- **Option B (mitigation)**: kicad-studio issues an advisory pin with
  `required: "<current-fixed-version"` and validates against a canary
  before widening again.

For the full operational playbook — including incident type identification,
freeze rules, per-registry recovery commands, a decision tree, and a
post-incident checklist — see
[Emergency release flow](./EMERGENCY-RELEASE-FLOW.md).

The protocol-schemas package (`@oaslananka/kicad-protocol-schemas`) serves as
the lowest-common-denominator contract — both products consume the same JSON
Schema files and validators, reducing the surface area for silent drift.

Work items for further cross-repo compatibility hardening are tracked in
[issue #288](https://github.com/oaslananka/kicad-studio-kit/issues/288 "Phase 2 — Step 3: Cross-repo compatibility and release coordination").

## Release Lifecycle

### Source of truth

The canonical schema source lives in
[oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp). Publishing a
new version of `@oaslananka/kicad-protocol-schemas` is owned by the
**kicad-mcp** repository. The kicad-studio-kit repository then consumes the
published version as a dependency.

### CI trigger

The kicad-mcp publish workflow (`publish-protocol-schemas.yml`) triggers on
**GitHub Release published** (tag-based, via Release Please) and supports
manual `workflow_dispatch` for ad-hoc or emergency publishes. This is the
finalized CI trigger for protocol-schema releases.

The v1.x line starts with the dual trigger (release + manual dispatch).
Graduating to tag-only publishing may be considered once the release trust
is well established. Renovate handles consumer dependency updates regardless
of the trigger choice.

### When to release

A new npm release of `@oaslananka/kicad-protocol-schemas` is required when:

- Adding a new schema file for an MCP tool, capability, or server-info surface.
- Adding, removing, or renaming fields in an existing schema.
- Bumping `schemaVersion` for breaking or additive changes.
- Changing compatibility metadata that the Studio extension or MCP server reads
  from the package validators or schema registry exports.

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
2. Release Please creates a GitHub Release, which triggers the kicad-mcp
   publish workflow (`publish-protocol-schemas.yml`): `npm publish` + GitHub
   Release assets.
3. For ad-hoc or emergency publishes, `workflow_dispatch` may be used directly
   from the kicad-mcp Actions tab.
4. Published version becomes available on npm after registry propagation.
5. `minimumReleaseAge` in `pnpm-workspace.yaml` must be satisfied (or the new
   version added to `minimumReleaseAgeExclude`) before CI accepts the version.
6. Studio bumps the dependency in `package.json`, runs the protocol-schemas
   contract gate, and completes a PR targeting the studio main branch.

### CI validation gates

The following checks ensure cross-repo integrity:

```bash
## Protocol schemas package resolves and exports match expectations
corepack pnpm run check:protocol-schemas

## Protocol-impact PRs must complete the protocol section of the PR template
corepack pnpm run check:protocol-pr-template

## Compatibility contract validation
corepack pnpm run check:compatibility-contract
```

### pnpm minimumReleaseAge policy

The `pnpm-workspace.yaml` `minimumReleaseAge: 1440` rule prevents CI from
accepting freshly published packages before 24 hours of registry propagation.
When a new protocol-schemas version must bypass this window (e.g. a CI pipeline
consuming a schema release from minutes ago), add the exact version to
`minimumReleaseAgeExclude`. Revert the exclusion when the age requirement is
satisfied or on the next version bump.

## Migration

Schema migrations are additive before they are breaking. Renames keep the old
field accepted for one minor line while producers emit the new field. The next
major schema version may remove the deprecated field only after extension and
MCP server contract tests both validate the replacement payload.

Run the full schema contract gate from the repository root:

```bash
corepack pnpm run check:protocol-schemas
```
