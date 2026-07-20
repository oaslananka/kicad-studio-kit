# Repository Maturity Report

Repository: `oaslananka/kicad-studio-kit`
Audit date: 2026-07-20
Mode: Live GitHub evidence reconciliation + implementation PR
Target: Solo-maintainer Professional OSS / Mature OSS

## Executive summary

KiCad Studio Kit already has a strong professional open-source foundation: an MIT license, README, contribution guide, Code of Conduct, security policy, support policy, release automation, pinned GitHub Actions, CodeQL, Scorecard, Gitleaks, Renovate, release evidence, and a documented support matrix.

The repository is best classified as **Solo-maintainer Professional OSS / Mature OSS in progress**. It is intentionally not assessed as Gold/foundation-grade because the project is solo-maintained. The 2026-07-20 live audit confirmed that `main` is protected by the active `main-protection` repository ruleset with signed commits, pull-request-only changes, strict required checks, deletion protection, and non-fast-forward protection.

The legacy branch-protection endpoint still returns `404 Branch not protected` because enforcement is ruleset-based. The active ruleset and `branches/main.protected: true` are the authoritative evidence for this repository.

## Current maturity level

**Production-ready / Mature OSS in progress.**

Rationale:

- user-facing extension release exists;
- release automation and release evidence exist;
- quality gates and security workflows are present;
- governance and support documents exist;
- active branch-protection and security settings satisfy the current enforcement target; community-scale evidence remains optional for the solo-maintainer model.

## Target maturity level

**Solo-maintainer Professional OSS / Mature OSS.**

Gold/foundation-grade is intentionally out of scope for the current solo-maintainer operating model. It remains a future gap list only, not a near-term target.

## GitHub Community Standards status

| Criterion                     | Status  | Evidence / action                                                                                    |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| README                        | Passed  | `README.md` exists with product scope, install, validation, badges, and docs links.                  |
| LICENSE                       | Passed  | `LICENSE` is MIT and GitHub detects MIT.                                                             |
| CONTRIBUTING                  | Passed  | `CONTRIBUTING.md` and `.github/CONTRIBUTING.md` exist; this PR adds stronger standards links.        |
| CODE_OF_CONDUCT               | Passed  | `CODE_OF_CONDUCT.md` exists.                                                                         |
| SECURITY                      | Passed  | `SECURITY.md` exists and links private advisory reporting.                                           |
| SUPPORT                       | Passed  | `SUPPORT.md` exists with handling goals.                                                             |
| Issue templates               | Passed  | `.github/ISSUE_TEMPLATE/` contains bug, feature, documentation, regression, and compatibility forms. |
| Pull request template         | Passed  | `.github/PULL_REQUEST_TEMPLATE.md` exists.                                                           |
| Discussions / community forum | Partial | Config references beta discussions; ongoing community process needs human confirmation.              |

## OpenSSF Best Practices status

| Area                    | Status         | Evidence / action                                                                                                                   |
| ----------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Passing readiness       | Passed         | Evidence register and current docs indicate passing readiness.                                                                      |
| Silver readiness        | Partial        | Existing evidence says Silver achieved; human confirmation should keep BadgeApp current.                                            |
| Gold feasibility        | Not applicable | Gold/foundation-grade is intentionally not a target for the current solo-maintainer model; future-only gaps are tracked separately. |
| `.bestpractices.json`   | Passed         | Added in this PR as a local evidence index.                                                                                         |
| BadgeApp proposal links | Passed         | `docs/openssf-proposal-links.md` added.                                                                                             |
| Evidence file           | Passed         | `docs/openssf-evidence.md` and existing `docs/best-practices-evidence.md`.                                                          |

## Scorecard readiness

| Check                  | Status  | Evidence / gap                                                                                                                                                             |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch-Protection      | Passed  | Active `main-protection` ruleset matches the checked-in policy and protects the default branch.                                                                            |
| Code-Review            | Partial | The active ruleset enforces pull requests and CI but intentionally requires zero approvals; independent human-review history remains limited by the solo-maintainer model. |
| Maintained             | Passed  | Recent release and push activity exist.                                                                                                                                    |
| Security-Policy        | Passed  | `SECURITY.md`.                                                                                                                                                             |
| License                | Passed  | MIT license.                                                                                                                                                               |
| CI-Tests               | Passed  | `ci.yml`, product checks, docs, package, integration, a11y, visual, and release checks exist.                                                                              |
| Dependency-Update-Tool | Passed  | Renovate and GitHub-native dependency alert/update configuration exist.                                                                                                    |
| Pinned-Dependencies    | Passed  | GitHub Actions are digest-pinned; lockfile is committed.                                                                                                                   |
| Token-Permissions      | Passed  | Workflows generally use minimum permissions; publish/release jobs elevate only where needed.                                                                               |
| Dangerous-Workflow     | Partial | No risky change applied here; workflow review should remain active because release jobs can push generated surfaces.                                                       |
| SAST                   | Passed  | CodeQL workflow exists.                                                                                                                                                    |
| Fuzzing                | Partial | Security fuzz/unit tests exist; dedicated fuzzing service or OSS-Fuzz integration is not evidenced.                                                                        |

