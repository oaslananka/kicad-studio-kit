# KiCad Studio Kit

[![CI](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/codeql.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/codeql.yml)
[![Security](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/security.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/security.yml)
[![MCP Registry](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/publish-mcp-registry.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/publish-mcp-registry.yml)

Monorepo for:

- KiCad Studio VS Code extension (`apps/vscode-extension`)
- KiCad MCP Pro server (`packages/mcp-server`)
- npm launcher wrapper (`packages/mcp-npm`)

Canonical repository: https://github.com/oaslananka/kicad-studio-kit

## Version Baseline

All release surfaces are pinned to `1.0.0`:

- VS Code extension: `oaslananka.kicadstudio`
- Python package: `kicad-mcp-pro`
- npm wrapper: `@oaslananka/kicad-mcp-pro`
- MCP Registry name: `io.github.oaslananka/kicad-mcp-pro`

## Local Validation

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
uv sync --all-extras --frozen --project packages/mcp-server
corepack pnpm run check:forbidden-refs
corepack pnpm run check:version
corepack pnpm --filter kicadstudio run check
corepack pnpm --filter kicadstudio run package
Push-Location packages/mcp-server
corepack pnpm run check
Pop-Location
Push-Location packages/mcp-npm
npm pack --dry-run
Pop-Location
```

Product-scoped entrypoints are available from the root:

```powershell
corepack pnpm run check:kicad-studio
corepack pnpm run check:kicad-mcp-pro
corepack pnpm run check:mcp-npm
corepack pnpm run test:contract
```

## Architecture

- [Repository structure](docs/architecture/repo-structure.md)
- [Product boundaries](docs/architecture/product-boundaries.md)
- [Release model](docs/architecture/release-model.md)
- [Testing strategy](docs/testing-strategy.md)
- [KiCad fixture corpus](docs/kicad-fixture-corpus.md)
- [Integration model](docs/integration/kicad-studio-mcp.md)

## Examples

- [LED Basic KiCad example](examples/led-basic/README.md)

## Publishing

Publishing is handled by GitHub Actions workflows under `.github/workflows`. External setup for environments, marketplace secrets, and trusted publishers is documented in [docs/publishing.md](docs/publishing.md).

## Maintenance

Dependency update policy, dashboard triage, and security-update handling are documented in [docs/dependency-lifecycle.md](docs/dependency-lifecycle.md).
Compatibility support states and release gates are documented in [docs/support-matrix.md](docs/support-matrix.md).
