# OpenSSF Evidence

This file is a concise evidence map for OpenSSF Best Practices and Scorecard readiness. It complements the detailed register in `docs/best-practices-evidence.md`.

## Project identity

| Field                  | Evidence                                                                   |
| ---------------------- | -------------------------------------------------------------------------- |
| Project                | KiCad Studio Kit                                                           |
| Repository             | `https://github.com/oaslananka/kicad-studio-kit`                           |
| Product                | VS Code extension: `oaslananka.kicadstudiokit`                             |
| License                | `LICENSE` / MIT                                                            |
| Best Practices project | `https://www.bestpractices.dev/projects/13405`                             |
| Scorecard viewer       | `https://scorecard.dev/viewer/?uri=github.com/oaslananka/kicad-studio-kit` |

## OpenSSF Best Practices evidence

| Area                  | Status  | Evidence                                                                                                   |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Identification        | Passed  | `README.md`, `CANONICAL.md`, `package.json`.                                                               |
| FLOSS license         | Passed  | `LICENSE`, README badge.                                                                                   |
| Contribution process  | Passed  | `CONTRIBUTING.md`, PR template, DCO section.                                                               |
| Code of Conduct       | Passed  | `CODE_OF_CONDUCT.md`.                                                                                      |
| Security reporting    | Passed  | `SECURITY.md`, GitHub Security Advisory link.                                                              |
| Build and install     | Passed  | `README.md`, `docs/tutorials/getting-started.md`, `docs/devcontainer.md`.                                  |
| Test policy           | Passed  | `docs/testing-strategy.md`, `docs/development/testing-policy.md`.                                          |
| Static analysis       | Passed  | CodeQL, ESLint, TypeScript, actionlint/security checks.                                                    |
| Dependency management | Passed  | Renovate, GitHub-native dependency alerts/update configuration, pnpm lockfile, supply-chain checks.        |
| Release evidence      | Passed  | `publish-extension.yml`, checksums, SBOM, provenance, attestations.                                        |
| Branch protection     | Passed  | Active `main-protection` ruleset matches `.github/rulesets/main.json`; weekly live evidence detects drift. |
| Human review          | Partial | Ruleset enforces review controls; sustained independent human-review evidence remains limited.             |
| Gold                  | Missing | Multiple independent maintainers/reviewers and sustained review evidence are not present.                  |

## Scorecard evidence

| Scorecard check        | Repository evidence                                                                               | Current status                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Branch-Protection      | `.github/rulesets/main.json`, `docs/architecture/branch-protection.md`, `governance-evidence.yml` | Passed; live ruleset confirmed active on 2026-07-20.                                  |
| Code-Review            | `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, active ruleset                          | Partial; enforcement is active, but sustained independent review evidence is limited. |
| CI-Tests               | `.github/workflows/ci.yml`                                                                        | Passed.                                                                               |
| Security-Policy        | `SECURITY.md`                                                                                     | Passed.                                                                               |
| License                | `LICENSE`                                                                                         | Passed.                                                                               |
| SAST                   | `.github/workflows/codeql.yml`                                                                    | Passed.                                                                               |
| Token-Permissions      | workflow-level `permissions: contents: read` plus job-level elevation                             | Passed.                                                                               |
| Dangerous-Workflow     | Pinned actions and no new risky triggers in this PR                                               | Partial; keep reviewing release workflows.                                            |
| Dependency-Update-Tool | `renovate.json` and GitHub-native dependency alert/update configuration                           | Passed.                                                                               |
| Pinned-Dependencies    | digest-pinned actions, lockfile                                                                   | Passed.                                                                               |

## Evidence maintenance

Update this file when any of the following changes:

- branch protection/rulesets become active;
- maintainers or CODEOWNERS change;
- release process changes;
- security reporting or vulnerability settings change;
- OpenSSF BadgeApp status changes;
- Scorecard findings change materially.
