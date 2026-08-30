# Release Process

## Release model

KiCad Studio Kit releases the VS Code extension from this repository. The MCP server is released from its own repository.

## Release automation

- `release-please.yml` opens the canonical generated PR with the dedicated `RELEASE_PLEASE_TOKEN`, builds the complete release tree, and promotes it to a draft `release-please/branches/main/components/vscode-extension` shadow PR containing one GitHub-signed, DCO-signed-off commit. The unsigned canonical PR is closed only after the shadow PR is ready; no live ref is force-rewritten.
- `publish-extension.yml` packages the VSIX, validates metadata, stages checksums, SBOM, provenance, and attestations, then publishes to marketplaces from the authenticated release event.
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
3. Confirm the canonical unsigned Release Please PR has been superseded by the parseable signed shadow PR, then squash-merge the signed shadow PR through GitHub so the commit entering `main` is GitHub-verified.
4. Confirm release evidence is generated and attached.
5. Confirm marketplace publish jobs use protected environments and minimum secrets.
6. Confirm post-release docs and version surfaces are updated.
