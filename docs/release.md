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

The publish workflows keep release evidence product-scoped:

- `publish-extension.yml` validates the VSIX, emits `SHA256SUMS.txt` and a
  CycloneDX SBOM, then creates GitHub artifact attestations for the checksummed
  extension package.
- `publish-python.yml` validates the wheel and source distribution, emits
  `SHA256SUMS.txt`, and creates GitHub artifact attestations for those
  distributions before PyPI trusted publishing.
- `publish-npm.yml` uses npm provenance for the MCP launcher package.

Release dry-runs also validate `compatibility.yaml` through the MCP server release preflight. Update [docs/support-matrix.md](support-matrix.md) and release notes whenever KiCad, VS Code, MCP, Node, pnpm, Python, or tool-schema support changes.

Run product dry-runs before merging release-related changes:

```bash
corepack pnpm run release:dry-run:kicad-studio
corepack pnpm run release:dry-run:kicad-mcp-pro
corepack pnpm run release:dry-run
```
