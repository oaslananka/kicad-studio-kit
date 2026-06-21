# Dependency Lifecycle

This runbook defines how dependency update PRs are created, triaged, labeled, tested, and closed for the KiCad Studio Kit monorepo.

## Tooling model

Renovate is the only normal version-update PR author for this repository. It owns scheduled updates for npm, Python project metadata, GitHub Actions, Dockerfiles, and lockfile maintenance.

GitHub's dependency graph and security alert service should remain enabled in repository settings. Renovate consumes those alerts through its `vulnerabilityAlerts` configuration and raises vulnerability-fix PRs immediately when a fix is available. Do not add a second scheduled update config file for the GitHub-native updater unless the forbidden-reference policy is changed first; that would duplicate update PRs and reintroduce noisy alert surfaces.

## Update lanes

| Lane              | Source                                                                                      | Default cadence                       | Approval                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Low-risk patch    | Patch updates and lockfile maintenance                                                      | Monday before 06:00 Europe/Istanbul   | Auto-merge allowed only for configured dev-dependency patch and lockfile-maintenance PRs after required checks pass; otherwise normal review |
| Medium-risk minor | Minor updates, build/test tooling, action digest updates, container base images             | Monday before 06:00 Europe/Istanbul   | Normal review, product checks required                                                                                                       |
| High-risk major   | Major updates, protocol/runtime packages, VS Code API packages, security-sensitive packages | Dashboard approval before PR creation | Migration notes and compatibility review required                                                                                            |
| Vulnerability fix | GitHub security alert consumed by Renovate                                                  | Immediate                             | No dashboard approval, security review required                                                                                              |

## Labels

Every update PR should keep the base labels `dependencies` and `dependency-lifecycle`.

Product impact labels:

- `product:vscode-extension` for `apps/vscode-extension`.
- `product:mcp-server` for `oaslananka/kicad-mcp` (MCP server source in a separate repository).
- `product:repo` for root workspace tooling, CI, release, docs, and governance.

Risk labels:

- `risk:low` for patch, lockfile, and docs-only update PRs.
- `risk:medium` for minor updates, build/test tooling, action updates, and container base image updates.
- `risk:high` for major updates, vulnerability fixes, protocol/runtime changes, and compatibility-sensitive packages.

Add `security` to vulnerability-fix PRs and `compatibility` to updates that affect KiCad, VS Code, MCP protocol, server-info, transport behavior, package publishing, or runtime constraints.

## Weekly dashboard triage

Review the dependency dashboard once each Monday after the scheduled run finishes.

For each pending item:

- Let configured low-risk dev-dependency patch and lockfile-maintenance PRs auto-merge only after required checks pass.
- Manually review other low-risk patch PRs when the grouped scope is small and CI is green.
- Review medium-risk PRs by product impact before merging.
- Leave major updates unapproved until migration notes, release notes, and compatibility impact are known.
- Split mixed runtime/build-tool updates when the PR combines unrelated risk lanes.
- Close stale update PRs when they are superseded by a newer version or repeatedly fail for the same upstream reason.
- Recreate stale update PRs after the base branch changes, lockfiles change, or an upstream package publishes a corrected release.

## Required validation

All dependency PRs must pass the root metadata checks:

```powershell
corepack pnpm run check:forbidden-refs
corepack pnpm run check:version
```

Product-specific checks:

- Extension updates: `corepack pnpm --filter kicadstudiokit run check`.
- MCP server updates: see [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).
- Root, CI, or release updates: root checks plus affected workflow commands.

Compatibility-sensitive updates must also run the relevant contract or fixture tests before merge. If support boundaries change, update `compatibility.yaml`, [support-matrix.md](support-matrix.md), and the nearest release note in the same PR.

## Security updates

Vulnerability-fix PRs skip the weekly schedule and should be reviewed first. Keep the fix narrow:

- Prefer the lowest patched version that resolves the alert.
- Do not combine unrelated version updates with a vulnerability fix.
- Run the full affected product check and security workflow commands.
- If the patched npm version is newer than `minimumReleaseAge`, use only a
  version-scoped `minimumReleaseAgeExclude` entry and document the advisory.
  Do not add broad package-name exclusions.
- If the vulnerability is not exploitable because of local usage, document the reasoning in the PR and leave the alert state consistent with repository policy.

## Deferring and pinning

Defer an update when:

- The upstream release is less than the configured minimum release age.
- The update requires disabling `minimumReleaseAge` or `blockExoticSubdeps` in
  `pnpm-workspace.yaml`.
- CI fails because of an upstream regression.
- The update changes a supported KiCad, VS Code, MCP, Python, Node, pnpm, or package-publish contract.
- A major update lacks migration notes.

Pin or hold a dependency only when the support boundary is explicit. Examples:

- VS Code typings stay aligned with `engines.vscode`.
- Node typings stay inside the Node 24 runtime declared by the workspace.
- Protocol/runtime packages require dashboard approval because they can affect both the extension and MCP server.

## Abandoned dependencies

Renovate flags a dependency as abandoned when it exceeds the inherited
`abandonments:recommended` inactivity threshold (one year without a release). Abandonment
is a maintenance signal, not a vulnerability; security exposure is handled separately by
`vulnerabilityAlerts` and OSV alerts.

Triage an abandonment flag by deciding one of:

- **Retain** when the package is feature-complete, still actively used, and has no
  maintained drop-in replacement. Record the decision by adding the package to the
  abandonment-suppression `packageRules` in `renovate.json` (`abandonmentThreshold: null`,
  scoped by `matchDatasources` and `matchPackageNames`) so the dashboard stops re-flagging
  a reviewed steady state. Genuinely new abandonment still surfaces.
- **Replace** when a maintained alternative exists. Migrate in a scoped PR and remove the
  suppression entry.
- **Remove** when the dependency is no longer used.

Reviewed and retained (suppressed) under #244, all still in active use:

| Package                  | Datasource | Used for                                                |
| ------------------------ | ---------- | ------------------------------------------------------- |
| `@vscode/test-electron`  | npm        | VS Code extension integration test harness              |
| `actionlint`             | npm        | GitHub Actions workflow linting                         |
| `exceljs` (+ `unzipper`) | npm        | spreadsheet/BOM export                                  |
| `husky`                  | npm        | git hook management                                     |
| `pngjs`                  | npm        | PNG snapshot/image tooling                              |
| `docker`                 | pypi       | `freerouting` optional extra (container-driven routing) |
| `mkdocs-minify-plugin`   | pypi       | documentation site minification                         |
| `radon`                  | pypi       | code-complexity metrics gate                            |

Revisit a suppressed entry if the package starts blocking a supported KiCad, VS Code, MCP,
Python, or Node contract, or once a maintained replacement is adopted.

## Escalation

Create or link a compatibility-regression issue when a dependency update fails canary, contract, or fixture tests. The issue must include:

- Package name and attempted version.
- Product impact.
- Failing command or workflow run.
- Reproduction notes.
- Required compatibility or migration decision.
