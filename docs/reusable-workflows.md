# Reusable Workflow Governance

This repository keeps local workflow files for CI, release, security, and
extension publishing until a portfolio reusable-workflow source is available to
this repo. PyPI, npm, container, and MCP Registry publishing for `kicad-mcp-pro`
live in [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).

## Portfolio Source Check

Expected source:

- repository: `oaslananka-lab/.github`
- directory: `.github/workflows`
- checked: 2026-05-23
- result: GitHub returned `404 Not Found` for the workflow directory through
  the authenticated API.

Because no callable reusable workflow entrypoint is currently visible, the local
workflow files remain authoritative for this repository.

## Local Workflows Retained

The following workflows duplicate portfolio-wide concerns and should be migrated
only after a callable workflow with equivalent permissions, triggers, pinned
actions, and artifact behavior is available:

| Concern                     | Local workflow  | Current status                 |
| --------------------------- | --------------- | ------------------------------ |
| Code scanning               | `codeql.yml`    | Local pinned workflow retained |
| Supply-chain health         | `scorecard.yml` | Local pinned workflow retained |
| Secret scanning             | `gitleaks.yml`  | Local pinned workflow retained |
| Dependency review and audit | `security.yml`  | Local pinned workflow retained |

## Migration Rule

Do not move PyPI publishing into a reusable workflow in the repository that owns
the PyPI package. PyPI Trusted Publishing currently requires the trusted
publishing step to live in the non-reusable workflow file that is registered on
PyPI, so `publish-python.yml` must keep the final `pypa/gh-action-pypi-publish`
jobs local to [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).

## Local Composite Action

The repository provides a local composite action at
`.github/actions/setup-workspace/action.yml` that centralises the common
checkout, Node, and pnpm setup steps used by most CI jobs.

### Inputs

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `fetch-depth` | string | No | `""` | Optional `fetch-depth` passed to `actions/checkout`. When empty, the checkout default is used. |
| `setup-uv` | string | No | `"false"` | When `"true"`, installs `uv` via `astral-sh/setup-uv` with caching enabled. |
| `ref` | string | No | `""` | Optional Git ref to checkout. When empty, the event default ref is used. |

### Usage

```yaml
- uses: ./.github/actions/setup-workspace
  with:
    setup-uv: true
```

### Jobs that use the composite action

| Workflow | Jobs using `setup-workspace` |
|----------|------------------------------|
| `ci.yml` | `ci-lanes`, `metadata`, `vscode-extension`, `shared-packages`, `performance-budgets`, `real-pair-compatibility`, `forbidden-refs` |
| `security.yml` | `security`, `extension-security-regressions` |
| `docs.yml` | `build` |
| `vscode-canary.yml` | `extension-host` |
| `vsix-build.yml` | `build` |
| `cross-repo-compatibility.yml` | `canary` |
| `publish-extension.yml` | `package`, `publish_vscode`, `publish_openvsx` |

### Jobs that remain local

The following workflows keep their full step definitions because they use
different action patterns (security scanners, release bots, or marketplace
publishers):

| Workflow | Reason |
|----------|--------|
| `codeql.yml` | CodeQL-specific setup |
| `gitleaks.yml` | gitleaks-specific scanner |
| `scorecard.yml` | OpenSSF Scorecard |
| `sync-labels.yml` | Label synchronisation |
| `stale.yml` | Stale issue bot |
| `release-please.yml` | Release automation |

When reusable workflow entrypoints become available, migrate one concern per PR
and keep each caller workflow pinned to an immutable ref or a maintained release
line approved by the repository security gate.
