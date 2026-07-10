# Branch Protection Policy

Apply this policy to `main` after the repository environments and required
checks are available. The importable ruleset lives in
`.github/rulesets/main.json`.

## Required status checks

The ruleset uses stable check-run contexts reported by always-on repository
workflows. The CI workflow exposes one aggregate `required` check so optional or
path-scoped matrix lanes can be skipped without leaving branch protection waiting
for a context that was never created.

- `required`
- `analyze (javascript-typescript)`
- `analyze (python)`
- `security`
- `scan`

Every required check above must keep reporting on every pull request. Do not add
path filters, branch filters, or commit-message skip behavior to a workflow that
owns one of these required contexts. If product CI later changes its internal
matrix, keep the aggregate `required` job always-on and update this document plus
`.github/rulesets/main.json` together.

Scorecard should stay enabled as a repository health signal. It can be required
once the repository has stable branch protection, token permissions, and no
new-repository grace-period alerts.

The documented list above and `.github/rulesets/main.json` are kept in sync by
`corepack pnpm run check:branch-protection`, which fails if they diverge.

## Quality gate coverage

Each required pull-request quality gate maps to one of the required checks above:

| Quality gate                                                                   | Enforced by                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Lint, typecheck, unit tests, accessibility, package build + validate           | `required` aggregate CI gate                          |
| Version + release-surface drift, compatibility, governance, extension manifest | `required` aggregate CI gate                          |
| Forbidden references / stale repository language                               | `required` aggregate CI gate                          |
| Static analysis (CodeQL)                                                       | `analyze (javascript-typescript)`, `analyze (python)` |
| Dependency audit + supply-chain controls                                       | `security`                                            |
| Secret scanning                                                                | `scan`                                                |
| Cross-product and shared-package build                                         | `required` aggregate CI gate                          |

Generated documentation drift is validated by the `docs` workflow on every
documentation change. Promote it to a required context here and in the ruleset
once it reports on every pull request (today it is path-scoped to docs changes).

## Check tiers

- **Pull-request required checks (blocking):** the required contexts listed
  above. The `required` aggregate covers CI lane success/failure while CodeQL,
  security, and secret scanning remain independently visible.
- **Scheduled / nightly checks (health gates, non-blocking on a PR):** the full
  KiCad compatibility matrix, large-project benchmarks, the regression corpus,
  and the dependency dashboard audit.

## Review ownership

Enable CODEOWNERS review. Path ownership is declared in `.github/CODEOWNERS`:

- `.github/`: CI, release, labels, and governance.
- `docs/architecture/`: architecture and release model.
- `apps/vscode-extension/`: KiCad Studio extension.
- (removed — see [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/)): KiCad MCP Pro Python server and MCP Registry metadata.
- `packages/protocol-schemas/`: (removed — consumed from npm as `@oaslananka/kicad-protocol-schemas`).
- `examples/`: user-facing KiCad examples and smoke-test projects.

## Protection settings

- Require a pull request before merging.
- Require conversation resolution.
- Require branches to be up to date before merge when required checks are enabled.
- Require signed commits if the account policy supports it.
- Disallow force pushes and branch deletion for `main`.
- Restrict bypass to repository administrators and only for pull request merges.
  Direct pushes to `main` remain blocked.

The strict up-to-date rule currently favors a current green `main` integration
point over merge throughput. Re-evaluate it with the required-check set if the
repository adopts a merge queue or concurrent merge volume grows.

Release PR #16 remains user-owned. Do not merge release automation while product/release policy work is still being reviewed.
