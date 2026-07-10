# CI/CD Routing

KiCad Studio Kit uses `https://github.com/oaslananka/kicad-studio-kit` as the only canonical repository and automation authority.

## Repository Roles

- Canonical repository: `https://github.com/oaslananka/kicad-studio-kit`
- VS Code extension package root: `apps/vscode-extension`
- Python MCP package root: [oaslananka/kicad-mcp-pro](https://github.com/oaslananka/kicad-mcp-pro) (removed from this monorepo)
- npm launcher package root: `packages/mcp-npm` (now migrated to `oaslananka/kicad-mcp-pro`).

## Trigger Policy

- GitHub Actions run CI for pushes to `main`, pull requests, schedules, and manual dispatch where configured.
- Release and publish workflows run from this repository and use GitHub environments for approval and secret scoping.
- Release versions are derived by release-please from Conventional Commit history and the manifest.

## Pull Requests

Pull requests run the same correctness gates used on `main`:

- metadata checks
- format and lint checks
- type checks
- unit tests
- build/package checks
- secret scan
- CodeQL

Workflow-only changes must pass workflow validation and secret scanning before merge.

## Required GitHub Secrets

Configure these in the repository or as selected organization secrets:

- `VSCE_PAT`: VS Code Marketplace publish token.
- `OVSX_PAT`: Open VSX publish token.

PyPI, TestPyPI, and npm publishing use trusted publishing through GitHub OIDC and must not use package registry tokens.

Do not print tokens or store API keys in the repository.

## Suggested Local Remote

Use the canonical repository as `origin`:

```bash
git remote set-url origin git@github.com:oaslananka/kicad-studio-kit.git
```
