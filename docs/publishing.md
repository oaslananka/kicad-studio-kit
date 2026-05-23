# Publishing

Publishing is GitHub-only and uses the canonical repository `oaslananka/kicad-studio-kit`.

## Version Availability

```bash
npm view @oaslananka/kicad-mcp-pro@1.0.0 version --json || true
python -m pip index versions kicad-mcp-pro || true
```

```powershell
npm view '@oaslananka/kicad-mcp-pro@1.0.0' version --json
python -m pip index versions kicad-mcp-pro
```

If `1.0.0` already exists on a target registry, the publish preflight must fail. Do not automatically bump the version.

Before publishing, run `corepack pnpm run check:compatibility` and confirm `compatibility.yaml` matches the release notes and [support matrix](support-matrix.md).

## Product Dry Runs

Run the product-specific dry-run before merging release PRs or release tooling changes:

```bash
corepack pnpm run release:dry-run:kicad-studio
corepack pnpm run release:dry-run:kicad-mcp-pro
corepack pnpm run release:dry-run
```

`release:dry-run:kicad-studio` validates the extension release-please package path, product changelog path, component tag naming, and that the extension is not linked to the MCP product version.

`release:dry-run:kicad-mcp-pro` validates MCP metadata synchronization, MCP release preflight, compatibility metadata, and the npm launcher package dry-run. The Python package and npm launcher remain one versioned MCP product.

Protocol or tool-schema changes must update compatibility metadata and release notes for both products before publishing.

## Required GitHub Environments

- `extension-marketplaces`
- `pypi`
- `testpypi`
- `npm`
- `mcp-registry`
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

TestPyPI:

- owner: `oaslananka`
- repository: `kicad-studio-kit`
- workflow: `publish-python.yml`
- environment: `testpypi`

npm:

- package: `@oaslananka/kicad-mcp-pro`
- provider: GitHub Actions
- organization/user: `oaslananka`
- repository: `kicad-studio-kit`
- workflow filename: `publish-npm.yml`
- environment: `npm`
- runner: GitHub-hosted `ubuntu-24.04`

Open VSX:

- publisher namespace: `oaslananka`
- extension URL: `https://open-vsx.org/extension/oaslananka/kicadstudio`
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
- extension id: `oaslananka.kicadstudio`
- secret: `VSCE_PAT`

MCP Registry:

- server name: `io.github.oaslananka/kicad-mcp-pro`
- repo: `oaslananka/kicad-studio-kit`
- workflow: `publish-mcp-registry.yml`
- auth: GitHub OIDC
- server.json path: `packages/mcp-server/server.json`

## Extension Dry Run

PowerShell:

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter kicadstudio run build
corepack pnpm --filter kicadstudio run package
$vsix = Get-ChildItem -Path apps/vscode-extension -Filter *.vsix -Recurse | Sort-Object LastWriteTime | Select-Object -Last 1
corepack pnpm --filter kicadstudio exec vsce ls --tree --no-dependencies
corepack pnpm --filter kicadstudio exec ovsx publish --help
```

CMD:

```cmd
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter kicadstudio run build
corepack pnpm --filter kicadstudio run package
```

The `ovsx publish --help` command is the safe Open VSX CLI smoke check for local preflight. Do not run `ovsx publish` with a token outside `.github/workflows/publish-extension.yml`.
