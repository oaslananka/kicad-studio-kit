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

```bash
corepack pnpm --dir packages/mcp-server run security:local
```

That gate requires `gitleaks`, workflow linting, and `zizmor`; scanner findings
must be fixed or triaged before release work proceeds.

Secrets are limited to marketplace publishing where OIDC is not available:

- `VSCE_PAT`
- `OVSX_PAT`
