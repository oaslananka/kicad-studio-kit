# Branch Protection Policy

Apply this policy to `main` after the repository environments and required
checks are available. The importable ruleset lives in
`.github/rulesets/main.json`.

## Required status checks

The ruleset uses the check-run contexts reported by the current monorepo
workflows:

- `metadata`
- `forbidden-refs`
- `vscode-extension (ubuntu-24.04)`
- `vscode-extension (windows-2025-vs2026)`
- `vscode-extension (macos-15)`
- `mcp-server (ubuntu-24.04)`
- `mcp-server (windows-2025-vs2026)`
- `mcp-server (macos-15)`
- `mcp-npm (ubuntu-24.04)`
- `mcp-npm (windows-2025-vs2026)`
- `mcp-npm (macos-15)`
- `real-pair-compatibility`
- `analyze (javascript-typescript)`
- `analyze (python)`
- `security`
- `scan`
- `build`

Every required check above must keep reporting on every pull request. Do not add
path filters, branch filters, or commit-message skip behavior to a workflow that
owns one of these required contexts. If product CI later becomes path-filtered,
keep an always-on required gate that reports for every pull request and update
this document plus `.github/rulesets/main.json` together.

Scorecard should stay enabled as a repository health signal. It can be required once the repository has stable branch protection and token permissions.

## Review ownership

Enable CODEOWNERS review. Path ownership is declared in `.github/CODEOWNERS`:

- `.github/`: CI, release, labels, and governance.
- `docs/architecture/`: architecture and release model.
- `apps/vscode-extension/`: KiCad Studio extension.
- `packages/mcp-server/`: KiCad MCP Pro Python server and MCP Registry metadata.
- `packages/mcp-npm/`: npm launcher.
- `packages/protocol-schemas/`: protocol schemas and compatibility contracts.
- `examples/`: user-facing KiCad examples and smoke-test projects.

## Protection settings

- Require a pull request before merging.
- Require conversation resolution.
- Require branches to be up to date before merge when required checks are enabled.
- Require signed commits if the account policy supports it.
- Disallow force pushes and branch deletion for `main`.
- Restrict who can bypass required pull requests and required checks.

The strict up-to-date rule currently favors a current green `main` integration
point over merge throughput. Re-evaluate it with the required-check set if the
repository adopts a merge queue or concurrent merge volume grows.

Release PR #16 remains user-owned. Do not merge release automation while product/release policy work is still being reviewed.
