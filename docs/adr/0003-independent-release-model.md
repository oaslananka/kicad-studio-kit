# ADR 0003: Independent Release Model

Status: Accepted

Date: 2026-05-30

## Context

The monorepo produces two release surfaces: a VS Code extension (VSIX) and a
Python MCP server (sdist/wheel + MCP Registry).
Before this ADR, the release model used Release Please with linked versions
for the MCP product but the relationship between product versions and the
root version was not formally documented.

The products have different release cadences:

- The extension may release multiple times in a week for UI fixes.
- The MCP server releases are driven by protocol changes or KiCad
  compatibility updates.

Locking all products to the same version would force unnecessary releases
and create version bloat.

## Decision

Adopt an independent release model where each product version is decoupled:

1. **Version sources** — Each product owns its version file:
   - Extension: `apps/vscode-extension/package.json`
   - Python MCP server: `packages/mcp-server/pyproject.toml`

2. **MCP server** — `packages/mcp-server` releases as the
   `kicad-mcp-pro` product.

3. **Extension independence** — The extension is intentionally not part of
   the `kicad-mcp-pro` linked-version group. It can release independently.

4. **Conventional Commit scopes** define the release boundary:
   - `kicad-studio` → extension-only release PR.
   - `kicad-mcp-pro` → MCP server release PR.
   - `repo` → repository governance, docs, CI (no product release).
   - `deps` → dependency-only updates (no product release unless a product
     manifest changed).
   - `kicad-studio/kicad-mcp-pro` → cross-product change that CI must
     validate before Release Please runs.

5. **Compatibility gate** — Before any release, compatibility metadata must
   agree across the root matrix, extension, and MCP server. Protocol or
   schema changes must update compatibility metadata for both products
   before either release PR is merged.

## Consequences

- Positive: Each product releases at its own cadence. A UI fix in the
  extension does not require an MCP server release.
- Positive: Version numbers reflect meaningful changes per product rather
  than lockstep increments.
- Positive: Release Please automation handles version proposals through
  `.release-please-manifest.json` and `release-please-config.json`.
- Negative: Cross-product changes require careful scope separation and may
  need two release PRs.
- Negative: Compatibility metadata must be manually kept in sync or
  validated in CI to prevent incompatible releases.

## Alternatives Considered

- **Single version for all products**: Rejected. Would force unnecessary
  MCP server releases for extension-only changes and inflate version
  numbers for both products.
- **Separate repositories with independent release pipelines**: Rejected.
  Would lose shared CI, compatibility validation, and coordinated release
  communication (see ADR 0001).

## Related

- Documented in `docs/architecture/release-model.md`.
- Release Please config: `release-please-config.json`,
  `.release-please-manifest.json`.
- Issue #67.
