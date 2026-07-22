# Definition of Done

This document defines the minimum completion bar for issues and pull requests in the KiCad Studio Kit monorepo. It is tracked under the Quality Hardening & Release Confidence milestone ([#409](https://github.com/oaslananka/kicad-studio-kit/issues/409)).

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
- Review evidence follows the [review evidence policy](review-evidence-policy.md); every bot/agent artifact is triaged and unavailable medium/high-risk review has compensating evidence.

## Applicability by change type

Apply only the criteria relevant to the change. The table shows which areas each
change type must address. A maintainer may waive any item, but a waived or
not-applicable item must carry an explicit one-line justification in the PR (see
[Not-applicable items](#not-applicable-items)).

| Change type         | Tests                                         | Docs                                   | Compatibility                       | Release notes        | Security/trust                             |
| ------------------- | --------------------------------------------- | -------------------------------------- | ----------------------------------- | -------------------- | ------------------------------------------ |
| Feature             | unit + integration/e2e for user-visible flows | yes                                    | if it changes a supported surface   | if user-visible      | review trust/guard impact                  |
| Refactor            | preserve coverage; add tests for new seams    | only if behavior/structure docs change | no behavior change expected         | usually not required | review if security-relevant code moved     |
| Bug fix             | regression test (fails before, passes after)  | if the fix changes documented behavior | if a compatibility boundary changed | if user-visible      | review if the bug was a security/trust gap |
| Docs-only           | not applicable                                | the change itself                      | no                                  | no                   | not applicable                             |
| Release engineering | gate/script tests                             | release/runbook docs                   | release gate result                 | release note         | review workflow permissions and secrets    |

## Not-applicable items

When a Definition-of-Done item does not apply to a change, mark it **not
applicable with a one-line reason** in the PR rather than silently omitting it.
Maintainers may require that justification before merge.

## Bug fixes

Bug fixes must include regression coverage.

Required evidence:

- A test that fails before the fix and passes after the fix, when practical.
- A related issue ID in the test name or test metadata.
- A fixture, golden file, visual snapshot, or contract test when relevant.
- The exact local or CI command that proves the regression now passes.
- A note in the PR explaining any case where automation is not practical, with
  maintainer approval before the issue is closed.

Manual screenshots alone are not sufficient to close repeatable bugs.

## Issue-closing checklist

Before closing a bug issue, maintainers should verify:

- The linked PR includes a regression test or a documented maintainer-approved
  exception.
- The regression evidence references the related issue ID in the test name,
  fixture metadata, snapshot name, or contract case.
- The PR lists the command or CI check that ran the regression.
- Repeatable visual bugs are covered by a visual, DOM, accessibility, or
  fixture-backed test instead of screenshot-only evidence.

## Architecture and monorepo changes

Architecture changes must include:

- Updated architecture documentation.
- Boundary impact analysis.
- Validation that product workspaces remain independently buildable.
- No direct source imports between `apps/vscode-extension` and KiCad MCP Pro.
- No production source imports from `@oaslananka/kicad-test-harness`.
- Migration notes for renamed or moved paths.

## MCP protocol or capability changes

Protocol-impacting changes must complete the
[protocol change checklist](protocol-change-checklist.md) in the pull request
template and include:

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
