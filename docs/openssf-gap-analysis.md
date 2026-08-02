# OpenSSF Silver Maintenance Analysis

Review date: 2026-08-02

## Summary

Passing and Silver are achieved and form the repository's declared OpenSSF Best Practices target. Gold/foundation-grade is not a planned maturity target for the current solo-maintainer operating model.

## Passing readiness

| Criterion area             | Status | Notes                                                                |
| -------------------------- | ------ | -------------------------------------------------------------------- |
| Basic project metadata     | Passed | README, license, support, contribution, and security docs exist.     |
| Public source availability | Passed | Public GitHub repository.                                            |
| Build/test instructions    | Passed | pnpm-based commands and devcontainer docs exist.                     |
| Vulnerability reporting    | Passed | `SECURITY.md` exists and private vulnerability reporting is enabled. |
| Automated tests            | Passed | CI/test matrix exists.                                               |
| Static analysis            | Passed | CodeQL and lint/typecheck exist.                                     |

## Silver maintenance

| Criterion area             | Status | Notes                                                                                                                      |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Stronger security evidence | Passed | Threat model, release integrity evidence, and live security settings are documented.                                       |
| Coverage evidence          | Passed | The extension enforces the statement, line, and function thresholds used for the Silver claim.                             |
| Dependency management      | Passed | Renovate and GitHub-native dependency alert/update configuration exist alongside supply-chain checks.                      |
| Release evidence           | Passed | Checksums, SBOM, provenance, and attestation flow exist.                                                                   |
| Review process             | Passed | Pull requests, required CI, signed commits, and resolved conversations are enforced without deadlocking a solo maintainer. |

## Non-targeted higher-tier criteria

| Higher-tier criterion            | Status         | Policy                                                                                                                                  |
| -------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple active maintainers      | Not applicable | Not required by the declared Silver target; maintainer growth should be driven by project needs rather than badge progression.          |
| Independent contributor/reviewer | Not applicable | Not required by the declared Silver target.                                                                                             |
| Regular independent PR review    | Not applicable | Not required by the declared Silver target; independent review may still be used for high-risk work when available.                     |
| Branch protection                | Passed         | The active `main-protection` ruleset protects `main`; the legacy branch-protection endpoint is not the authoritative ruleset API.       |
| Sustainable governance           | Passed         | Governance and continuity documentation match the solo-maintainer operating model.                                                      |
| Higher coverage thresholds       | Not targeted   | Silver coverage evidence is maintained; Gold-only thresholds are not roadmap requirements.                                              |
| Additional release assurance     | Maintained     | Repeatable VSIX checks, checksums, SBOM, provenance, and attestations remain product-quality controls independent of badge progression. |

## Maintenance policy

- Do not create or keep issues solely to pursue OpenSSF Gold.
- Keep the active ruleset, security settings, Silver evidence URLs, release evidence, and coverage gate under periodic drift review.
- Add legal, scanning, review, or maintainer controls only when they address a concrete project risk or user need.

## Created tracking issues

- #471 Enable enforced main branch protection for OSS maturity.
- #472 Closed because mandatory independent review is outside the declared Silver target and would deadlock the current solo-maintainer model.
- #473 Closed because additional maintainer capacity is not a badge-driven requirement for the declared Silver target.
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
