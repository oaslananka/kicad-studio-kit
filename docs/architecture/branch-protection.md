# Branch Protection Policy

This policy is active on `main`. The importable repository policy lives in
`.github/rulesets/main.json`; the live GitHub ruleset is named `main-standard`.
The 2026-10-07 reconciliation aligned the checked-in policy to the verified live
default-branch ruleset without weakening live protection.

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
- `dependency-review`

Every required check above must keep reporting on every pull request. Do not add
path filters, branch filters, or commit-message skip behavior to a workflow that
owns one of these required contexts. If product CI later changes its internal
matrix, keep the aggregate `required` job always-on and update this document plus
`.github/rulesets/main.json` together.

Scorecard should stay enabled as a repository health signal. It can be required
once the repository has stable branch protection, token permissions, and no
new-repository grace-period alerts.

The documented list above and `.github/rulesets/main.json` are kept in sync by
`corepack pnpm run check:branch-protection`. The same check also fails if the
checked-in policy broadens `main` beyond squash-only merges, disables strict
required checks or conversation resolution, drops linear history, or removes
deletion/non-fast-forward protection.

## Quality gate coverage

Each required pull-request quality gate maps to one of the required checks above:

| Quality gate                                                                   | Enforced by                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Lint, typecheck, unit tests, accessibility, package build + validate           | `required` aggregate CI gate                          |
| Version + release-surface drift, compatibility, governance, extension manifest | `required` aggregate CI gate                          |
| Forbidden references / stale repository language                               | `required` aggregate CI gate                          |
| Static analysis (CodeQL)                                                       | `analyze (javascript-typescript)`, `analyze (python)` |
| Dependency audit + supply-chain controls                                       | `security`                                            |
| Dependency change review                                                       | `dependency-review`                                   |
| Secret scanning                                                                | `scan`                                                |
| Cross-product and shared-package build                                         | `required` aggregate CI gate                          |

Generated documentation drift is validated by the `docs` workflow on every
documentation change. Promote it to a required context here and in the ruleset
once it reports on every pull request (today it is path-scoped to docs changes).

### External quality signals

`.github/quality-gates.json` records the repository-owned policy for external quality
signals. The canonical repository owner is `oaslananka`; workflows therefore do not
carry repository-owner aliases or owner conditionals. Event, fork, path, and permission
guards remain in place where they enforce real security or execution boundaries.

- **SonarCloud** is advisory, not a required branch-protection context.
  CI-based analysis is configured in `.github/workflows/sonarcloud.yml` and
  `sonar-project.properties`, with full Git history and **actual Jest LCOV**
  (`apps/vscode-extension/coverage/lcov.info`) generated before scanning.
  `scripts/prepare-sonar-lcov.mjs` validates and rewrites Jest's app-relative
  `SF:src/...` source paths to repository-root-relative paths; missing
  source records fail the job before SonarCloud can display misleading zero coverage.
  The job also exercises repository-owned scripts with the existing, pinned
  `c8` dependency and imports their real Node test LCOV report. The
  script coverage run uses existing compatibility, release, provenance, and
  quality-policy tests rather than inventing uncovered-line exclusions; the
  source-file list is derived from actual executed modules. Sonar test
  inclusions distinguish JS/TS tests in both `scripts/` and
  `apps/vscode-extension/scripts/` from production scripts and exclude
  binary screenshot goldens from text parsing. The main-branch new-code
  window may span multiple releases, so PR and main percentages need not
  match even with the same LCOV evidence.
  Automatic Analysis must remain **off** in SonarQube Cloud
  (Project > Administration > Analysis Method) so the two analysis modes do
  not conflict. A scoped `SONAR_TOKEN` GitHub Actions secret is required;
  the scanner job skips fork pull requests rather than exposing the token.
  The analysis is independent of Codecov and does not alter the required
  branch checks. Sonar coverage represents the instrumented Jest sources,
  not a fabricated 100% metric. Monitor its source and new-code scope on
  the first completed scans before considering any future gate promotion.
