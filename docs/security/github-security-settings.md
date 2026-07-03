# GitHub Security Settings Evidence

Audit date: 2026-07-03

This document records repository-level GitHub security settings verified during the solo-maintainer Professional OSS follow-up pass.

## Repository settings

| Setting | Status | Evidence |
| --- | --- | --- |
| Public repository | Passed | GitHub repository metadata reports `private: false`. |
| Issues | Passed | GitHub repository metadata reports issues enabled. |
| Discussions | Passed | GitHub repository metadata reports discussions enabled. |
| Delete branch on merge | Passed | GitHub repository metadata reports delete-on-merge enabled. |
| Main branch protection | Passed | GitHub branch metadata reports `main` as protected. |
| Private security reporting | Passed | GitHub private reporting endpoint reports `enabled: true`. |
| Dependency vulnerability alerts | Passed | GitHub alert endpoint returned HTTP 204, which indicates alerts are enabled. |
| Dependency security updates | Passed | Repository security analysis reports dependency security updates enabled after this follow-up. |
| Secret scanning | Passed | Repository security analysis reports secret scanning enabled. |
| Secret scanning push protection | Passed | Repository security analysis reports push protection enabled. |
| Secret scanning non-provider patterns | Partial | Repository security analysis reports this optional setting disabled. |
| Secret scanning validity checks | Partial | Repository security analysis reports this optional setting disabled. |

## Dependency alert cleanup

The security dashboard reported two open alerts for `joserfc` in `packages/mcp-server/uv.lock`.

| Alert | Severity | Manifest | Action |
| --- | --- | --- | --- |
| 32 | Medium | `packages/mcp-server/uv.lock` | Dismissed as `not_used`. |
| 33 | High | `packages/mcp-server/uv.lock` | Dismissed as `not_used`. |

Rationale: the `packages/mcp-server/uv.lock` manifest path is no longer present in this repository after the MCP server split. A follow-up API check returned no open dependency alerts.

## Remaining optional hardening

- Enable non-provider secret scanning patterns if available and acceptable for the repository plan.
- Enable secret scanning validity checks if available and acceptable for the repository plan.
- Keep security settings evidence current after repository ownership, plan, or ruleset changes.
