# Assurance Case

## Claim

KiCad Studio Kit has a professional OSS assurance baseline for a VS Code extension, but does not yet have Gold/foundation-grade assurance evidence.

## Argument

The repository combines policy, automation, and evidence:

- policy: `SECURITY.md`, `GOVERNANCE.md`, `SUPPORT.md`, `CONTRIBUTING.md`;
- automation: CI, CodeQL, Gitleaks, dependency review, release evidence, package validation;
- evidence: threat model, release integrity, OpenSSF evidence, maturity report;
- governance: CODEOWNERS, PR template, ADRs, roadmap, maintainers file.

## Evidence

| Claim                            | Evidence                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Security reporting is documented | `SECURITY.md`.                                                                                                                      |
| Threat model exists              | `docs/security/threat-model.md`.                                                                                                    |
| Release integrity has controls   | `docs/security/release-integrity.md`, `publish-extension.yml`.                                                                      |
| Quality gates exist              | `package.json`, `.github/workflows/ci.yml`.                                                                                         |
| Supply-chain controls exist      | `renovate.json`, GitHub-native dependency alerts/security updates, `security.yml`, and `docs/security/github-security-settings.md`. |
| Governance exists                | `GOVERNANCE.md`, `MAINTAINERS.md`, `ROADMAP.md`.                                                                                    |

## Residual risk

- Default-branch protection is ruleset-based and must remain synchronized with `.github/rulesets/main.json`.
- Independent human review is not yet evidenced; the solo-maintainer ruleset therefore relies on mandatory PRs, CI, static analysis, dependency review, and resolved conversations rather than an unavailable approval.
- Single-maintainer continuity remains a bus-factor risk.
- Full REUSE/SLSA/Gold claims require separate assessments.
