# GitHub Automation Agent Instructions

These instructions apply to `.github/**` and supplement the repository root
`AGENTS.md`.

## Boundary

Changes here alter repository governance, required status checks, CI execution,
security scanning, permissions, publishing, release evidence or maintainer automation.
Treat workflow and ruleset edits as policy changes, not ordinary YAML cleanup.

## Required status checks

The protected `main` contract currently depends on these required status checks:

- `required`
- `analyze (javascript-typescript)`
- `analyze (python)`
- `security`
- `scan`
- `dependency-review`

Do not rename, path-filter, conditionally suppress or otherwise make a required context stop
reporting on pull requests unless the branch-protection/ruleset contract is intentionally
changed at the same time. Keep the aggregate `required` job always reportable even when
internal CI lanes are skipped.

## Actions and permissions

- Pin third-party GitHub Actions to full commit SHAs.
- Keep repository default workflow permissions read-only.
- Grant write scopes at the narrowest job that needs them and preserve the policy in
  `.github/actions-permissions.json`.
- Keep checkout credentials non-persistent unless a reviewed write flow explicitly needs
  them.
- Do not expose protected secrets, OIDC authority or publishing credentials to untrusted
  pull-request code.
- Preserve fork/event guards where they protect tokens, write permissions or external
  service credentials.

## CI gate integrity

- Do not use `continue-on-error`, broad exclusions, path filters, skip expressions,
  allowlists or threshold changes to turn a real regression green.
- Keep CI lane selection consistent with `scripts/check-ci-lanes.mjs`.
- Required security, dependency, secret-scanning and package-validation contexts must fail
  closed on policy violations.
- If a check context or workflow topology changes, update the checked-in ruleset, branch
  protection docs and validation scripts together.

## Release and publishing

- Release Please owns version-proposal PRs; ordinary feature work must not hand-edit or
  merge the release bot PR.
- Marketplace publishing occurs only through the protected repository workflows and
  protected environments.
- Preserve the VSIX identity chain: reviewed source/tag -> package validation -> checksum ->
  SBOM/provenance/attestation -> marketplace publication -> post-publish verification.
- Visual Studio Marketplace publication is release-blocking. Open VSX has its documented
  separate/non-blocking semantics; do not merge those behaviors merely for symmetry.
- Never publish from a normal development shell or PR workflow.
- The repository does not claim a specific SLSA level. Do not introduce such a claim
  without an explicit assessment and matching evidence.

## Validation

For workflow/governance changes, run the focused checks that apply, including:

```text
corepack pnpm run check:ci-lanes
corepack pnpm run check:branch-protection
corepack pnpm run check:actions-permissions
corepack pnpm run check:quality-gates
corepack pnpm run check:security-tooling
corepack pnpm run check:review-evidence
corepack pnpm run release:verify
```

Also run `actionlint`/Zizmor through the repository security command when workflow syntax,
permissions or action usage changes.

## Definition of done

A GitHub automation change is not ready until the intended policy change, permissions,
required contexts, relevant scripts/tests, artifacts/evidence and downstream release
assumptions agree. Do not make policy cheaper by bypassing its enforcing workflow.