## Documentation maturity

Diátaxis coverage after this PR:

| Mode        | Status | Evidence                                  |
| ----------- | ------ | ----------------------------------------- |
| Tutorial    | Passed | `docs/tutorials/getting-started.md`.      |
| How-to      | Passed | `docs/how-to/run-local-quality-gates.md`. |
| Reference   | Passed | `docs/reference/repository-standards.md`. |
| Explanation | Passed | `docs/explanation/architecture.md`.       |

The repository already has extensive architecture, release, testing, compatibility, MCP, and user documentation. Remaining maturity work is primarily discoverability and keeping the VitePress sidebar aligned as the new Diátaxis pages grow.

## Release maturity

| Criterion            | Status  | Evidence / action                                                                                |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| Semantic Versioning  | Passed  | `CHANGELOG.md`, release-please configuration, package versions.                                  |
| Keep a Changelog     | Passed  | Root changelog follows Keep a Changelog.                                                         |
| GitHub Releases      | Passed  | Latest release exists for `vscode-extension-v1.9.4`.                                             |
| Release notes        | Passed  | Release Please and changelog docs exist.                                                         |
| Release workflow     | Passed  | `release-please.yml` and `publish-extension.yml`.                                                |
| Checksums            | Passed  | Release assets include `SHA256SUMS.txt` flow.                                                    |
| SBOM / provenance    | Passed  | Publish workflow stages SBOM, provenance, and attestation.                                       |
| Reproducible release | Partial | Repeatable VSIX checks exist; long-term reproducibility must be proven across multiple releases. |

## Quality maturity

| Criterion          | Status  | Evidence / action                                                                                       |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------- |
| CI                 | Passed  | `ci.yml`.                                                                                               |
| Lint               | Passed  | Extension lint and root gates.                                                                          |
| Typecheck          | Passed  | Extension and package typecheck scripts.                                                                |
| Unit tests         | Passed  | Jest/unit suites.                                                                                       |
| Integration tests  | Passed  | Integration and real-pair lanes exist; real-pair needs local server checkout.                           |
| Coverage threshold | Partial | Global coverage threshold exists; Gold-level coverage claims still require human confirmation.          |
| Quality gate       | Passed  | Root `check` script and CI lanes.                                                                       |
| Test policy        | Passed  | `docs/testing-strategy.md` and this PR's `docs/development/testing-policy.md`.                          |
| Dependency policy  | Passed  | Renovate, GitHub-native dependency alert/update configuration, and this PR's dependency management doc. |

## Governance maturity

| Criterion                     | Status  | Evidence / action                                                                                                  |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| Governance doc                | Passed  | `GOVERNANCE.md`.                                                                                                   |
| Maintainers doc               | Passed  | `MAINTAINERS.md` added.                                                                                            |
| Roadmap                       | Passed  | `ROADMAP.md`.                                                                                                      |
| CODEOWNERS                    | Passed  | `.github/CODEOWNERS`.                                                                                              |
| Support policy                | Passed  | `SUPPORT.md`.                                                                                                      |
| Deprecation policy            | Partial | Compatibility and support matrix exist; explicit deprecation policy should be expanded when support scope changes. |
| Backward compatibility policy | Passed  | `docs/support-matrix.md`, `compatibility.yaml`.                                                                    |
| Branch protection             | Passed  | Active GitHub ruleset matches `.github/rulesets/main.json` and the branch-protection policy.                       |

## Community maturity

| Criterion                     | Status         | Evidence / gap                                                                                                                                                         |
| ----------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time to first response        | Partial        | `SUPPORT.md` defines goals; actual issue response metrics require human/automation measurement.                                                                        |
| Issue resolution process      | Partial        | Templates and support goals exist; dashboards/labels should be monitored.                                                                                              |
| PR review process             | Partial        | Pull requests and CI are enforced by ruleset without a mandatory approval; independent reviewer capacity remains limited by the solo-maintainer model.                 |
| Contributor activity          | Not applicable | Independent contributor activity is not required for the current solo-maintainer target.                                                                               |
| Release frequency             | Partial        | Recent release exists; sustainable cadence needs more history.                                                                                                         |
| Bus factor                    | Missing        | Current evidence points to a single primary maintainer; this is acceptable for Solo-maintainer Professional OSS when governance and release procedures are documented. |
| Documentation discoverability | Passed         | Docs site and Diátaxis seed pages exist.                                                                                                                               |
| Change acceptance process     | Passed         | CONTRIBUTING, PR template, ADR policy, DCO.                                                                                                                            |

## License/legal maturity

