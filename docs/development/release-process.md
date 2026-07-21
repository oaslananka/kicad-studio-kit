# Release Process

## Release model

KiCad Studio Kit releases the VS Code extension from this repository. The MCP server is released from its own repository.

## Release automation

- `release-please.yml` opens and maintains release PRs.
- `publish-extension.yml` packages the VSIX, validates metadata, stages checksums, SBOM, provenance, and attestations, then publishes to marketplaces when explicitly triggered by release flow.
- `release.yml` is a low-risk release-readiness workflow that validates release evidence without publishing.

Release Please's temporary repositories run with Git repository-local environment variables removed. The helper derives those names from `git rev-parse --local-env-vars`, so direct validation and Husky `pre-push` validation exercise the same isolated synthetic repository instead of inheriting the caller's `GIT_DIR`, `GIT_WORK_TREE`, or index/object paths.

## Release evidence

Each release should provide:

- VSIX artifact;
- `SHA256SUMS.txt`;
- SBOM;
- provenance JSON;
- GitHub artifact attestation where available;
- release summary and changelog entry.

## Manual release checklist

1. Confirm the release PR includes the intended changelog and version bump.
2. Confirm CI, CodeQL, Gitleaks, and package validation pass.
3. Confirm release evidence is generated and attached.
4. Confirm marketplace publish jobs use protected environments and minimum secrets.
5. Confirm post-release docs and version surfaces are updated.
