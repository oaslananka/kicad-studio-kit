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
- secret: `OVSX_PAT`
- Eclipse account and Open VSX Publisher Agreement must be complete externally.

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
```

CMD:

```cmd
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter kicadstudio run build
corepack pnpm --filter kicadstudio run package
```
