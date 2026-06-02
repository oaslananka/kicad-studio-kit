# Release

Current product versions are represented in:

- `.release-please-manifest.json`
- `apps/vscode-extension/package.json`

The MCP server (`kicad-mcp-pro`) source and version files now live in [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).

`.release-please-manifest.json` tracks product package paths only. The private repository root is not released.

Release PRs are created by `.github/workflows/release-please.yml` with separate Release Please pull requests per product package path. The VS Code extension can release independently from the MCP server. Release publication workflows run from GitHub Releases and protected environments.

The publish workflows keep release evidence product-scoped:

- `publish-extension.yml` validates the VSIX, emits `SHA256SUMS.txt` and a
  CycloneDX SBOM, creates GitHub artifact attestations for the checksummed
  extension package, publishes the shared VSIX to the Visual Studio Marketplace,
  verifies the Marketplace version, and then publishes the same VSIX to Open VSX
  in a separate non-blocking job that downloads the published VSIX and compares
  its digest with the release checksum.
- `publish-python.yml` (now in [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)) validates the wheel and source distribution, emits SHA256SUMS.txt, emits a CycloneDX SBOM,
  uploads that evidence as `python-release-evidence`, and creates GitHub
  artifact attestations for the Python wheel and source distribution before PyPI
  trusted publishing. The publish jobs verify local checksums before upload and
  verify PyPI/TestPyPI SHA-256 digests after upload. The `python-dist` artifact
  intentionally contains only `*.whl` and `*.tar.gz` files.
- `publish-mcp-container.yml` (now in [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)) validates the Docker image on pull requests and
  publishes signed multi-arch GHCR images with BuildKit SBOM/provenance for
  `mcp-server-v*` GitHub Releases.

Update [docs/support-matrix.md](support-matrix.md) and release notes whenever KiCad, VS Code, MCP, Node, pnpm, Python, or tool-schema support changes.

## Conventional Commit Scopes

Release Please derives product changelogs from Conventional Commits, so pull request titles and product-changing commits must use one of these scopes:

- `kicad-studio` for `apps/vscode-extension`.
- `kicad-mcp-pro` for `oaslananka/kicad-mcp` (source in separate repository).
- `repo` for repository governance, documentation, workflow, and shared release policy changes.
- `deps` for dependency-only updates.

Release Please generated PRs retain their upstream `chore(main): release ...` title format and are exempt from the human PR title scope gate.

Run product dry-runs before merging release-related changes:

```bash
corepack pnpm run release:dry-run:kicad-studio
corepack pnpm run release:dry-run
corepack pnpm run check:release-please
```
