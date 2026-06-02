# Publishing

Publishing is GitHub-only and uses the canonical repository `oaslananka/kicad-studio-kit`.

## Version Availability

```bash
npm view kicad-mcp-pro@3.5.2 version --json || true
python -m pip index versions kicad-mcp-pro || true
```

```powershell
npm view 'kicad-mcp-pro@3.5.2' version --json
python -m pip index versions kicad-mcp-pro
```

If the target version from `packages/mcp-server/pyproject.toml` already exists on a target registry, the publish preflight must fail. Do not automatically bump the version.

Before publishing, run `corepack pnpm run check:compatibility` and confirm `compatibility.yaml` matches the release notes and [support matrix](support-matrix.md).

## Product Dry Runs

Run the product-specific dry-run before merging release PRs or release tooling changes:

```bash
corepack pnpm run release:dry-run:kicad-studio
corepack pnpm run release:dry-run:kicad-mcp-pro
corepack pnpm run release:dry-run
```

`release:dry-run:kicad-studio` validates the extension release-please package path, product changelog path, component tag naming, and that the extension is not linked to the MCP product version.

`release:dry-run:kicad-mcp-pro` validates MCP metadata synchronization, MCP release preflight, and compatibility metadata. The Python package is the only remaining kicad-mcp-pro artifact.

Protocol or tool-schema changes must update compatibility metadata and release notes for both products before publishing.

## Required GitHub Environments

- `extension-marketplaces`
- `pypi`
- `testpypi`
- `npm`
- `mcp-registry`
- `ghcr`
- `release`

## Required Secrets

- `VSCE_PAT`: environment `extension-marketplaces`
- `OVSX_PAT`: environment `extension-marketplaces`
- `GITHUB_TOKEN`: built in

Do not configure package registry tokens for PyPI, TestPyPI, or npm. Those publish paths use trusted publishing through OIDC.

`VSCE_PAT` and `OVSX_PAT` must be scoped to the `extension-marketplaces` environment only. Rotate both tokens at least every 180 days, immediately after any maintainer access change, and immediately after any failed or suspicious publish attempt. Token rotation must update the environment secret before the old token is revoked so the next guarded workflow run can validate the replacement.

## Trusted Publisher Setup

PyPI:

- owner: `oaslananka`
- repository: `kicad-studio-kit`
- workflow: `publish-python.yml`
- environment: `pypi`
- package: `kicad-mcp-pro`
- authentication: PyPI Trusted Publishing through GitHub OIDC
- provenance: `pypa/gh-action-pypi-publish` uploads PyPI attestations with
  `attestations: true`

TestPyPI:

- owner: `oaslananka`
- repository: `kicad-studio-kit`
- workflow: `publish-python.yml`
- environment: `testpypi`
- package: `kicad-mcp-pro`
- authentication: TestPyPI Trusted Publishing through GitHub OIDC
- provenance: `pypa/gh-action-pypi-publish` uploads PyPI attestations with
  `attestations: true`

Npm:

- package: `kicad-mcp-pro`
- provider: GitHub Actions
- organization/user: `oaslananka`
- repository: `kicad-studio-kit`
- workflow filename: `publish-npm.yml`
- environment: `npm`
- runner: GitHub-hosted `ubuntu-24.04`
- provenance: npm trusted publishing automatically emits provenance for public
  packages from public GitHub repositories; the workflow keeps
  `npm publish --provenance` as an explicit release guard.

Open VSX:

- publisher namespace: `oaslananka`
- extension URL: `https://open-vsx.org/extension/oaslananka/kicadstudiokit`
- secret: `OVSX_PAT`
- Eclipse account and Open VSX Publisher Agreement must be complete externally.
- namespace ownership and token generation are managed in the Open VSX account settings.
- the `publish-extension.yml` Open VSX job runs only after the Visual Studio Marketplace job succeeds.
- the Open VSX job reuses the same VSIX artifact uploaded by the package job.
- Open VSX failures are isolated from the Marketplace publish result and must be retried only after inspecting the guarded release log.
- prerelease GitHub Releases skip Open VSX unless the release tag ends with `-openvsx`.
- the packaged README points Open VSX users to `apps/vscode-extension/CHANGELOG.md` for release notes.

