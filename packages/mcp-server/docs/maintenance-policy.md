# Maintenance Policy

## Local Gates

Use these commands before pushing:

```bash
task install
task pre-push
task ci
```

`task pre-push` runs metadata sync checks, format checks, Ruff, mypy, unit tests,
workflow YAML parsing, and actionlint. `task ci` adds the full test suite with
the coverage threshold unchanged at 90%, enforced security checks, workflow
security checks, and package build verification.

`task security:local` is stricter about workstation tools. It requires
Gitleaks, actionlint, and zizmor, and runs OSV Scanner and Trivy when installed.
Missing required binaries fail with install guidance instead of silently
skipping the scan.

## Dependency Updates

Dependabot remains responsible for security updates and alerts. Renovate handles
regular version update PRs using `renovate.json`.

Patch and minor updates for development tooling and GitHub Actions may automerge
only after protected checks pass. Runtime dependencies, major updates, and core
KiCad/MCP/Pydantic/Typer ecosystem updates require Dependency Dashboard approval
and maintainer review.

## Security Scans

Required gates are Ruff, mypy, pytest with coverage, Bandit, the pip-audit backed
dependency audit, Gitleaks in CI, actionlint, and zizmor workflow checks. Safety
is an additional optional Python supply-chain scan; it is not the only enforced
dependency gate and local development must not require `SAFETY_API_KEY`.

OSV Scanner, Trivy filesystem scans, Scorecard, CodeQL, Hadolint, and
authenticated Safety scans are recommended scheduled or release-time checks.

## Release Ownership

`release-please` is the changelog and release PR source of truth. Registry
publishing is restricted to protected release workflows after tests, security
checks, build, SBOM, checksums, and artifact attestation complete.