| Criterion                                | Status  | Evidence / action                                                                                                  |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| LICENSE                                  | Passed  | MIT.                                                                                                               |
| SPDX identifiers                         | Partial | Policy documented in `docs/legal/reuse-spdx-notice-assessment.md`; per-file headers are future optional work.      |
| REUSE readiness                          | Partial | Assessment documented; full REUSE compliance is not claimed.                                                       |
| Third-party dependency license awareness | Partial | SBOM/release evidence exists; dependency license review should be automated or documented per release.             |
| NOTICE                                   | Passed  | No NOTICE file added because no current obligation was identified; add one only if a concrete requirement appears. |

## Security/supply-chain maturity

| Criterion                                  | Status  | Evidence / action                                                                         |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------------- |
| SECURITY.md                                | Passed  | Private advisory link and handling goals.                                                 |
| Private vulnerability reporting            | Passed  | GitHub endpoint reports `enabled: true`.                                                  |
| CodeQL                                     | Passed  | `codeql.yml`.                                                                             |
| Gitleaks                                   | Passed  | `gitleaks.yml`.                                                                           |
| Dependency review                          | Passed  | Existing security workflow and dedicated dependency-review workflow.                      |
| Renovate / GitHub-native dependency alerts | Passed  | `renovate.json` and GitHub-native dependency alert/update configuration.                  |
| OSV scanning                               | Partial | Renovate OSV alerts exist; standalone OSV scanner workflow is not applied in this PR.     |
| SBOM                                       | Passed  | Publish workflow stages SBOM.                                                             |
| SLSA/provenance                            | Partial | GitHub artifact attestation exists; full SLSA level claim requires external verification. |
| Minimal workflow permissions               | Passed  | Workflows generally default to `contents: read` and elevate per job.                      |

## Missing files

Before this PR, the main missing maturity files were:

- `MAINTAINERS.md`
- `.bestpractices.json`
- `docs/repo-maturity-report.md`
- `docs/openssf-evidence.md`
- `docs/openssf-gap-analysis.md`
- `docs/openssf-proposal-links.md`
- Diátaxis seed folders under `docs/tutorials/`, `docs/how-to/`, `docs/reference/`, `docs/explanation/`
- development policy pages under `docs/development/`
- security assurance pages under `docs/security/`

## Workflow evidence

The repository has CI, CodeQL, Scorecard, Gitleaks, security, dependency review,
docs, release-readiness, publish, and release-please workflows. This reconciliation
adds `governance-evidence.yml`, a read-only scheduled/manual workflow that compares
live GitHub governance state with the checked-in ruleset and uploads a sanitized
JSON report.

## Verified live settings and scoped changes

The 2026-07-20 audit confirmed:

- active default-branch ruleset enforcement with six required checks;
- private vulnerability reporting enabled;
- GitHub-native dependency security updates enabled;
- secret scanning and push protection enabled;
- optional non-provider patterns and validity checks disabled;
- alert, code-scanning, and secret-scanning endpoints accessible.

This issue does not weaken the ruleset, add publishing secrets, change marketplace
publishing behavior, alter coverage thresholds, or modify extension runtime
behavior. The orphaned `automation/auto-assign-incoming` branch was deleted after
its only PR was confirmed closed as stale and explicitly not being carried
forward.

## Recommended issues

1. Keep the live governance evidence workflow green and investigate any ruleset drift.
2. Keep solo-maintainer continuity documented; recruit another maintainer only if Gold/foundation-grade becomes a real goal.
3. Optional future: implement full REUSE/SPDX automation if desired; current legal assessment is documented.
4. Add historical CHAOSS metrics collection for issue response, PR review latency, and release cadence.
5. Evaluate optional secret-scanning non-provider patterns and validity checks before enabling them.
6. Evaluate standalone OSV scanner and Docker image scanning after baseline tuning.
7. Raise or ratchet coverage only after flaky/low-coverage areas are stabilized.

## Created tracking issues

- #471 Enable enforced main branch protection for OSS maturity.
- #472 Human PR review evidence is optional/future-only for Gold; closed as not required for solo-maintainer Professional OSS.
- #473 Additional maintainer capacity is optional/future-only for Gold; closed as not required for solo-maintainer Professional OSS.
- #474 REUSE/SPDX/NOTICE assessment completed in `docs/legal/reuse-spdx-notice-assessment.md`.
- #475 GitHub security settings confirmed in `docs/security/github-security-settings.md`.

## Next actions

1. Merge policy changes only after required checks, bot findings, and review threads are resolved.
2. Let the weekly governance evidence workflow verify live ruleset and security-setting drift.
3. Re-run OpenSSF Scorecard after the updated evidence reaches `main`.
4. Update the Best Practices BadgeApp with the refreshed evidence links in `docs/openssf-proposal-links.md`.
5. Keep Gold/foundation-grade issues closed or optional unless the project intentionally changes from solo-maintainer mode.
