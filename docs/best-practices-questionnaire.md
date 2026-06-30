# Best Practices Questionnaire Fill Guide

This file is a maintainer-facing guide for completing the OpenSSF Best Practices questionnaire for project `13405`.

Use these answers as evidence-backed starting points. Do not mark an item as Met in the web form unless the referenced repository evidence is already merged on the default branch.

Before editing the web form, refresh the remote status report:

```bash
corepack pnpm run best-practices:status
corepack pnpm run best-practices:status:write
```

The first command prints a dry-run report. The second writes `docs/best-practices-status.md` for maintainer review.

## Badge milestone

Passing and Silver were achieved on 2026-06-30. Future edits should focus on preserving evidence URLs for achieved criteria and preparing Gold only when the repository has real supporting evidence.

## High-impact Passing fields

| Field                                    | Suggested value                                  | Evidence                                                                                                 |
| ---------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `homepage_url`                           | `https://oaslananka.github.io/kicad-studio-kit/` | `README.md`, docs site config                                                                            |
| `description_good`                       | Met                                              | README describes the extension scope, product boundary, install links, and compatibility baseline.       |
| `interact`                               | Met                                              | GitHub Issues, pull requests, `CONTRIBUTING.md`, `SUPPORT.md`                                            |
| `contribution_requirements`              | Met                                              | `CONTRIBUTING.md`, PR template, CODEOWNERS, branch protection policy                                     |
| `documentation_interface`                | Met                                              | `docs/`, VitePress config, command/settings/view docs                                                    |
| `repo_interim`                           | Met                                              | Canonical repository is `https://github.com/oaslananka/kicad-studio-kit`; releases and docs point to it. |
| `version_unique`                         | Met                                              | `apps/vscode-extension/package.json`, release-surface check, Marketplace/Open VSX identity validation    |
| `version_semver`                         | Met                                              | VS Code extension version `1.9.0` follows SemVer-style extension release numbering.                      |
| `version_tags`                           | Met after verifying release tags                 | GitHub release tag `vscode-extension-v1.9.0`; release-please workflow                                    |
| `release_notes_vulns`                    | Met if release notes call out security fixes     | `docs/release.md`, changelog docs, release-please workflow                                               |
| `report_url`                             | Met                                              | GitHub Issues and `SUPPORT.md`                                                                           |
| `report_tracker`                         | Met                                              | GitHub Issues templates and governance board                                                             |
| `report_responses`                       | Met                                              | `SUPPORT.md` handling table                                                                              |
| `enhancement_responses`                  | Met                                              | `SUPPORT.md`, governance board priority model                                                            |
| `report_archive`                         | Met                                              | GitHub Issues and releases provide public historical records.                                            |
| `vulnerability_report_process`           | Met                                              | `SECURITY.md`, `docs/security.md`                                                                        |
| `vulnerability_report_private`           | Met                                              | GitHub Security Advisories link in `SECURITY.md`                                                         |
| `vulnerability_report_response`          | Met                                              | `SECURITY.md` response targets                                                                           |
| `build`                                  | Met                                              | root and extension package scripts, devcontainer docs                                                    |
| `build_common_tools`                     | Met                                              | Node, pnpm, TypeScript, webpack, VSIX tooling                                                            |
| `build_floss_tools`                      | Met                                              | FLOSS build/test toolchain documented in package scripts                                                 |
| `test`                                   | Met                                              | extension unit/security/accessibility/integration/package validation tests                               |
| `test_invocation`                        | Met                                              | README local validation and `CONTRIBUTING.md` commands                                                   |
| `test_most`                              | Met                                              | `corepack pnpm --filter kicadstudiokit run check` covers the product surface                             |
| `test_policy`                            | Met                                              | `CONTRIBUTING.md` regression coverage section, `docs/testing-strategy.md`                                |
| `tests_are_added`                        | Met                                              | CONTRIBUTING regression policy                                                                           |
| `tests_documented_added`                 | Met                                              | CONTRIBUTING regression evidence requirements                                                            |
| `warnings`                               | Met                                              | ESLint, TypeScript, package validation, security tests                                                   |
| `warnings_fixed`                         | Met                                              | CI gates fail on lint/type/package/security issues                                                       |
| `warnings_strict`                        | Met                                              | strict TypeScript and package checks in extension check                                                  |
| `static_analysis`                        | Met                                              | CodeQL workflow, ESLint, TypeScript                                                                      |
| `static_analysis_common_vulnerabilities` | Met                                              | CodeQL plus security regression tests                                                                    |
| `static_analysis_fixed`                  | Met                                              | required CI/security gates block known issues                                                            |
| `static_analysis_often`                  | Met                                              | CodeQL runs on push, pull request, schedule, and manual dispatch                                         |
| `test_continuous_integration`            | Met                                              | GitHub Actions CI, CodeQL, Security, docs workflows                                                      |
| `no_leaked_credentials`                  | Met                                              | Gitleaks workflow and secret-related tests                                                               |
| `english`                                | Met                                              | README, docs, issue templates, and release docs are in English.                                          |

