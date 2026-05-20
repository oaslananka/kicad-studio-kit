# Agent PR Review Runbook

Use this runbook to review coding-agent pull requests consistently.

## First-pass classification

Identify the PR type:

- Monorepo structure
- Shared package or protocol schema
- VS Code extension feature or bug fix
- MCP server feature or bug fix
- Cross-product compatibility
- CI, release, security, or docs

Request a split if the PR combines unrelated categories.

## Scope checks

Verify that:

- The PR targets one issue or one tightly related issue group.
- The PR body lists validation commands that were actually run.
- The PR does not silently modify unrelated products or shared packages.
- Path moves are separate from feature or bug fixes.
- New code follows product boundary rules.

## Product boundary checks

Not allowed:

- The extension app importing MCP server implementation internals.
- The MCP server package importing extension implementation internals.
- Shared packages importing from product apps.
- Generic shared packages without a domain-specific purpose.

Allowed integration paths:

- Versioned protocol schemas.
- Compatibility metadata.
- MCP protocol calls.
- Contract tests.
- Shared fixtures and test harnesses.

## Review checklist

- Independent build and test workflows still work for both products.
- Old paths are removed from docs, scripts, workflows, release config, and tests.
- Compatibility metadata and support docs are updated when version support changes.
- Protocol changes are covered by contract tests.
- Bug fixes are covered by regression tests.
- UI changes are covered by visual or accessibility tests when relevant.
- Generated files or local logs are not committed.
- Secrets are redacted from logs and diagnostic artifacts.

## Validation expectations

Repository-wide changes should run the root check.

Extension-only changes should run extension lint, typecheck, tests, and build.

MCP-only changes should run MCP tests, command help/version checks, and package build.

Protocol or integration changes should run contract and fixture tests.

These commands may evolve as the restructure lands. PRs should use the current equivalent commands and document them.

## Request changes when

- The PR mixes folder moves with feature fixes.
- Product boundaries are violated.
- A bug fix lacks regression coverage without a documented reason.
- Protocol behavior changes without schema and contract-test updates.
- Release behavior changes without dry-run or validation notes.
- A new shared package lacks a domain-specific name and purpose.

## Approve when

- Scope is small and aligned to the target issue.
- Checks pass or failures are unrelated and documented.
- Docs and compatibility metadata are updated where needed.
- The repo remains buildable after the PR.
- The change is independently reviewable and revertible.
