# GitHub Actions Permissions

The repository uses secure defaults and explicit job-level escalation. The checked-in source of truth is `.github/actions-permissions.json`; `corepack pnpm run check:actions-permissions` validates every workflow against it.

## Live repository defaults

| Setting                                  | Required value | Rationale                                                                                                         |
| ---------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Default workflow permissions             | `read`         | A new workflow that omits a permission block cannot receive a write-capable token.                                |
| Actions may approve pull-request reviews | `false`        | Workflow automation cannot manufacture approval evidence.                                                         |
| Allowed actions                          | `all`          | The repository uses reviewed third-party actions across release, security, coverage, and documentation workflows. |
| Require SHA pinning                      | `true`         | Every action reference must resolve to an immutable 40-character commit SHA.                                      |

`allowed_actions: all` does not permit floating action tags: platform SHA pinning is enabled and the repository security tooling independently rejects mutable action references.

## Workflow rules

- Top-level workflow permissions may grant only read access or no access.
- Every write scope is declared on the exact job that needs it and must match the allowlist in `.github/actions-permissions.json`.
- `pull_request_target` is forbidden.
- Fork pull requests receive GitHub's read-only token behavior; jobs that comment on a pull request are additionally restricted to same-repository heads.
- Every checkout sets `persist-credentials: false` unless the checked-in policy records a reviewed push path.
- The only persisted-checkout exceptions are the two Release Please checkouts that create deterministic commits on the release branch or `main`.

## Write-capable jobs

The allowlist covers only these purposes:

- release creation, release-surface synchronization, and release workflow dispatch;
- extension release assets, attestations, and GitHub Release uploads;
- GitHub Pages deployment;
- SARIF and Scorecard uploads;
- scheduled stale-item maintenance and compatibility issue reporting;
- same-repository pull-request coverage comments.

Build, test, lint, package validation, dependency review, and normal pull-request jobs remain read-only.

## Live drift evidence

`.github/workflows/governance-evidence.yml` reads the repository Actions permission endpoints weekly and on demand, only from `main`. The workflow has `contents: read` and receives the protected `GH_AUTH_TOKEN` secret because GitHub's built-in workflow token cannot read these administrative endpoints. It compares live settings with `.github/actions-permissions.json`. Missing API evidence, a write-capable default token, review-approval permission, disabled SHA pinning, or any other mismatch fails the evidence run.
