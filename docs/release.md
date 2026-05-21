# Release

The `1.0.0` baseline is represented in:

- `.release-please-manifest.json`
- `apps/vscode-extension/package.json`
- `packages/mcp-server/pyproject.toml`
- `packages/mcp-server/src/kicad_mcp/__init__.py`
- `packages/mcp-server/mcp.json`
- `packages/mcp-server/server.json`
- `packages/mcp-npm/package.json`

`.release-please-manifest.json` tracks product package paths only. The private repository root is not released.

Release PRs are created by `.github/workflows/release-please.yml` with separate Release Please pull requests per product package path. The VS Code extension can release independently from `kicad-mcp-pro`; the MCP server Python package and npm launcher stay version-linked as one MCP product. Release publication workflows run from GitHub Releases and protected environments.

Release dry-runs also validate `compatibility.yaml` through the MCP server release preflight. Update [docs/support-matrix.md](support-matrix.md) and release notes whenever KiCad, VS Code, MCP, Node, pnpm, Python, or tool-schema support changes.

## Conventional Commit Scopes

Release Please derives product changelogs from Conventional Commits, so pull request titles and product-changing commits must use one of these scopes:

- `kicad-studio` for `apps/vscode-extension`.
- `kicad-mcp-pro` for `packages/mcp-server` and `packages/mcp-npm`.
- `repo` for repository governance, documentation, workflow, and shared release policy changes.
- `deps` for dependency-only updates.

Commits that touch both product directories must be split by product or use the multi-scope form `kicad-studio/kicad-mcp-pro`. Release Please generated PRs retain their upstream `chore(main): release ...` title format and are exempt from the human PR title scope gate.

Run product dry-runs before merging release-related changes:

```bash
corepack pnpm run release:dry-run:kicad-studio
corepack pnpm run release:dry-run:kicad-mcp-pro
corepack pnpm run release:dry-run
corepack pnpm run check:release-please
```
