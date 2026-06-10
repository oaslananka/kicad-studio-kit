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

If the target version already exists on a target registry, the publish preflight must fail. Do not automatically bump the version.

Before publishing, run `corepack pnpm run check:compatibility-contract` and confirm `compatibility.yaml` matches the release notes and [support matrix](support-matrix.md).

## Product Dry Runs

Run the product-specific dry-run before merging release PRs or release tooling changes:

```bash
corepack pnpm run release:dry-run:kicad-studio
corepack pnpm run release:dry-run
```

`release:dry-run:kicad-studio` validates the extension release-please package path, product changelog path, component tag naming, and that the extension is not linked to the MCP product version.

MCP server release dry-runs are now owned by [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).

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

PyPI and TestPyPI are now configured and published from [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).

Npm publishes for `kicad-mcp-pro` are now managed from [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).

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

The Visual Studio Marketplace job is release-blocking and its post-publish
visibility and normalized VSIX payload checks fail closed. Open VSX remains a
separate non-blocking job, but it runs only after Marketplace succeeds and
records a failed job when indexing or payload verification does not complete
successfully. Registry-rewritten ZIP container metadata is ignored while every
packaged file name and byte is compared.

VS Code Marketplace:

- publisher: `oaslananka`
- extension id: `oaslananka.kicadstudiokit`
- secret: `VSCE_PAT`
- beta channel: GitHub pre-release tags ending in `-beta.N`; package and
  publish steps must pass `--pre-release` for Marketplace and Open VSX beta
  submissions. See [beta-program.md](beta-program.md).

MCP Registry:

- server name: `io.github.oaslananka/kicad-mcp-pro`
- repo: `oaslananka/kicad-mcp`
- workflow: `publish-mcp-registry.yml` (in kicad-mcp repo)
- auth: GitHub OIDC

GHCR:

- image: `ghcr.io/oaslananka/kicad-mcp-pro`
- repo: `oaslananka/kicad-mcp`
- workflow: `publish-mcp-container.yml` (in kicad-mcp repo)
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

To restore missing GitHub Release evidence without republishing either
marketplace, dispatch the protected workflow with the existing release tag:

```bash
gh workflow run publish-extension.yml --ref main \
  -f release_tag=vscode-extension-vX.Y.Z \
  -f publish_vscode=false \
  -f publish_openvsx=false
```

The workflow checks out the requested tag, rebuilds and validates the VSIX, and
attaches the VSIX, checksum, and SBOM to the existing GitHub Release.

## Release Evidence

GitHub Releases are the durable release evidence index. Each product publish
workflow uploads product-scoped build artifacts, `SHA256SUMS.txt`,
`sbom.cdx.json`, GitHub artifact attestations, and post-publish verification
records when a GitHub Release triggers the workflow.

| Product                | Release assets                                                                    | Publish verification                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| VSIX                   | `kicadstudiokit-<version>.vsix`, `vscode-extension-SHA256SUMS.txt`, SBOM evidence | Verify checksum before publish; verify Marketplace/Open VSX version and normalized VSIX payload.      |
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
