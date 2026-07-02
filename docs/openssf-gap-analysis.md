# OpenSSF Gap Analysis

Audit date: 2026-07-02

## Summary

The repository has strong Passing/Silver evidence. Gold/foundation-grade is intentionally out of scope for the current solo-maintainer operating model and should remain future-only.

## Passing readiness

| Criterion area             | Status | Notes                                                              |
| -------------------------- | ------ | ------------------------------------------------------------------ |
| Basic project metadata     | Passed | README, license, support, contribution, and security docs exist.   |
| Public source availability | Passed | Public GitHub repository.                                          |
| Build/test instructions    | Passed | pnpm-based commands and devcontainer docs exist.                   |
| Vulnerability reporting    | Passed | SECURITY.md exists; GitHub setting still needs human confirmation. |
| Automated tests            | Passed | CI/test matrix exists.                                             |
| Static analysis            | Passed | CodeQL and lint/typecheck exist.                                   |

## Silver readiness

| Criterion area             | Status  | Notes                                                                                                 |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| Stronger security evidence | Partial | Threat model and release integrity docs exist; settings must be confirmed.                            |
| Coverage evidence          | Partial | Threshold exists; exact sustained Silver/Gold coverage evidence should remain current.                |
| Dependency management      | Passed  | Renovate and GitHub-native dependency alert/update configuration exist alongside supply-chain checks. |
| Release evidence           | Passed  | Checksums, SBOM, provenance, and attestation flow exist.                                              |
| Review process             | Partial | Process exists, enforcement and practice need branch protection/human review.                         |

## Future-only Gold feasibility

| Gold/foundation-grade requirement | Status         | Gap                                                                                                                                                          |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multiple active maintainers       | Not applicable | Current evidence documents one primary maintainer; this is acceptable for the current solo-maintainer target and only matters if Gold becomes a future goal. |
| Independent contributor/reviewer  | Not applicable | Not required for the current solo-maintainer target.                                                                                                         |
| Regular independent PR review     | Not applicable | Optional/future-only for Gold; not required for the current target.                                                                                          |
| Branch protection                 | Missing        | GitHub API reported `main` as not protected.                                                                                                                 |
| Sustainable governance            | Passed         | Governance docs exist for the solo-maintainer model; multi-maintainer governance is future-only.                                                             |
| High test coverage                | Partial        | Coverage thresholds exist; Gold-level coverage evidence requires human confirmation.                                                                         |
| Repeatable/reproducible release   | Partial        | Repeatable VSIX and attestations exist; prove across repeated real releases.                                                                                 |

## Issues to create or keep open

- Enable branch protection/rulesets for `main`.
- Require CODEOWNERS review for protected paths.
- Add REUSE/SPDX per-file license readiness.
- Confirm GitHub private vulnerability reporting, GitHub-native dependency alerts, secret scanning, and push protection.
- Evaluate standalone OSV scanner and container scanner baselines.

## Created tracking issues

- #471 Enable enforced main branch protection for OSS maturity.
- #472 Closed as optional/future-only for Gold.
- #473 Closed as optional/future-only for Gold.
- #474 Assess REUSE, SPDX, and NOTICE readiness.
- #475 Confirm GitHub security settings for OpenSSF readiness.

## Non-claims

This repository should not currently claim:

- OpenSSF Gold;
- foundation-grade maturity;
- two-person review;
- multi-organization maintenance;
- full SLSA level compliance;
- full REUSE compliance;
- guaranteed support SLA.
