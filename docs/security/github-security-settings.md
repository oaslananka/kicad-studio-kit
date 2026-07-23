# GitHub Security Settings Evidence

Audit date: 2026-07-23

This document records point-in-time repository-level GitHub security evidence.
Values are reported only when confirmed by the GitHub API; unavailable evidence is
not guessed.

## Repository settings

| Setting                               | Status  | Evidence                                                                                                                                                                                  |
| ------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public repository                     | Passed  | GitHub repository metadata reports `private: false`.                                                                                                                                      |
| Issues                                | Passed  | GitHub repository metadata reports issues enabled.                                                                                                                                        |
| Discussions                           | Passed  | GitHub repository metadata reports discussions enabled.                                                                                                                                   |
| Delete branch on merge                | Passed  | GitHub repository metadata reports delete-on-merge enabled.                                                                                                                               |
| Main branch protection                | Passed  | GitHub reports `main` protected and active ruleset `main-protection` enforces signed commits, reviewed PRs, strict required checks, deletion protection, and non-fast-forward protection. |
| Private security reporting            | Passed  | GitHub private vulnerability reporting endpoint reports `enabled: true`.                                                                                                                  |
| Dependency vulnerability alerts       | Passed  | GitHub dependency-alert endpoint returned HTTP 200 and is accessible.                                                                                                                     |
| Dependency security updates           | Passed  | Repository security analysis reports dependency security updates enabled after this follow-up.                                                                                            |
| Secret scanning                       | Passed  | Repository security analysis reports secret scanning enabled.                                                                                                                             |
| Secret scanning push protection       | Passed  | Repository security analysis reports push protection enabled.                                                                                                                             |
| Secret scanning non-provider patterns | Partial | Repository security analysis reports this optional setting disabled.                                                                                                                      |
| Secret scanning validity checks       | Partial | Repository security analysis reports this optional setting disabled.                                                                                                                      |

## Dependency alert cleanup

The Python MCP server and its `packages/mcp-server/uv.lock` manifest were removed
from this repository by commit
`59c971605bc2e4451a622276a992af8d4f5a5fcc` when ownership moved to
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/).

A 2026-07-23 API reconciliation confirmed:

- the default branch contains no Python manifest or `packages/mcp-server` tree;
- the open Dependabot alert endpoint returns an empty array;
- all 37 dismissed alerts are associated with the retired lockfile and retain an
  evidence-backed `not_used` disposition;
- alerts `#59` and `#60` specifically record that the affected runtime is no
  longer installed or shipped by this repository;
- `corepack pnpm audit --audit-level high` reports no known vulnerabilities for
  the active workspace.

GitHub's native Python dependency graph job still exposes a manifest node for the
removed path with 183 historical dependencies. Its blob path does not exist on
`main`, all 37 alerts are dismissed as `not_used`, and the open-alert endpoint is
empty. This is classified as a `frozen-residue`, not as an active repository
runtime.

A supported empty Dependency Submission API snapshot was accepted during the
audit but did not replace the GitHub-native Python graph record. The test
submission was immediately superseded by an empty manifest set under the same
correlator. The repository does not depend on an undocumented destructive API or
on a persistent user-submitted tombstone.

`.github/retired-dependency-manifests.json` records the ownership boundary,
removal commit, dismissal rationale, and the observed residual dependency counts
`0` and `183`. The root Dependabot policy rejects restoration of the retired
directory or lockfile. The scheduled Governance Evidence workflow fails if the
native residue changes to any other count or if an open alert references the
absent manifest. A future GitHub cleanup to zero dependencies or complete
manifest removal remains an accepted improvement.

This is not a blanket vulnerability waiver: any alert that references a manifest
present on the default branch must be remediated or separately justified.

## Remaining optional hardening

- Enable non-provider secret scanning patterns if available and acceptable for the repository plan.
- Enable secret scanning validity checks if available and acceptable for the repository plan.
- Keep security settings evidence current after repository ownership, plan, or ruleset changes.

## Automated evidence

`.github/workflows/governance-evidence.yml` runs weekly and manually only from
`main`, with read-only repository contents permission and the protected
`GH_AUTH_TOKEN` secret for administrative read endpoints. It compares the live
ruleset and Actions defaults with checked-in policy and reports security settings
as `confirmed`, `unconfirmed`, or `unavailable`. The JSON artifact intentionally
excludes alert payloads.
