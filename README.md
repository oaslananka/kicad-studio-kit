# KiCad Studio Kit

[![CI](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/codeql.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/codeql.yml)
[![Security](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/security.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/security.yml)
[![MCP Registry](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/publish-mcp-registry.yml/badge.svg)](https://github.com/oaslananka/kicad-studio-kit/actions/workflows/publish-mcp-registry.yml)
[![Open VSX](https://img.shields.io/open-vsx/v/oaslananka/kicadstudio?label=Open%20VSX)](https://open-vsx.org/extension/oaslananka/kicadstudio)

Monorepo for:

- KiCad Studio VS Code extension (`apps/vscode-extension`)
- KiCad MCP Pro server (`packages/mcp-server`)
- npm launcher wrapper (`packages/mcp-npm`)
- shared test harness (`packages/test-harness`)

Canonical repository: https://github.com/oaslananka/kicad-studio-kit
Searchable documentation: https://oaslananka.github.io/kicad-studio-kit/

## Version Baseline

All release surfaces are pinned to `1.0.0`:

- VS Code extension: `oaslananka.kicadstudio`
- Python package: `kicad-mcp-pro`
- npm wrapper: `@oaslananka/kicad-mcp-pro`
- MCP Registry name: `io.github.oaslananka/kicad-mcp-pro`

## Local Validation

```powershell
corepack enable
corepack pnpm run dev:doctor
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
corepack pnpm --dir packages/test-harness run check
corepack pnpm run test:contract
corepack pnpm run check:dev-doctor
```

For a reproducible VS Code Dev Containers or GitHub Codespaces environment, use
the checked-in [devcontainer configuration](docs/devcontainer.md). The container
sets up Node, pnpm, Python, uv, Playwright, shellcheck, actionlint, GitHub CLI,
and best-effort KiCad CLI support for root checks and MCP tests.

## Architecture

- [Searchable documentation site](https://oaslananka.github.io/kicad-studio-kit/)
- [Repository structure](docs/architecture/repo-structure.md)
- [Product boundaries](docs/architecture/product-boundaries.md)
- [Release model](docs/architecture/release-model.md)
- [Testing strategy](docs/testing-strategy.md)
- [Dev container](docs/devcontainer.md)
- [KiCad fixture corpus](docs/kicad-fixture-corpus.md)
- [Integration model](docs/integration/kicad-studio-mcp.md)
- [Agent onboarding](docs/agents/index.md)
- [MCP client config examples](examples/mcp-clients/README.md)
- [VS Code MCP workspace example](.vscode/mcp.example.json)

## Examples

- [Examples overview](examples/README.md)
- [LED Basic KiCad example](examples/led-basic/README.md)
- [USB-C Power Intake example](examples/usb-c-power/README.md)
- [Buck Converter Review example](examples/buck-converter/README.md)
- [Differential Pair Review example](examples/differential-pair-demo/README.md)
- [Manufacturing Release example](examples/manufacturing-release-demo/README.md)
- [MCP Workflow Demo](examples/mcp-demo/README.md)

## Publishing

Publishing is handled by GitHub Actions workflows under `.github/workflows`. External setup for environments, marketplace secrets, and trusted publishers is documented in [docs/publishing.md](docs/publishing.md).
The structured pre-1.0 beta program and tester feedback loop are documented in [docs/beta-program.md](docs/beta-program.md).

## Maintenance

Dependency update policy, dashboard triage, and security-update handling are documented in [docs/dependency-lifecycle.md](docs/dependency-lifecycle.md).
Compatibility support states and release gates are documented in [docs/support-matrix.md](docs/support-matrix.md).
Canonical repository and portfolio workflow status are recorded in [CANONICAL.md](CANONICAL.md), [.repo-health.yaml](.repo-health.yaml), and [docs/reusable-workflows.md](docs/reusable-workflows.md).
Telemetry and error reporting are opt-in, disabled by default, and documented in [docs/telemetry.md](docs/telemetry.md).
