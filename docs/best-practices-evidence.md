# OpenSSF Best Practices Evidence

This page is the evidence register for the OpenSSF Best Practices project at
<https://www.bestpractices.dev/projects/13405>.

Last reviewed: 2026-07-20.

## Current badge status

Silver badge achieved on 2026-06-30. The live badge is embedded in the README and resolves through the OpenSSF Best Practices project page.

| Field                    | Value                                            |
| ------------------------ | ------------------------------------------------ |
| Best Practices project   | `13405`                                          |
| Repository URL           | `https://github.com/oaslananka/kicad-studio-kit` |
| Product represented here | VS Code extension: `oaslananka.kicadstudiokit`   |
| Current badge status     | Passing and Silver achieved                      |
| Next priority            | Gold gap analysis without overclaiming           |

## Evidence matrix

| Area                  | Claim                                                                                                                            | Repository evidence                                                                                                                                                             | Follow-up                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Project identity      | The repository has a clear product boundary and canonical URL.                                                                   | `README.md`, `CANONICAL.md`, `docs/architecture/repo-structure.md`, `docs/architecture/product-boundaries.md`                                                                   | Keep this repo scoped to the VS Code extension.                                                                              |
| License               | The project uses a recognized FLOSS license.                                                                                     | `LICENSE`, `README.md`                                                                                                                                                          | Keep release artifacts carrying the MIT license file.                                                                        |
| Contribution process  | Contributors have documented contribution requirements.                                                                          | `CONTRIBUTING.md`, `.github/pull_request_template.md`, `.github/CODEOWNERS`, `GOVERNANCE.md`, `SUPPORT.md`                                                                      | Reference these files in the badge form.                                                                                     |
| Code of conduct       | Contributor behavior is documented.                                                                                              | `CODE_OF_CONDUCT.md`                                                                                                                                                            | Link the file in the badge form.                                                                                             |
| Security policy       | Vulnerability reporting is documented.                                                                                           | `SECURITY.md`, `docs/security.md`, `docs/security/threat-model.md`                                                                                                              | Keep reporting instructions current.                                                                                         |
| Issue tracking        | Issues, release blockers, and regressions are tracked in GitHub.                                                                 | `.github/ISSUE_TEMPLATE/`, `SUPPORT.md`, `docs/RELEASE-COORDINATION.md`, `docs/release-candidate-checklist.md`                                                                  | Document expected response timing if the badge form requires it.                                                             |
| Build                 | The extension has reproducible local build commands.                                                                             | `package.json`, `apps/vscode-extension/package.json`, `docs/getting-started.md`, `docs/devcontainer.md`                                                                         | Keep `corepack pnpm --filter kicadstudiokit run check` as the product gate.                                                  |
| Tests                 | Unit, security, accessibility, integration, fixture, and package checks exist.                                                   | `apps/vscode-extension/test/`, `packages/test-harness/`, `packages/kicad-fixtures/`, `docs/testing-strategy.md`, `apps/vscode-extension/jest.config.js`                         | Keep test counts and strategy current after refactors.                                                                       |
| Dynamic analysis      | Runtime security, webview, and accessibility suites exercise the extension before release.                                       | `apps/vscode-extension/package.json` `test:dynamic-analysis`, `apps/vscode-extension/test/security/`, `apps/vscode-extension/test/webview/`, `apps/vscode-extension/test/a11y/` | Keep runtime assertion suites in the dynamic-analysis gate.                                                                  |
| Coverage policy       | Extension unit coverage enforces at least 80% global statements, lines, and functions.                                           | `apps/vscode-extension/jest.config.js` `coverageThreshold.global.statements >= 80`, checked by `corepack pnpm run check:best-practices`                                         | Keep thresholds above the Best Practices 80% statement coverage claim.                                                       |
| Repeatable VSIX       | Two independent VSIX package runs must produce identical normalized payload content.                                             | `scripts/check-repeatable-vsix.mjs`, `apps/vscode-extension/scripts/validate-vsix-metadata.js`, `corepack pnpm run check:repeatable-vsix`                                       | Keep normalized content digest stable across packaging runs.                                                                 |
| CI                    | Pull requests and default-branch changes are validated by GitHub Actions.                                                        | `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/security.yml`, `.github/workflows/vsix-build.yml`, `.github/workflows/docs.yml`                  | Keep active repository ruleset and CI gates enforced.                                                                        |
| Static analysis       | CodeQL, ESLint, TypeScript, actionlint, and package validation are part of the gates.                                            | `.github/workflows/codeql.yml`, `.github/workflows/security.yml`, `eslint.config.cjs`, `scripts/check-ci-lanes.mjs`, `apps/vscode-extension/scripts/validate-package.js`        | Resolve the Scorecard SAST alert by confirming all sampled commits run SAST.                                                 |
| Dependency management | Dependency updates and supply-chain checks are automated.                                                                        | `renovate.json`, `scripts/check-pnpm-supply-chain.mjs`, `pnpm-lock.yaml`                                                                                                        | Keep lockfile-only installs enforced.                                                                                        |
| Local secret hygiene  | Repository scanning and tests cover secret leakage risks.                                                                        | `.github/workflows/gitleaks.yml`, `apps/vscode-extension/test/security/`, `scripts/check-pnpm-supply-chain.mjs`                                                                 | Keep GitHub alert count at zero.                                                                                             |
| Release notes         | Releases are generated and documented.                                                                                           | `.github/workflows/release-please.yml`, `docs/changelog/`, `docs/release.md`, `apps/vscode-extension/CHANGELOG.md`                                                              | Call out security fixes explicitly.                                                                                          |
| Provenance            | Release evidence includes checksums, SBOM, and attestation steps.                                                                | `.github/workflows/publish-extension.yml`, `apps/vscode-extension/scripts/create-release-assets.js`, `scripts/check-release-provenance.mjs`, `docs/release.md`                  | Re-check Scorecard Signed-Releases after the next attested release.                                                          |
| Branch protection     | A strict main-branch ruleset with stable required checks is versioned in the repo.                                               | `.github/rulesets/main.json`, `docs/architecture/branch-protection.md`, `scripts/check-branch-protection-gates.mjs`                                                             | Ruleset is active; keep required contexts stable.                                                                            |
| Review process        | CODEOWNERS and PR templates exist; solo-maintainer PRs are gated by CI and conversation resolution without a mandatory approval. | `.github/CODEOWNERS`, `.github/pull_request_template.md`, `docs/architecture/branch-protection.md`                                                                              | Add independent human review when another qualified maintainer is available; do not create a solo-maintainer merge deadlock. |
| Documentation         | User, extension, integration, release, security, and architecture docs are maintained.                                           | `docs/`, `docs/.vitepress/config.mts`, `scripts/check-docs-site.mjs`                                                                                                            | Keep links validated by `corepack pnpm run check:docs-site`.                                                                 |
| Accessibility         | Webview accessibility tests are present and run under the extension check.                                                       | `apps/vscode-extension/test/a11y/`, `docs/accessibility.md`, `scripts/dev-doctor.mjs`                                                                                           | Keep Playwright browser cache covered by `dev-doctor`.                                                                       |
| Internationalization  | UI string parity is validated.                                                                                                   | `apps/vscode-extension/package.nls.json`, `scripts/check-nls-parity.mjs`, `apps/vscode-extension/src/webviewI18n.ts`                                                            | Fill the corresponding badge field with NLS parity evidence.                                                                 |

