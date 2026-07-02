# Maintainers

This file documents the current repository maintainership model for KiCad Studio Kit.

## Current maintainers

| GitHub handle | Scope                                   | Responsibilities                                                                                                                  |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `@oaslananka` | Repository owner and primary maintainer | Release approval, issue triage, security advisory handling, marketplace publishing, CODEOWNERS review, and final merge decisions. |

## Maintainer expectations

Maintainers are expected to:

- use pull requests for non-emergency changes;
- require human review for code, release, security, CI, and governance changes once branch protection is active;
- keep release credentials and GitHub Actions secrets restricted to the minimum required access;
- triage active vulnerability reports privately through GitHub Security Advisories;
- document major architecture, release, compatibility, or security decisions as ADRs;
- keep `GOVERNANCE.md`, `ROADMAP.md`, `SECURITY.md`, and `docs/repo-maturity-report.md` current.

## Succession and continuity

The repository is currently not foundation-grade because it does not have verified independent maintainers, independent reviewers, and enforced branch protection. The project should recruit at least one additional trusted maintainer before claiming Gold/foundation-grade maturity.

Recommended continuity target:

- at least two maintainers with administrative recovery knowledge;
- at least one non-owner reviewer for routine PRs;
- branch protection/rulesets requiring CODEOWNERS review and passing status checks;
- documented release credential rotation after maintainer changes.

## Becoming a maintainer

A contributor can be proposed as a maintainer after sustained, constructive contributions that include reviewed pull requests, issue triage, documentation improvements, and respect for the Code of Conduct. Maintainer changes should be made through a pull request that updates this file and `GOVERNANCE.md`.
