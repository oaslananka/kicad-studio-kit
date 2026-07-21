<div align="center">

# KiCad Studio Kit

**VS Code extension repository for KiCad Studio workflows.**  
Extension-side MCP discovery, configuration, compatibility metadata, and user experience.

<p>
  <a href="https://github.com/oaslananka/kicad-studio-kit/actions/workflows/ci.yml"><img src="https://github.com/oaslananka/kicad-studio-kit/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/oaslananka/kicad-studio-kit/actions/workflows/codeql.yml"><img src="https://github.com/oaslananka/kicad-studio-kit/actions/workflows/codeql.yml/badge.svg" alt="CodeQL status"></a>
  <a href="https://github.com/oaslananka/kicad-studio-kit/actions/workflows/security.yml"><img src="https://github.com/oaslananka/kicad-studio-kit/actions/workflows/security.yml/badge.svg" alt="Security status"></a>
  <a href="https://codecov.io/gh/oaslananka/kicad-studio-kit"><img src="https://codecov.io/gh/oaslananka/kicad-studio-kit/branch/main/graph/badge.svg" alt="Codecov coverage"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/oaslananka/kicad-studio-kit"><img src="https://api.scorecard.dev/projects/github.com/oaslananka/kicad-studio-kit/badge" alt="OpenSSF Scorecard"></a>
  <a href="https://www.bestpractices.dev/projects/13405"><img src="https://www.bestpractices.dev/projects/13405/badge" alt="OpenSSF Best Practices"></a>
</p>

<p>
  <a href="https://open-vsx.org/extension/oaslananka/kicadstudiokit"><img src="https://img.shields.io/open-vsx/v/oaslananka/kicadstudiokit?label=Open%20VSX" alt="Open VSX version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=oaslananka.kicadstudiokit"><img src="https://img.shields.io/badge/VS%20Marketplace-install-blue" alt="Install from Visual Studio Marketplace"></a>
  <a href="https://github.com/oaslananka/kicad-studio-kit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <a href="https://oaslananka.github.io/kicad-studio-kit/"><img src="https://img.shields.io/badge/docs-site-blue" alt="Documentation site"></a>
</p>

<p>
  <a href="docs/best-practices-evidence.md">Best Practices evidence</a> ·
  <a href="GOVERNANCE.md">Governance</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="SUPPORT.md">Support</a> ·
  <a href="https://deepwiki.com/oaslananka/kicad-studio-kit">Ask DeepWiki</a>
</p>

<p>
  <a href="https://www.buymeacoffee.com/oaslananka"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support-FFDD00?logo=buymeacoffee&logoColor=000000&labelColor=FFDD00&color=111111" alt="Buy me a coffee"></a>
</p>

</div>

KiCad Studio Kit is the VS Code extension repository. The MCP server is
developed and released separately. This repository owns only the extension-side
MCP discovery, configuration, compatibility metadata, and user experience — see
[ADR 0009](docs/adr/0009-split-kicad-mcp-pro-into-separate-repository.md) and
[repository structure](docs/architecture/repo-structure.md).

This repository contains:

- the KiCad Studio VS Code extension (`apps/vscode-extension`) — the only released product here;
- private shared test infrastructure (`packages/test-harness`, `packages/kicad-fixtures`);
- the extension-side MCP integration contract and compatibility metadata.

The KiCad MCP Pro server (`kicad-mcp-pro`) — its Python source, npm launcher,
container image, and MCP Registry listing — lives in
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/).

## Repository maturity and standards

This repository tracks Solo-maintainer Professional OSS / Mature OSS readiness through [the repository maturity report](docs/repo-maturity-report.md), [OpenSSF evidence](docs/openssf-evidence.md), and [OpenSSF gap analysis](docs/openssf-gap-analysis.md). Gold/foundation-grade maturity is intentionally not claimed for the current solo-maintainer model; branch protection and release evidence remain the practical Professional OSS focus.

## Version Baseline

<!-- release-surface:start -->
<!-- Generated from apps/vscode-extension/package.json. Run `corepack pnpm run release:surface` to refresh. -->

This repository's local release surface is:

- VS Code extension: `oaslananka.kicadstudiokit` (`1.9.5`)

The Python package `kicad-mcp-pro`, container image, and MCP Registry listing
are released from [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/).
<!-- release-surface:end -->

## KiCad Compatibility

KiCad Studio Kit treats KiCad `10.0.x` as the primary tested line, keeps KiCad
`9.x` as deprecated best-effort compatibility after upstream EOL, and keeps
KiCad `8.x` as deprecated file-level compatibility. The canonical matrix, tested patch versions, CI
coverage level, and feature gates are maintained in
[docs/support-matrix.md](docs/support-matrix.md) and `compatibility.yaml`.

## Local Validation

```powershell
corepack enable
corepack pnpm run dev:doctor
corepack pnpm install --frozen-lockfile
corepack pnpm --dir apps/vscode-extension exec playwright install chromium
corepack pnpm run check:forbidden-refs
corepack pnpm run check:version
corepack pnpm --filter kicadstudiokit run check
corepack pnpm --filter kicadstudiokit run package

```

Product-scoped entrypoints are available from the root:

```powershell
corepack pnpm run check:kicad-studio

corepack pnpm --dir packages/test-harness run check
corepack pnpm run check:protocol-schemas
corepack pnpm run check:compatibility-contract
corepack pnpm run check:dev-doctor
```

Python/MCP server checks run from the
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/) repository.

For a reproducible VS Code Dev Containers or GitHub Codespaces environment, use
the checked-in [devcontainer configuration](docs/devcontainer.md). The container
sets up Node, pnpm, Python, uv, Playwright, shellcheck, actionlint, GitHub CLI,
and best-effort KiCad CLI support for root checks and MCP tests.

## Install

Install the extension from the Visual Studio Marketplace or Open VSX, or build
it locally:

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run package:kicad-studio
```

## Usage

Open a workspace containing a KiCad project and use the KiCad Studio activity
bar views and commands. See [docs/getting-started.md](docs/getting-started.md)
for the guided workflow and [docs/extension/commands.md](docs/extension/commands.md)
for the command catalog.

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
- [MCP Workflow Demo](examples/mcp-demo/README.md)

## Publishing

Publishing is handled by GitHub Actions workflows under `.github/workflows`. External setup for environments, marketplace secrets, and trusted publishers is documented in [docs/publishing.md](docs/publishing.md).
The structured preview (beta) program and tester feedback loop for the stable `1.x` line are documented in [docs/beta-program.md](docs/beta-program.md).

## Maintenance

Dependency update policy, dashboard triage, and security-update handling are documented in [docs/dependency-lifecycle.md](docs/dependency-lifecycle.md).
Compatibility support states and release gates are documented in [docs/support-matrix.md](docs/support-matrix.md).
Canonical repository and portfolio workflow status are recorded in [CANONICAL.md](CANONICAL.md), [.repo-health.yaml](.repo-health.yaml), and [docs/reusable-workflows.md](docs/reusable-workflows.md).
Telemetry and error reporting are opt-in, disabled by default, and documented in [docs/telemetry.md](docs/telemetry.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and run `corepack pnpm run check` before
opening a pull request.

## License

KiCad Studio Kit is available under the [MIT License](LICENSE).
