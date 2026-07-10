# Reusable Workflow Governance

This repository keeps local workflow files for CI, release, security, and
extension publishing until a portfolio reusable-workflow source is available to
this repo. PyPI, npm, container, and MCP Registry publishing for `kicad-mcp-pro`
live in [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/).

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
jobs local to [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/).

When reusable workflow entrypoints become available, migrate one concern per PR
and keep each caller workflow pinned to an immutable ref or a maintained release
line approved by the repository security gate.
