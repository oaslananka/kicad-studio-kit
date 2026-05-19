# Release

The `1.0.0` baseline is represented in:

- `.release-please-manifest.json`
- `apps/vscode-extension/package.json`
- `packages/mcp-server/pyproject.toml`
- `packages/mcp-server/src/kicad_mcp/__init__.py`
- `packages/mcp-server/mcp.json`
- `packages/mcp-server/server.json`
- `packages/mcp-npm/package.json`

Release PRs are created by `.github/workflows/release-please.yml`. Release publication workflows run from GitHub Releases and protected environments.