- **Mergify** is not a repository merge authority. No `.mergify.yml` is owned here and
  its app status is informational; GitHub rulesets and required checks remain canonical.
- **Codecov** is repository-configured observability. Project, patch, and bundle statuses
  remain informational; Jest coverage thresholds and the CI `required` aggregate are the
  blocking coverage authorities.

`corepack pnpm run check:quality-gates` fails if these dispositions drift, an external
signal is accidentally promoted into the required-check set, Codecov stops being
informational, or a redundant repository-owner alias returns to a workflow.

## Check tiers

- **Pull-request required checks (blocking):** the required contexts listed
  above. The `required` aggregate covers CI lane success/failure while CodeQL,
  security, and secret scanning remain independently visible.
- **Scheduled / nightly checks (health gates, non-blocking on a PR):** the full
  KiCad compatibility matrix, large-project benchmarks, the regression corpus,
  and the dependency dashboard audit.

## Review ownership

The repository is solo-maintained. Pull requests are mandatory, but the active ruleset requires zero approving reviews so the repository owner is not deadlocked waiting for an unavailable second maintainer. CODEOWNERS remains an ownership map and notification aid; it is not a blocking approval requirement.

Path ownership is declared in `.github/CODEOWNERS`:

- `.github/`: CI, release, labels, and governance.
- `docs/architecture/`: architecture and release model.
- `apps/vscode-extension/`: KiCad Studio extension.
- (removed — see [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/)): KiCad MCP Pro Python server and MCP Registry metadata.
- `packages/protocol-schemas/`: (removed — consumed from npm as `@oaslananka/kicad-protocol-schemas`).
- `examples/`: user-facing KiCad examples and smoke-test projects.

## Protection settings

- Require a pull request before merging.
- Allow only squash merges on `main`; require linear history.
- Require zero approving reviews; do not require CODEOWNERS or last-push approval.
- Require conversation resolution and GitHub's extra approval for unattributed changes.
- Require branches to be up to date before merge when required checks are enabled.
- Disallow force pushes and branch deletion for `main`.
- Restrict the configured owner bypass to pull request merges only. Direct pushes
  to `main` remain blocked.

The strict up-to-date rule currently favors a current green `main` integration
point over merge throughput. Re-evaluate it with the required-check set if the
repository adopts a merge queue or concurrent merge volume grows.

## Scorecard residual risk

OpenSSF Scorecard currently deducts five points-oriented controls that are not
enabled for the solo-maintainer model: administrator enforcement, stale-review
dismissal, mandatory approvers, CODEOWNERS approval, and last-push approval.
These exact warnings are registered in `.github/scorecard-residual-risk.json` as
an accepted risk owned by `oaslananka` and reviewed quarterly. No finding is
dismissed solely to improve a score.

The accepted risk remains valid only while the checked-in and live rulesets match,
pull requests stay mandatory, squash-only linear history and six strict checks
remain required, conversation resolution remains enforced, and force
pushes/deletion remain blocked. `scripts/check-scorecard-evidence.mjs` fails closed for any additional
Scorecard warning or governance drift. Stronger approval rules become mandatory
when another qualified maintainer is reliably available, multiple active human
contributors emerge, bypass scope expands, required enforcement weakens, or a
high-risk release or credential change lacks independent review.

## Live evidence

`.github/workflows/governance-evidence.yml` runs weekly and on demand only from
`main`. The workflow keeps `contents: read` and uses the protected
`GH_AUTH_TOKEN` secret only for administrative read endpoints. It compares
the active default-branch ruleset with `.github/rulesets/main.json`, reports repository security settings as confirmed, unconfirmed, or unavailable,
compares live GitHub Actions defaults with the checked-in
[Actions permissions policy](actions-permissions.md), and uploads a
machine-readable JSON artifact. Live ruleset or Actions-permission drift fails
that workflow; API unavailability is never treated as confirmation.

The legacy branch-protection REST endpoint can return `404 Branch not protected`
when protection is implemented entirely through repository rulesets. Treat the
active ruleset and `branches/main.protected` metadata as the authoritative live
evidence for this repository.
