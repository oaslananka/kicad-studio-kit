# OpenSSF Proposal Links

Use these links when updating OpenSSF Best Practices BadgeApp evidence or filing Scorecard remediation issues.

## BadgeApp

- Best Practices project: <https://www.bestpractices.dev/projects/13405>
- Repository evidence: `docs/best-practices-evidence.md`
- Supplemental evidence: `docs/openssf-evidence.md`
- Gap analysis: `docs/openssf-gap-analysis.md`
- Maturity report: `docs/repo-maturity-report.md`

## Scorecard

- Scorecard viewer: <https://scorecard.dev/viewer/?uri=github.com/oaslananka/kicad-studio-kit>
- Branch protection evidence: `.github/rulesets/main.json`, `docs/architecture/branch-protection.md`, `.github/workflows/governance-evidence.yml`
- Code review evidence: `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `GOVERNANCE.md`
- Security policy evidence: `SECURITY.md`, `docs/security/threat-model.md`
- CI evidence: `.github/workflows/ci.yml`
- SAST evidence: `.github/workflows/codeql.yml`
- Dependency evidence: `renovate.json` and GitHub-native dependency alert/update configuration, `.github/workflows/dependency-review.yml`
- Release integrity evidence: `.github/workflows/publish-extension.yml`, `docs/security/release-integrity.md`

## Recommended issue links

Create or keep GitHub issues for:

1. Live ruleset or governance-evidence drift.
2. Additional maintainer recruitment only if the target changes beyond solo-maintainer Professional OSS.
3. REUSE/SPDX readiness: `docs/legal/reuse-spdx-notice-assessment.md`.
4. Optional GitHub security-setting hardening: `docs/security/github-security-settings.md`.
5. Gold/foundation-grade gap tracking only when that maturity target is adopted.
