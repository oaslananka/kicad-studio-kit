# GitHub Security Settings Evidence

Audit date: 2026-07-20

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
| Dependency vulnerability alerts       | Passed  | GitHub Dependabot alerts endpoint returned HTTP 200 and is accessible.                                                                                                                    |
| Dependency security updates           | Passed  | Repository security analysis reports dependency security updates enabled after this follow-up.                                                                                            |
| Secret scanning                       | Passed  | Repository security analysis reports secret scanning enabled.                                                                                                                             |
| Secret scanning push protection       | Passed  | Repository security analysis reports push protection enabled.                                                                                                                             |
| Secret scanning non-provider patterns | Partial | Repository security analysis reports this optional setting disabled.                                                                                                                      |
| Secret scanning validity checks       | Partial | Repository security analysis reports this optional setting disabled.                                                                                                                      |

## Dependency alert cleanup

The 2026-07-20 audit found three new high-severity alerts (`#34`, `#35`, and
`#36`) that all referenced `packages/mcp-server/uv.lock`. That manifest is absent
from the default branch after the KiCad MCP Pro repository split, and this
repository neither ships nor consumes the affected Python runtime.

The alerts were dismissed as `not_used` with an explicit repository-split
rationale. Alerts `#32` and `#33` had previously been dismissed for the same
removed manifest. A follow-up query of the open-alert endpoint returned an empty
array.

This is not a blanket vulnerability waiver: any alert that references a manifest
present on the default branch must be remediated or separately justified.

## Remaining optional hardening

- Enable non-provider secret scanning patterns if available and acceptable for the repository plan.
- Enable secret scanning validity checks if available and acceptable for the repository plan.
- Keep security settings evidence current after repository ownership, plan, or ruleset changes.

## Automated evidence

`.github/workflows/governance-evidence.yml` runs weekly and manually with
read-only repository contents permission. It compares the live ruleset with the
checked-in policy and reports security settings as `confirmed`, `unconfirmed`, or
`unavailable`. The JSON artifact intentionally excludes alert payloads.