VS Code Marketplace:

- publisher: `oaslananka`
- extension id: `oaslananka.kicadstudiokit`
- secret: `VSCE_PAT`
- beta channel: GitHub pre-release tags ending in `-beta.N`; package and
  publish steps must pass `--pre-release` for Marketplace and Open VSX beta
  submissions. See [beta-program.md](beta-program.md).

MCP Registry:

- server name: `io.github.oaslananka/kicad-mcp-pro`
- repo: `oaslananka/kicad-studio-kit`
- workflow: `publish-mcp-registry.yml`
- auth: GitHub OIDC
- server.json path: `packages/mcp-server/server.json`

GHCR:

- image: `ghcr.io/oaslananka/kicad-mcp-pro`
- repo: `oaslananka/kicad-studio-kit`
- workflow: `publish-mcp-container.yml`
- environment: `ghcr`
- auth: built-in `GITHUB_TOKEN` with `packages: write`
- signing: keyless Sigstore `cosign` with GitHub OIDC

## Extension Dry Run

PowerShell:

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter kicadstudiokit run build
corepack pnpm --filter kicadstudiokit run package
$vsix = Get-ChildItem -Path apps/vscode-extension -Filter *.vsix -Recurse | Sort-Object LastWriteTime | Select-Object -Last 1
corepack pnpm --filter kicadstudiokit exec vsce ls --tree --no-dependencies
corepack pnpm --filter kicadstudiokit exec ovsx publish --help
```

CMD:

```cmd
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter kicadstudiokit run build
corepack pnpm --filter kicadstudiokit run package
```

The `ovsx publish --help` command is the safe Open VSX CLI smoke check for local preflight. Do not run `ovsx publish` with a token outside `.github/workflows/publish-extension.yml`.

## Release Evidence

GitHub Releases are the durable release evidence index. Each product publish
workflow uploads product-scoped build artifacts, `SHA256SUMS.txt`,
`sbom.cdx.json`, GitHub artifact attestations, and post-publish verification
records when a GitHub Release triggers the workflow.

| Product                | Release assets                                                                    | Publish verification                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| VSIX                   | `kicadstudiokit-<version>.vsix`, `vscode-extension-SHA256SUMS.txt`, SBOM evidence | Verify checksum before Marketplace/Open VSX publish; verify Marketplace version and Open VSX digest. |
| Python wheel and sdist | wheel, sdist, `kicad-mcp-pro-python-SHA256SUMS.txt`, SBOM evidence                | Verify local checksums before publish; verify PyPI/TestPyPI SHA-256 digests after publish.           |

Local release policy verification:

```bash
corepack pnpm run release:verify
```

Windows 11 PowerShell:

```powershell
corepack pnpm run release:verify
```

## Rollback and re-publish policy

VS Code Marketplace and Open VSX:

- Prefer publishing a fixed patch version. Do not delete or reuse a version.
- If an extension must be hidden, unpublish it from the Marketplace or Open VSX
  publisher console, then publish a new patch version with fresh evidence.
- Keep the original GitHub Release evidence attached and add a maintainer note to
  the replacement release explaining the superseded version.

PyPI and TestPyPI:

- Do not delete files to replace them with different bytes. PyPI versions are
  immutable for practical release integrity.
- If a published distribution is defective, yank it when appropriate and publish
  a new patch version.
- Verify the new wheel and source distribution against the GitHub Release
  checksums and PyPI digest metadata before announcement.

npm:

- Do not unpublish stable versions except for the narrow windows and policy cases
  allowed by npm.
- Use `npm deprecate kicad-mcp-pro@<version> "<reason>"` for a bad release and
  publish a fixed patch version.
- Confirm `npm view kicad-mcp-pro@<version> dist.tarball --json` points to the
  tarball whose SHA-256 matches the GitHub Release checksum.
