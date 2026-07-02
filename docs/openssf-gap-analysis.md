# OpenSSF Gap Analysis

Audit date: 2026-07-02

## Summary

The repository has strong Passing/Silver evidence, but it must not claim Gold/foundation-grade maturity yet. Gold readiness depends on operational facts that cannot be created by documentation alone.

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

## Gold feasibility

| Gold/foundation-grade requirement | Status  | Gap                                                                                  |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| Multiple active maintainers       | Missing | Current evidence documents one primary maintainer.                                   |
| Independent contributor/reviewer  | Missing | Not enough independent review evidence.                                              |
| Regular human PR review           | Missing | Must be enforced and sustained; bot review does not count.                           |
| Branch protection                 | Missing | GitHub API reported `main` as not protected.                                         |
| Sustainable governance            | Partial | Governance docs exist; operational multi-maintainer governance is missing.           |
| High test coverage                | Partial | Coverage thresholds exist; Gold-level coverage evidence requires human confirmation. |
| Repeatable/reproducible release   | Partial | Repeatable VSIX and attestations exist; prove across repeated real releases.         |

## Issues to create or keep open

- Enable branch protection/rulesets for `main`.
- Recruit and document at least one additional maintainer or independent reviewer.
- Require CODEOWNERS review for protected paths.
- Track human PR review coverage over time.
- Add REUSE/SPDX per-file license readiness.
- Confirm GitHub private vulnerability reporting, GitHub-native dependency alerts, secret scanning, and push protection.
- Evaluate standalone OSV scanner and container scanner baselines.

## Created tracking issues

- #471 Enable enforced main branch protection for OSS maturity.
- #472 Establish sustained human PR review evidence.
- #473 Reduce maintainer bus-factor risk for Gold readiness.
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
