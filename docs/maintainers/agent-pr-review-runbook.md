# Agent PR Review Runbook

Use this runbook to review coding-agent pull requests consistently.

## First-pass classification

Identify the PR type:

- Repository structure or shared test infrastructure
- VS Code extension feature or bug fix
- MCP client, protocol-adapter, or cross-product compatibility
- Published protocol-schema consumption
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

- The extension app importing KiCad MCP Pro implementation internals.
- Production source importing the private shared test harness.
- Shared packages importing from product apps.
- Copied or relative source imports from the external KiCad MCP Pro repository.
- Generic shared packages without a domain-specific purpose.

Allowed integration paths:

- Versioned protocol schemas.
- Compatibility metadata.
- MCP protocol calls.
- Contract tests.
- Shared fixtures and test harnesses.

## Review checklist

- Independent build and test workflows still work for the extension and local shared packages.
- Cross-repository compatibility gates still consume published KiCad MCP Pro artifacts when protocol or compatibility surfaces change.
- Server, npm-wrapper, and protocol-schema source changes are assigned to the KiCad MCP Pro external repository rather than this checkout.
- Old local MCP paths are removed from docs, scripts, workflows, release config, and tests.
- Compatibility metadata and support docs are updated when version support changes.
- Protocol changes are covered by contract tests.
- Bug fixes are covered by regression tests.
- UI changes are covered by visual or accessibility tests when relevant.
- Generated files or local logs are not committed.
- Secrets are redacted from logs and diagnostic artifacts.

## Validation expectations

Repository-wide changes should run the root check.

Extension-only changes should run the extension lint, typecheck, relevant tests, build, and package validation.

MCP client, protocol-adapter, or cross-repository compatibility changes should run `corepack pnpm run check:compatibility-contract`, protocol-schema validation, and the relevant contract or real-pair canary.

Changes to the MCP server, npm wrapper, or protocol-schema source must be made and validated in the KiCad MCP Pro external repository, then consumed here only through published artifacts and compatibility metadata.

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
