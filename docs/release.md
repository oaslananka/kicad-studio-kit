# Release

Before tagging or publishing a release candidate, a maintainer runs the
[release candidate smoke-test checklist](release-candidate-checklist.md) against
the packaged VSIX and records the results in the release PR or issue.

Extension Host release confidence is tracked by the
[VS Code integration and E2E test matrix](testing-strategy.md#vs-code-integration-and-e2e-test-matrix),
which maps operating systems, VS Code versions, KiCad lines, Workspace Trust
states, and single-root/multi-root workspace shapes to their covering tests and
CI lanes.

Current product versions are represented in:

- `.release-please-manifest.json`
- `apps/vscode-extension/package.json`

The MCP server (`kicad-mcp-pro`) source and version files now live in [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).

## Release Surface Source of Truth

`apps/vscode-extension/package.json` `version` is the single authoritative
extension version. It is pinned to `.release-please-manifest.json` by
`scripts/check-version-consistency.mjs`, and every other user-facing surface that
repeats the version is derived from it:

- the root `README.md` "Version Baseline" block (generated between
  `<!-- release-surface:start -->` / `<!-- release-surface:end -->` markers);
- `apps/vscode-extension/CHANGELOG.md` (owned by Release Please);
- `compatibility.yaml` `products.kicad-studio.version`;
- the generated `docs/support-matrix.md` and `docs/versions.md` tables (owned by
  `corepack pnpm run docs:generate`).

Verify every surface in one command before tagging or publishing:

```bash
corepack pnpm run check:release-surface
```

It fails with a per-file diff when any surface is stale. The README block is the
only hand-editable surface; regenerate it with:

```bash
corepack pnpm run release:surface
```

`check:release-surface` also runs inside `corepack pnpm run check:version`, so CI
fails on README or release-surface drift on every pull request. Marketplace and
Open VSX indexing remain advisory and never block a successful package upload
(see `publish-extension.yml`).

`.release-please-manifest.json` tracks product package paths only. The private repository root is not released.

Release PRs are created by `.github/workflows/release-please.yml` with separate Release Please pull requests per product package path. The VS Code extension can release independently from the MCP server. Release publication workflows run from GitHub Releases and protected environments.

The publish workflows keep release evidence product-scoped:

- `publish-extension.yml` validates the VSIX, emits `SHA256SUMS.txt`, a
  CycloneDX SBOM, a `provenance.json` record, and a human-readable
  `release-summary.md`, creates GitHub artifact attestations for the checksummed
  extension package, publishes the shared VSIX to the Visual Studio Marketplace,
  verifies the Marketplace version and normalized VSIX payload content, and then
  publishes the same VSIX to Open VSX in a separate non-blocking job that
  downloads the published VSIX and verifies the same payload content. The
  normalized comparison ignores registry-rewritten ZIP container metadata.
- `provenance.json` records the source commit, release tag, package version,
  build environment, and CI run identifiers so a downloaded VSIX can be traced
  back to the exact commit and workflow run that produced it. `release-summary.md`
  restates the same evidence and links the Visual Studio Marketplace, Open VSX,
  and GitHub Release locations for the published version.
- Release Please explicitly dispatches `publish-extension.yml` after creating a
  release because GitHub does not recursively trigger release-event workflows
  from releases created with `GITHUB_TOKEN`. The dispatch checks out the release
  tag and attaches VSIX, checksum, SBOM, and provenance evidence to that GitHub
  Release.
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
- `docs` for documentation-only changes (changelogs, README, architecture docs, spec documents).
- `superpowers` for cross-cutting capability or spec-design documentation.
- `.gitignore` for `.gitignore` file changes (single-file repo governance).
- `deps` for dependency and tooling updates.
- `deps` for dependency-only updates.

Release Please generated PRs retain their upstream `chore(main): release ...` title format and are exempt from the human PR title scope gate.

Run product dry-runs before merging release-related changes:

```bash
corepack pnpm run release:dry-run:kicad-studio
corepack pnpm run release:dry-run
corepack pnpm run check:release-please
```
