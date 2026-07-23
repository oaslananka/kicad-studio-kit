# Security Model

The repository uses GitHub Actions, protected environments, trusted publishing
for package registries, and preflight checks for version consistency and
forbidden repository references.

## Continuous Security Scanning Posture

Security scanning is continuous, visible on every pull request, and wired into
the merge and release decision. The table below is the standing posture; the
sections that follow give the detail for each lane.

| Control                                | Where it runs                                                                                                                     | Gate                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Code scanning (CodeQL, JS/TS + Python) | `CodeQL` workflow on pull requests, pushes, and weekly                                                                            | High-severity code-scanning alerts block merge                                                   |
| Repository-specific SAST               | Semgrep 1.170.0 custom rules in the required `Security` workflow                                                                  | Shell-string execution, dynamic evaluation, and sensitive-value logging findings fail `security` |
| Workflow security                      | actionlint 1.7.12 and zizmor 1.28.0 in the required `Security` workflow                                                           | Syntax/shell errors and high-confidence medium-or-higher Actions findings fail `security`        |
| Development-container configuration    | Trivy v0.72.0 configuration-only scan in the required `Security` workflow on pull requests, pushes, weekly, and manual runs       | HIGH/CRITICAL misconfigurations fail `security`; SARIF is published under `trivy-devcontainer`   |
| Secret scanning                        | `Gitleaks` workflow on every pull request plus the local security gate; GitHub secret scanning with push protection stays enabled | A new secret-scanning alert blocks release until triaged                                         |
| Dependency review                      | `Security` workflow `dependency-review` job on pull requests                                                                      | New `high`+ dependency additions block the pull request                                          |
| Dependency audit                       | `Security` workflow `pnpm audit --audit-level high`                                                                               | High-severity advisories fail the check                                                          |
| Supply-chain policy                    | `check:supply-chain` (`minimumReleaseAge`, `blockExoticSubdeps`)                                                                  | Untrusted or too-new transitive dependencies fail CI                                             |
| Repository health                      | `Scorecard` workflow (OSSF) publishing to code scanning                                                                           | Findings are tracked, not auto-blocking                                                          |
| Dependency updates                     | Renovate for version bumps; repository-level GitHub security alerts and automated GitHub Actions security updates                 | Reviewed through the dependency lanes                                                            |

### Decisions and expectations

- **Code scanning** is enabled (CodeQL) for TypeScript/JavaScript and Python.
- **Custom Semgrep rules** are repository-owned and intentionally narrow. They
  protect local invariants around shell-string execution, dynamic evaluation,
  and sensitive-value logging; broad generic SAST remains CodeQL's job.
- **Workflow validation** uses native actionlint plus offline zizmor with
  high-confidence, medium-or-higher findings as the blocking threshold.
- **Development-container configuration** uses Trivy v0.72.0 in configuration-only mode against `.devcontainer/`. HIGH/CRITICAL findings block the existing required `security` status after SARIF evidence is uploaded under the `trivy-devcontainer` category.
- **Scanner ownership stays narrow**: CodeQL owns broad SAST; dependency review, pnpm audit, and Snyk own dependency risk; GitHub push protection and Gitleaks own secrets. Trivy does not run vulnerability, dependency, license, or secret scanners here.
- **Secret scanning**: GitHub secret scanning with push protection is expected
  to remain enabled on the canonical repository. `Gitleaks` enforces the same
  gate in CI and the `apps/vscode-extension/scripts/local-security` scripts
  enforce it locally before pushing.
- **Dependency review** runs on every pull request and blocks high-severity
  dependency additions.
- **Automated security updates**: Dependabot is security-only for the active root npm and GitHub Actions surfaces; both entries use `open-pull-requests-limit: 0`, while routine dependency version bumps remain delegated to Renovate. The removed MCP server has no local Dependabot ecosystem. `.github/retired-dependency-manifests.json`, `check:dependabot-policy`, and weekly live evidence prevent the retired `/packages/mcp-server` uv target from returning and fail on new dependency-graph or open-alert drift.
- **Workflow permissions** are least-privilege: every workflow declares a
  top-level `permissions:` block that defaults to `contents: read`. Jobs
  escalate only the scopes they need, for example `security-events: write` for
  code-scanning uploads and `id-token: write` for OIDC publishing.
- **Third-party GitHub Actions** are pinned to a full commit SHA, and
  `actionlint` plus `zizmor` lint the workflows in the local security gate.

### Release blocking policy

A release is not ready while any of the following is true:

- an unresolved critical or high code-scanning or dependency alert exists
  without a recorded waiver,
- an open secret-scanning alert is untriaged,
- `dependency-review` is blocking an in-flight pull request,
- a release workflow requests broader permissions than it needs, or
- package provenance or artifact validation fails.

Waivers follow the Alert Triage steps below: record the exact advisory, the
reasoning, the owner, and the recheck condition before dismissing or deferring
a finding.

## Supply Chain Checks

Pull requests and scheduled workflows keep the supply chain surface visible:

- `Security` runs the Node dependency audit and blocks high-severity
  dependency additions through Dependency Review.
- `CodeQL` analyzes TypeScript/JavaScript and Python.
- `Gitleaks` fails on committed secret material with redacted output.
- `Scorecard` publishes repository health findings through code scanning.
- PyPI and TestPyPI publish jobs use Trusted Publishing through GitHub OIDC and
  upload registry-native attestations through `pypa/gh-action-pypi-publish`.
