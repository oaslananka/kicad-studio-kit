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
| Workflow security                      | actionlint 1.7.12 and zizmor 1.27.0 in the required `Security` workflow                                                           | Syntax/shell errors and high-confidence medium-or-higher Actions findings fail `security`        |
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
- **Secret scanning**: GitHub secret scanning with push protection is expected
  to remain enabled on the canonical repository. `Gitleaks` enforces the same
  gate in CI and the `apps/vscode-extension/scripts/local-security` scripts
  enforce it locally before pushing.
- **Dependency review** runs on every pull request and blocks high-severity
  dependency additions.
- **Automated security updates**: Dependabot is security-only for the active root npm and GitHub Actions surfaces; both entries use `open-pull-requests-limit: 0`, while routine dependency version bumps remain delegated to Renovate. The removed MCP server has no local Dependabot ecosystem, and the retired `/packages/mcp-server` uv target must never be restored here.
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
- pnpm 11 supply-chain defaults are made explicit in `pnpm-workspace.yaml`:
  `minimumReleaseAge: 1440` delays newly published npm versions by 24 hours,
  and `blockExoticSubdeps: true` keeps transitive dependencies on trusted
  registry, workspace, local, or trusted upstream sources.
- `minimumReleaseAgeExclude` is limited by `check:supply-chain` to
  version-scoped security patch exceptions. The current exception,
  `tmp@0.2.6`, resolves GHSA-ph9p-34f9-6g65 without broadening the maturity
  bypass to future `tmp` releases.
- GHCR image publishing uses GitHub Container Registry, BuildKit SBOM and
  provenance, Trivy image scanning, and keyless Sigstore `cosign` signing.
- Release publish workflows validate package contents, emit SHA-256 checksum
  evidence, and create GitHub artifact attestations where package registries do
  not already provide provenance.

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
zizmor 1.27.0, and Semgrep 1.170.0. Run it with
`task security:local` from `apps/vscode-extension`, or run the focused root
commands `pnpm run security:workflows`, `pnpm run test:semgrep-rules`, and
`pnpm run security:semgrep`. Scanner findings must be fixed or explicitly
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
package-name exceptions.

Validate the policy with:

```bash
corepack pnpm run check:supply-chain
corepack pnpm config list
```

Secrets are limited to marketplace publishing where OIDC is not available:

- `VSCE_PAT`
- `OVSX_PAT`