## Security and Silver-level fields

| Field                            | Suggested value                                     | Evidence / note                                                                                                                     |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `governance`                     | Met                                                 | `GOVERNANCE.md`, governance board model                                                                                             |
| `code_of_conduct`                | Met                                                 | `CODE_OF_CONDUCT.md`                                                                                                                |
| `roles_responsibilities`         | Met                                                 | `GOVERNANCE.md` roles table                                                                                                         |
| `access_continuity`              | Met                                                 | `GOVERNANCE.md` access continuity section                                                                                           |
| `bus_factor`                     | Met                                                 | `GOVERNANCE.md`, release/security runbooks                                                                                          |
| `documentation_roadmap`          | Met                                                 | `ROADMAP.md`, governance board, GA readiness docs                                                                                   |
| `documentation_architecture`     | Met                                                 | `docs/architecture/`, ADRs                                                                                                          |
| `documentation_security`         | Met                                                 | `SECURITY.md`, `docs/security.md`, threat model                                                                                     |
| `documentation_quick_start`      | Met                                                 | README local validation, getting-started/install docs                                                                               |
| `documentation_current`          | Met                                                 | docs-site generated/links checks                                                                                                    |
| `accessibility_best_practices`   | Met                                                 | a11y tests and accessibility docs                                                                                                   |
| `internationalization`           | Met                                                 | NLS files and NLS parity check                                                                                                      |
| `maintenance_or_update`          | Met                                                 | Renovate config, dependency lifecycle docs, security workflow                                                                       |
| `vulnerability_report_credit`    | Met                                                 | `SECURITY.md` coordinated disclosure and credit wording                                                                             |
| `vulnerability_response_process` | Met                                                 | `SECURITY.md`, release/security docs                                                                                                |
| `coding_standards`               | Met                                                 | ESLint, Prettier, TypeScript, contribution docs                                                                                     |
| `coding_standards_enforced`      | Met                                                 | CI and local `check` scripts                                                                                                        |
| `build_repeatable`               | Met                                                 | `corepack pnpm run check:repeatable-vsix` packages the VSIX twice and compares normalized payload content.                          |
| `dependency_monitoring`          | Met                                                 | Renovate config, security workflow, lockfile supply-chain checks                                                                    |
| `automated_integration_testing`  | Met                                                 | extension integration and real-pair tests where available                                                                           |
| `test_statement_coverage80`      | Met                                                 | `apps/vscode-extension/jest.config.js` enforces global statement coverage above 80%, and CI coverage is above the Silver threshold. |
| `signed_releases`                | Met after release verification                      | publish workflow uses GitHub artifact attestations, SBOM, checksums, and provenance; re-check after next release.                   |
| `require_2FA`                    | Met only if organization/account policy enforces it | Confirm GitHub organization/user security settings before marking.                                                                  |
| `secure_2FA`                     | Met only after confirming account policy            | Do not mark without checking GitHub settings.                                                                                       |
| `code_review_standards`          | Met after ruleset active                            | branch ruleset + CODEOWNERS + PR template                                                                                           |
| `two_person_review`              | Partial unless a second reviewer is required        | Current versioned ruleset requires one approval; do not overclaim.                                                                  |

## Crypto fields

KiCad Studio Kit should not claim custom cryptography. For fields about cryptographic algorithms, key lengths, PFS, password storage, random number generation, credential agility, and algorithm agility, use the form's Not Applicable option if available and explain that the extension relies on platform/Node/VS Code/GitHub/TLS mechanisms rather than implementing cryptographic primitives directly.

## Fields that should remain cautious

| Field                                                  | Why cautious                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `dynamic_analysis` and related unsafe-input fields     | There are integration, security, accessibility, and webview tests, but not a dedicated dynamic application security testing tool.           |
| `test_statement_coverage90` / `test_branch_coverage80` | Check the latest coverage report before claiming Gold-level coverage.                                                                       |
| `contributors_unassociated`                            | Current public history may not show enough independent contributors.                                                                        |
| `copyright_per_file` / `license_per_file`              | Do not mark unless every required source file carries the expected notice or the project policy explicitly allows repository-level notices. |
| `security_review`                                      | Mark only after a documented independent or structured review exists.                                                                       |
| `assurance_case`                                       | Silver evidence exists in `SECURITY.md`, `docs/security.md`, threat-model docs, and `docs/best-practices-evidence.md`; keep URLs explicit.  |
