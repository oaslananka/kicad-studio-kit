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
- `product:mcp-server` for `packages/mcp-server`.
- `product:mcp-npm` for `packages/mcp-npm`.
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

- Extension updates: `corepack pnpm --filter kicadstudio run check`.
- MCP server updates: `Push-Location packages/mcp-server; corepack pnpm run check; Pop-Location`.
- npm wrapper updates: `Push-Location packages/mcp-npm; npm pack --dry-run; Pop-Location`.
- Root, CI, or release updates: root checks plus affected workflow commands.

Compatibility-sensitive updates must also run the relevant contract or fixture tests before merge. If support boundaries change, update `compatibility.yaml`, [support-matrix.md](support-matrix.md), and the nearest release note in the same PR.

## Security updates

Vulnerability-fix PRs skip the weekly schedule and should be reviewed first. Keep the fix narrow:

- Prefer the lowest patched version that resolves the alert.
- Do not combine unrelated version updates with a vulnerability fix.
- Run the full affected product check and security workflow commands.
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

## Escalation

Create or link a compatibility-regression issue when a dependency update fails canary, contract, or fixture tests. The issue must include:

- Package name and attempted version.
- Product impact.
- Failing command or workflow run.
- Reproduction notes.
- Required compatibility or migration decision.