- pnpm 11 supply-chain controls are explicit in `pnpm-workspace.yaml`:
  `minimumReleaseAge: 10080` delays newly published npm versions for seven days,
  `trustPolicy: no-downgrade` rejects weaker package provenance, and
  `blockExoticSubdeps: true` keeps transitive dependencies on trusted registry,
  workspace, local, or trusted upstream sources.
- `minimumReleaseAgeExclude` is limited by `check:supply-chain` to exact
  security-patch versions. `tmp@0.2.7` retains the reviewed tmp remediation and
  `fast-uri@3.1.4` resolves GHSA-4c8g-83qw-93j6 while that release completes the
  seven-day cooldown.
- `trustPolicyExclude` is limited to the reviewed lockfile baseline selectors
  `@octokit/endpoint@9.0.6`, `chokidar@4.0.3`, and
  `semver@5.7.2 || 6.3.1`. Remove each selector as soon as the transitive graph
  no longer resolves that exact version; broad package-name exclusions are not
  permitted.
- GHCR image publishing uses GitHub Container Registry, BuildKit SBOM and
  provenance, Trivy image scanning, and keyless Sigstore `cosign` signing.
- Release publish workflows validate package contents, emit SHA-256 checksum
  evidence, and create GitHub artifact attestations where package registries do
  not already provide provenance.

## Multi-Scanner Audit Dispositions

The 2026-07-23 VPS audit used SonarQube CLI, Semgrep 1.170.0, OSV Scanner
2.4.0, and Trivy 0.72.0 in addition to the repository's existing CodeQL,
Gitleaks, dependency-review, and custom Semgrep gates.

- SonarQube secret scanning of tracked text and configuration files reported no
  issues. General agentic code analysis and SCA were unavailable in the active
  organization plan and were not recorded as passing scans.
- OSV Scanner evaluated all 1,198 `pnpm-lock.yaml` packages and reported no
  known vulnerabilities.
- Trivy filesystem scanning reported no HIGH/CRITICAL vulnerabilities, secrets,
  or misconfigurations.
- Repository-owned Semgrep rules reported no findings. Broader community rules
  produced audit candidates dominated by nonce-protected VS Code webviews,
  escaped or controlled regular expressions, tests, and pnpm/Renovate location
  heuristics. Those are recorded as non-actionable under the repository's
  single-owner scanner model.
- Actionable defense-in-depth findings were corrected: policy-pack globs now use
  deterministic non-RegExp matching, the TOML subset parser rejects
  prototype-sensitive keys, and pnpm/Renovate enforce the seven-day cooldown
  plus no-downgrade trust policy.

Do not add another mandatory broad SAST, SCA, or secret scanner solely to repeat
these categories. CodeQL owns broad SAST, custom Semgrep owns repository
invariants, OSV/dependency review/pnpm audit own dependency evidence, and
Gitleaks plus GitHub push protection own committed secrets.

## Alert Triage

Treat a red PR security check and a GitHub dependency or code-scanning alert as
the same intake path:

1. Read the failing check or alert first and identify the affected product,
   dependency, advisory, severity, and fixed version if one exists.
2. Keep vulnerability fixes narrow. Update the lockfile or manifest for the
   affected product, run the product security and package checks, and link the
   alert or advisory in the PR.
3. If no fix exists or local usage makes the report non-exploitable, record the
   exact advisory, reasoning, owner, and recheck condition before dismissing or
   deferring it.
4. For an active vulnerability that should not be public, use a GitHub Security
   Advisory instead of an issue.

The dependency update lanes and label rules live in
[dependency-lifecycle.md](dependency-lifecycle.md).

## Local Secret Gate

Pre-commit rejects obvious private keys. Before pushing security-sensitive
changes, run the local scanner gate as well:

The MCP server security checks now run in the [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/) repository.

That gate requires `pre-commit` 4.6.0, `gitleaks`, native actionlint 1.7.12,
zizmor 1.28.0, and Semgrep 1.170.0. Run it with
`task security:local` from `apps/vscode-extension`, or run the focused root
commands `pnpm run security:workflows`, `pnpm run test:semgrep-rules`,
`pnpm run security:semgrep`, and `pnpm run security:trivy-devcontainer`. The
Trivy command is configuration-only and scans `.devcontainer/` at the same
HIGH/CRITICAL threshold used in CI. Scanner findings must be fixed or explicitly
triaged before release work proceeds. CodeQL remains the broad SAST authority,
and push protection plus Gitleaks remain the secret-scanning authorities.

## pnpm Lockfile Trust

Keep `trustLockfile` disabled for this public repository. pnpm 11.3 can skip
the supply-chain verification pass for already-trusted lockfiles, but pull
requests can include lockfile edits, so CI must continue re-applying
`minimumReleaseAge` and trust-policy checks during installs. Re-evaluate this
only if lockfile writes become maintainer-only and the repo has upgraded to
pnpm 11.3 or newer.

Emergency vulnerability patches that are newer than `minimumReleaseAge` may use
a version-scoped `minimumReleaseAgeExclude` entry only when a reviewed advisory
identifies the fixed version and `check:supply-chain` is updated to reject broad
package-name exceptions. Trust-policy exceptions follow the same rule: exact
versions only, documented evidence, and removal when the dependency graph moves
past the affected release.

Validate the policy with:

```bash
corepack pnpm run check:supply-chain
corepack pnpm config list
```

Secrets are limited to marketplace publishing where OIDC is not available:

- `VSCE_PAT`
- `OVSX_PAT`
