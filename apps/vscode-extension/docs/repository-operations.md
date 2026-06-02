# Repository Operations

## Repository Model

- Canonical repository: `https://github.com/oaslananka/kicad-studio-kit`
- CI, tests, docs, security scans, labels, release drafting, and publishing workflows run from this repository only.
- The VS Code extension root is `apps/vscode-extension`.
- The Python MCP server source lives at [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) (removed from this monorepo).
- The npm launcher root was `packages/mcp-npm` (now migrated to `oaslananka/kicad-mcp`).

Release and publish jobs should rely on GitHub environments and least-privilege workflow permissions. Do not add secondary repository guards, repository sync jobs, or alternate publish remotes.

## Control Plane Model

Blocking correctness gates:

- format
- lint
- typecheck
- unit tests
- build
- VSIX package validation
- workflow syntax/actionlint
- secret scan
- package metadata consistency

Advisory gates:

- Scorecard
- docs links
- optional package smoke tests

Release authority gates:

- release-please manifest mode
- Conventional Commit history
- VSIX package integrity
- Python distribution integrity
- npm package dry run
- MCP Registry manifest validation

Review feedback gates:

- unresolved human review threads
- actionable automation-authored review comments
- GitHub suggested changes

Push-to-main checks are never skipped.

## Workflow Inventory

| Class                | Workflows                                                                                                          | Notes                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Blocking correctness | `ci.yml`, `gitleaks.yml`                                                                                           | Required before merge when applicable.                                    |
| Security             | `security.yml`, `codeql.yml`, `scorecard.yml`                                                                      | Dependency, filesystem, workflow-security, SAST, and Scorecard gates.     |
| Maintenance          | `sync-labels.yml`, `stale.yml`                                                                                     | Labels and stale triage only. Dependency updates are handled by Renovate. |
| Release authority    | `release-please.yml`, `publish-extension.yml`, `publish-python.yml`, `publish-npm.yml`, `publish-mcp-registry.yml` | Release drafting and package publishing.                                  |

## Daily Operations

### Local Validation

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run check:forbidden-refs
corepack pnpm run check:version
corepack pnpm --filter kicadstudiokit run check
corepack pnpm --filter kicadstudiokit run package
```

`corepack pnpm --filter kicadstudiokit run package` is the safe VSIX packaging check. Production marketplace publishing must use `.github/workflows/publish-extension.yml`.

`corepack pnpm run check:publish` verifies local publish metadata and external version availability without publishing.

## Dependency Maintenance

Renovate is the only dependency update bot for this repository. It covers npm, GitHub Actions, Dockerfile, and PEP 621 Python dependencies, and refreshes lockfiles during the weekly maintenance window.

Major runtime-aligned dependencies are constrained until the supported runtime changes:

- `@types/node` remains below `25` while Node 24 is the supported runtime.
- `@types/vscode` remains aligned with `engines.vscode: ^1.122.0`.

## Review Thread Control

Review-thread state is checked by `scripts/check-review-threads.mjs` in each package that carries the helper. Actionable unresolved threads fail the gate when the workflow is enabled. Human review threads are never auto-resolved.

## Release And Publish Authority

Publishing is split by package surface:

- VS Code Marketplace and Open VSX: `.github/workflows/publish-extension.yml`
- TestPyPI and PyPI: `.github/workflows/publish-python.yml`
- MCP Registry: `.github/workflows/publish-mcp-registry.yml`

Required secrets:

- `VSCE_PAT`
- `OVSX_PAT`

Trusted publishing uses GitHub OIDC and must not require `PYPI_TOKEN`, `TEST_PYPI_TOKEN`, or `NPM_TOKEN`.

Do not print tokens. Do not store API keys in the repository.