## Questionnaire fill guide

Use [Best Practices Questionnaire Fill Guide](best-practices-questionnaire.md) when updating the web form. It separates evidence-backed fields from fields that should remain Partial, Not Applicable, or unclaimed until more evidence exists.

## Local evidence gate

Repository-controlled Best Practices and Scorecard hardening anchors are
validated by:

```bash
corepack pnpm run check:best-practices
```

This keeps the README badge, VitePress entry, evidence page, digest-pinned uv
devcontainer install, Playwright browser-cache doctor check, and stable branch
ruleset contexts from drifting.

## Scorecard remediation mapping

| Low score / alert   | Evidence already present                                                                       | Required action                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch-Protection   | `.github/rulesets/main.json`, `docs/architecture/branch-protection.md`, live evidence workflow | Active ruleset confirmed; investigate any scheduled evidence drift and re-run Scorecard.                                                   |
| Code-Review         | `.github/CODEOWNERS`, PR template, branch policy doc                                           | Accept the solo-maintainer limitation; require PRs, green CI, bot checks, and resolved threads until an independent reviewer is available. |
| CII-Best-Practices  | This page plus existing policy docs                                                            | Silver achieved on 2026-06-30; keep the badge in README and maintain evidence URLs.                                                        |
| Signed-Releases     | `publish-extension.yml`, `create-release-assets.js`, release docs                              | Confirm that the next release exposes attestations in a detectable way.                                                                    |
| SAST                | CodeQL workflow and security workflow                                                          | Confirm CodeQL runs on every default-branch/PR path Scorecard samples.                                                                     |
| Pinned-Dependencies | Devcontainer pins the base image, the official uv image digest, and downloaded tool checksums  | Re-run Scorecard/code scanning after the next default-branch scan to clear stale line references.                                          |
| Maintained          | Active commits and releases                                                                    | This improves automatically as the repository ages.                                                                                        |
| Packaging           | `publish-extension.yml`, Marketplace/Open VSX publication                                      | Keep publish workflow names and release assets obvious to automated detectors.                                                             |

## Ruleset verification

The versioned ruleset is `.github/rulesets/main.json`. The 2026-07-20 audit
confirmed that the active `main-protection` ruleset matches it, including six
required checks. `.github/workflows/governance-evidence.yml` repeats this
comparison weekly and on demand; investigate any drift before changing maturity
claims.
