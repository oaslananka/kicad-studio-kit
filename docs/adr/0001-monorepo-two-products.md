# ADR 0001: Monorepo Two Products

Status: Superseded by 0009

Date: 2026-05-30

## Context

KiCad Studio Kit ships a VS Code
extension (`kicadstudiokit`) and a Python MCP server
(`kicad-mcp-pro`) — plus a private shared test harness. Before this
ADR, the repository used a pnpm workspace structure but did not formally
document which paths are product workspaces, which are shared infrastructure,
and which are root-owned orchestration.

The repository had accumulated a mix of workspace layouts:

- `apps/` for the VS Code extension.
- `packages/` for the MCP server and test harness.

This follows the pnpm convention (`apps/` for deployable applications,
`packages/` for libraries and utilities) but the distinction was implicit.

## Decision

Adopt the following monorepo topology as binding policy:

| Path                            | Role                                                                                         | Published                 |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| `apps/vscode-extension`         | VS Code / Open VSX extension                                                                 | VSIX                      |
| `packages/mcp-server` (removed) | Python MCP server (moved to [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)) | sdist/wheel, MCP Registry |
| `packages/test-harness`         | Private shared test utilities                                                                | Never                     |

Additional rules:

- Do not introduce additional canonical repositories, mirrors, or alternate
  release roots.
- The repository root is `private: true` and owns orchestration only:
  package manager config, version preflight scripts, release workflows, and
  documentation.
- Cross-product work must flow through compatibility metadata, MCP manifests,
  shared fixtures, and contract tests — not through direct source imports.

## Consequences

- Positive: Clear ownership boundaries reduce accidental cross-product
  coupling. New contributors can determine which workspace to modify from
  the path alone.
- Positive: Release Please can target product-specific version files without
  root-version conflicts.
- Negative: Shared code between products must be duplicated or extracted to
  a shared package, adding overhead for genuinely cross-cutting concerns.
- Negative: Root configuration changes (CI, release, docs) require awareness
  of all product surfaces.

## Alternatives Considered

- **Separate repositories per product**: Rejected. Would lose shared CI,
  compatibility validation, contract tests, and coordinated release notes.
- **Flat workspace with no `apps/`/`packages/` split**: Rejected. The
  `apps/` vs `packages/` convention signals deployability vs library intent
  and is widely understood by pnpm users.

## Related

- Supersedes prior implicit topology conventions.
- Documented in `docs/architecture/repo-structure.md`.
- Issue #67.
