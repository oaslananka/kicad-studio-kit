# Issue 493 MCP Ownership Guidance Design

## Goal

Make every active MCP upgrade, release, testing, and compatibility instruction reflect the completed KiCad MCP Pro repository split and the published protocol-schema artifact model, while preserving historical evidence and intentional absence guards.

## Current problem

The repository already states that KiCad MCP Pro is a separate product, but several active documents still use the former repository shorthand (`kicad-mcp repo`) or instruct maintainers to edit removed local paths such as `packages/protocol-schemas/`. The existing `check-mcp-split-docs.mjs` catches only a few monorepo phrases and exempts all ADRs, so active ADR 0008 is outside policy enforcement.

A global text ban would be unsafe because old paths are legitimate in:

- accepted migration-history ADRs;
- generated/product changelogs;
- dated implementation plans;
- security and release evidence describing completed removals;
- guard documentation and scripts that require removed paths to stay absent.

## Classification model

The checker will classify files into four roles.

### Active operational guidance

Current instructions that maintainers act on. These files must not use retired repository names or instruct changes to removed local MCP paths. The initial explicit set includes:

- top-level `README.md`, `AGENTS.md`, and `CONTRIBUTING.md`;
- `docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md`;
- `docs/mcp/index.md`;
- `docs/publishing.md`;
- `docs/support-matrix.md`;
- `docs/testing-strategy.md`;
- `docs/architecture/product-boundaries.md`;
- `docs/RELEASE-COORDINATION.md`.

The set is explicit so ADR 0008 can be active while other ADRs remain historical. New operational files can be added deliberately with tests.

### Historical evidence

Files that may describe the old monorepo verbatim:

- ADRs except explicitly active ADRs;
- `docs/changelog/` and product `CHANGELOG.md` files;
- `docs/superpowers/` dated plans/specifications;
- completed migration/release/security evidence explicitly listed by policy.

Historical files are preserved rather than rewritten to erase architectural history.

### Migration guards

Files that intentionally mention removed paths to ensure they remain absent, such as protocol-schema guard docs, branch-protection ownership notes, cross-repo workflows, and validation scripts. A guard reference must describe absence/removal/forbidden state rather than an action to edit or publish from the local path.

### Other current content

All other current files remain covered by the existing global stale-monorepo phrase rules. They are not subject to the stricter active ownership-path rules unless promoted to the active set.

## Active guidance rules

Active operational guidance must fail on:

- local edit/source instructions containing `packages/protocol-schemas`, `packages/mcp-server`, or `packages/mcp-npm`;
- generic former-repository wording such as `kicad-mcp repo`, `kicad-mcp repository`, `on the kicad-mcp side`, or `kicad-mcp ships first`;
- ownership descriptions that omit the canonical product/repository name when directing a release or workflow action.

The remediation message will identify the expected owner:

- extension adapter, client compatibility, extension release, and local `compatibility.yaml`: this repository;
- MCP server implementation, Python SDK, server transport, server manifests, MCP Registry/container workflows, and schema source/publishing: KiCad MCP Pro;
- shared schema consumption: npm artifact `@oaslananka/kicad-protocol-schemas`;
- cross-product proof: published artifacts plus the cross-repo compatibility workflow.

## ADR 0008 ownership rewrite

ADR 0008 remains Draft until the final protocol specification and SDK support are available. It will be rewritten as a cross-repository execution plan with separate owner columns and phases:

1. extension preparation in this repository;
2. schema/server implementation and publication in KiCad MCP Pro;
3. published schema consumption and extension adapter activation here;
4. cross-repo canary and release ordering;
5. optional post-final feature adoption.

It will not instruct this repository to change Python server files or removed schema paths. It may name external file paths only when prefixed by the KiCad MCP Pro owner.

## Release ordering

For a breaking protocol/schema transition:

1. KiCad MCP Pro updates and publishes `@oaslananka/kicad-protocol-schemas` with the required compatibility strategy.
2. KiCad MCP Pro publishes the server/runtime artifacts that implement the new protocol.
3. This repository bumps the published schema dependency, implements/activates the extension adapter, and validates the published server pair.
4. KiCad Studio tightens its required server range only after published-artifact canaries are green.

No repository publishes another repository's artifacts.

## Script interface

`check-mcp-split-docs.mjs` will export:

- `classifyMcpDocumentationPath(relativePath)`;
- `scanActiveOwnershipLine(line)`;
- existing global phrase APIs;
- `findMcpOwnershipDrift(root)` returning actionable file/line/role/hint records.

A dedicated root command will run the checker and its tests:

```bash
corepack pnpm run check:mcp-split-docs
```

`check:forbidden-refs` will compose that command after the generic forbidden-reference scan.

## Testing

Tests will prove that:

- ADR 0008 is active, not historical;
- ADR 0009, changelogs, and dated migration plans remain historical;
- guard files can retain removed-path absence statements;
- stale active local paths and former repository wording fail;
- canonical ownership language passes;
- the current repository is clean after documentation updates;
- package script wiring exposes `check:mcp-split-docs` and composes it into `check:forbidden-refs`.

## Scope boundaries

This change does not alter runtime code, protocol metadata, dependency versions, release workflows, historical migration records, or the implementation delivered by #501. It only clarifies ownership and strengthens documentation policy enforcement.
