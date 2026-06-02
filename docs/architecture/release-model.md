# Release Model

KiCad Studio Kit uses one repository and separate product release surfaces.

| Product              | Version file                         | Artifact          | Publish workflow           |
| -------------------- | ------------------------------------ | ----------------- | -------------------------- |
| VS Code extension    | `apps/vscode-extension/package.json` | VSIX              | `publish-extension.yml`    |
| Python MCP server    | `packages/mcp-server/pyproject.toml` | sdist / wheel     | `publish-python.yml`       |
| MCP Registry listing | `packages/mcp-server/server.json`    | registry metadata | `publish-mcp-registry.yml` |

Release Please owns version proposals through `.release-please-manifest.json` and `release-please-config.json`. The manifest tracks product package paths only; the private repository root is not a release surface.

Release PRs are product-scoped:

- `apps/vscode-extension` releases as the VS Code extension product.
- `packages/mcp-server` is the only remaining `kicad-mcp-pro` source path. The linked-versions plugin is no longer needed.

The extension is intentionally not version-linked to the MCP product. It releases independently from its own Release Please PR.

Conventional Commit scopes are part of the release boundary. Use `kicad-studio` for extension-only changes, `kicad-mcp-pro` for MCP server changes, `repo` for repository governance and release policy, and `deps` for dependency-only updates. A single commit that touches both product directories must either be split or use `kicad-studio/kicad-mcp-pro` so CI can reject changelog cross-contamination before Release Please runs.

## Compatibility gate

Before release, compatibility metadata must agree across the root matrix, extension, MCP server, and MCP Registry manifests:

```bash
corepack pnpm run check:version
corepack pnpm run check:compatibility
corepack pnpm run test:contract
corepack pnpm run release:dry-run
```

The extension declares the MCP server range it supports, and the MCP server advertises protocol/tool compatibility through its server metadata.
Protocol or schema changes must update compatibility metadata and release notes for both products before either release PR is merged.

## Release ownership

Release and publish execution is intentionally external to normal development work:

- The release PR may update versions and changelogs.
- Publishing uses protected GitHub environments.
- PyPI and npm publish through trusted publishing/OIDC.
- Marketplace publish uses `VSCE_PAT` and `OVSX_PAT` in the `extension-marketplaces` environment.

Do not publish from local development shells.
