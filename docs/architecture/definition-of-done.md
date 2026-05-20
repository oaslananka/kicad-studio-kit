# Definition of Done

This document defines the minimum completion bar for issues and pull requests in the KiCad Studio Kit monorepo.

## Universal completion criteria

Every PR should satisfy the following before merge:

- The PR references the issue it closes or advances.
- The PR has one clear purpose and avoids unrelated cleanup.
- Product-specific checks pass for every touched product.
- Root checks pass when root tooling, shared packages, CI, release, or docs are touched.
- Documentation is updated when behavior, commands, paths, compatibility, or release process changes.
- Breaking changes include migration notes.
- Compatibility metadata is updated when supported versions, MCP schema, or feature gates change.
- Release notes are updated or explicitly marked not required.
- Sensitive data is not logged, committed, or added to artifacts.

## Bug fixes

Bug fixes must include regression coverage.

Required evidence:

- A test that fails before the fix and passes after the fix, when practical.
- A fixture, golden file, visual snapshot, or contract test when relevant.
- A note in the PR explaining any case where automation is not practical.

Manual screenshots alone are not sufficient to close repeatable bugs.

## Architecture and monorepo changes

Architecture changes must include:

- Updated architecture documentation.
- Boundary impact analysis.
- Validation that product workspaces remain independently buildable.
- No direct source imports between `apps/vscode-extension`, `packages/mcp-server`, and `packages/mcp-npm`.
- Migration notes for renamed or moved paths.

## MCP protocol or capability changes

Protocol-impacting changes must include:

- Updated protocol schemas.
- Updated MCP server implementation.
- Updated extension MCP adapter where applicable.
- Updated compatibility matrix.
- Updated contract tests.
- Updated server-info/capability docs.
- Backward compatibility notes.

## UI/UX changes

User-facing UI changes must include:

- State coverage for loading, empty, success, error, and degraded states where applicable.
- Visual regression update or explanation when screenshots change.
- Accessibility check or keyboard navigation coverage for interactive controls.
- VS Code theme compatibility for dark, light, and high-contrast modes.

## Release-impacting changes

Release-impacting changes must include:

- Package validation.
- Release dry-run where applicable.
- Updated changelog or release note entry.
- Compatibility gate result.
- Artifact contents validation when packaging changes.

## Agent PR checklist

Coding-agent PRs must additionally include:

- Exact validation commands run.
- Scope confirmation: which issue and milestone the PR targets.
- Confirmation that no unrelated issue was partially modified.
- Confirmation that folder moves and feature fixes are not mixed.
- Confirmation that direct product-to-product imports were not introduced.
