# Repository Operations

## Repository Model

- Canonical repository: `https://github.com/oaslananka/kicad-studio-kit`
- Personal canonical GitHub repository: `https://github.com/oaslananka/kicad-studio-kit`
- CI/CD, releases, marketplace publishing, signing, security scanning, dependency maintenance, label synchronization, review-thread enforcement, and mirror automation run only from the organization repository.
- The personal repository is a canonical GitHub repository and must not run publish workflows.
- If organization and personal repository state conflict, the organization repository wins.

Release and publish jobs must keep this repository guard:

```yaml
if: github.repository == 'oaslananka/kicad-studio'
```

## Control Plane Model

Blocking correctness gates:

- format
- lint
- typecheck
- unit tests
- integration tests
- build
- VSIX package
- workflow syntax/actionlint
- secret scan
- package metadata consistency

Advisory gates:

- Scorecard
- docs links
- optional package smoke
- personal mirror
- Marketplace and Open VSX dry-run packaging

Release authority gates:

- release-please manifest mode
- Conventional Commit history
- release-please release outputs
- VSIX package integrity
- checksums, SBOM, and artifact attestations
- production VS Marketplace, Open VSX, and GitHub Release publish

Review feedback gates:

- unresolved human review threads
- actionable automation-authored review comments
- GitHub suggested changes

Cheap PR gates run on draft PRs. Heavy full CI and CodeQL wait until a pull
request is ready for review. Push-to-main and merge queue checks are not
skipped.

## Workflow Inventory

| Class                | Workflows                                                                                                          | Notes                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Blocking correctness | `ci.yml`, `lint-fast.yml`, `commitlint.yml`, `gitleaks.yml`, `review-thread-gate.yml`                              | Required before merge when applicable. Draft PRs run cheap gates; full CI waits for ready-for-review.                 |
| Security             | `security.yml`, `codeql.yml`, `scorecard.yml`, `mutation.yml`                                                      | Dependency, filesystem, workflow-security, SAST, Scorecard, and mutation-test coverage.                               |
| Maintenance          | `dependabot-auto-merge.yml`, `sync-labels.yml`, `auto-label.yml`, `branch-cleanup.yml`, `stale.yml`, `pr-size.yml` | Controlled dependency updates, labels, cleanup reporting, stale triage, and PR sizing.                                |
| Release authority    | `release.yml`, `mcp-registry.yml`, `release-please.yml`                                                            | release-please creates releases from commit history; release jobs build assets, attach attestations, publish, verify. |

## Daily Operations

### Local Validation

```bash
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run test:integration
pnpm run build
pnpm run package
pnpm run workflows:lint
pnpm audit --audit-level high
pnpm run release:dry-run
pnpm exec task ci
```

`package:ovsx` is the safe Open VSX packaging check. The current `ovsx` CLI
publishes through `ovsx publish`; do not use that command outside the guarded
release workflow.

`pnpm run publish` is intentionally fail-closed. Production publishing must use
`.github/workflows/release.yml`.

## Review Thread Control

Review-thread state is checked by:

- `scripts/check-review-threads.mjs`
- `.github/workflows/review-thread-gate.yml`
- [automation/review-thread-gate.md](automation/review-thread-gate.md)

Actionable unresolved threads fail `Review Thread Gate`. Human review threads
are never auto-resolved.

## Failure Classification

- `scripts/classify-gh-failure.mjs`
- [automation/failure-classifier.md](automation/failure-classifier.md)

The classifier is local and read-only. It maps known failure patterns to a
stable class and recommended fix, then exits without mutating repository state.

## Release And Publish Authority

Only the organization repository may run release or publish workflows. The
release workflow uses release-please manifest mode and never accepts a manually
entered version.

Required secrets:

- `VSCE_PAT`
- `OVSX_PAT`
- `PERSONAL_REPO_PUSH_TOKEN`
- `DOPPLER_GITHUB_SERVICE_TOKEN` only if maintainers later replace the default
  `github.token` GitHub Release flow with a service-token fallback
- `CODECOV_TOKEN` only for coverage upload
- `SENTRY_AUTH_TOKEN` only when source maps are uploaded

Required vars:

- `EXTENSION_PUBLISHER=oaslananka`
- `VS_MARKETPLACE_ITEM=oaslananka.kicadstudio`
- `OPEN_VSX_NAMESPACE=oaslananka`

Do not print tokens. Do not store API keys in the repository.

## Codecov

`CODECOV_TOKEN` is available as an organization-level selected secret and may
be used only for coverage upload. It must not be used as a Codecov API token.

Fork pull requests must not require token-backed upload. Coverage upload
failures should not mask test failures.

## Canonical GitHub Repository

The personal repository is showcase-only. It should receive one-way source
mirroring from `oaslananka/kicad-studio` for `main` and `v*.*.*` tags only.
Do not mirror issues, releases, workflow state, release-please branches, or PR
branches.

Mirror behavior is documented in [automation/github-only.md](automation/github-only.md).
Automatic mode pushes only safe main updates and missing tags. Divergent tags
or divergent personal main fail with an actionable manual force-with-lease
instruction.

To ensure no Actions minutes are consumed on the personal repository, disable
Actions there:

```bash
gh api -X PUT /repos/oaslananka/kicad-studio-kit/actions/permissions -f enabled=false
```

Enable automatic head branch deletion in the organization repository:

```bash
gh api -X PATCH /repos/oaslananka/kicad-studio -f delete_branch_on_merge=true
```
