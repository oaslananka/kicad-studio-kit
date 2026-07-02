# Maintainers

This file documents the current repository maintainership model for KiCad Studio Kit.

## Current maintainers

| GitHub handle | Scope                                   | Responsibilities                                                                                                                  |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `@oaslananka` | Repository owner and primary maintainer | Release approval, issue triage, security advisory handling, marketplace publishing, CODEOWNERS review, and final merge decisions. |

## Maintainer expectations

Maintainers are expected to:

- use pull requests for non-emergency changes;
- use PR-based self-review for normal changes and request external human review for high-risk code, release, security, CI, and governance changes when practical;
- keep release credentials and GitHub Actions secrets restricted to the minimum required access;
- triage active vulnerability reports privately through GitHub Security Advisories;
- document major architecture, release, compatibility, or security decisions as ADRs;
- keep `GOVERNANCE.md`, `ROADMAP.md`, `SECURITY.md`, and `docs/repo-maturity-report.md` current.

## Succession and continuity

The repository is intentionally operated as a solo-maintainer project. This is compatible with the current Professional OSS target when governance, release, security, and support procedures are documented. Recruiting another maintainer is optional and only required for a future Gold/foundation-grade claim.

Future-only continuity target:

- at least two maintainers with administrative recovery knowledge;
- optional external reviewer for high-risk PRs;
- branch protection/rulesets requiring passing status checks and preventing force-push/deletion;
- documented release credential rotation after maintainer changes.

## Becoming a maintainer

A contributor can be proposed as a maintainer after sustained, constructive contributions that include reviewed pull requests, issue triage, documentation improvements, and respect for the Code of Conduct. Maintainer changes should be made through a pull request that updates this file and `GOVERNANCE.md`.
