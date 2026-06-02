# Security Model

The repository uses GitHub Actions, protected environments, trusted publishing
for package registries, and preflight checks for version consistency and
forbidden repository references.

## Supply Chain Checks

Pull requests and scheduled workflows keep the supply chain surface visible:

- `Security` runs Node and Python dependency audits and blocks high-severity
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

The MCP server security checks now run in the [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) repository.

That gate requires `gitleaks`, workflow linting, and `zizmor`; scanner findings
must be fixed or triaged before release work proceeds.

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
