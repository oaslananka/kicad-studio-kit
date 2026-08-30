# Release Process

## Release model

KiCad Studio Kit releases the VS Code extension from this repository. The MCP server is released from its own repository.

## Release automation

- `release-please.yml` keeps the canonical generated PR as Release Please's draft generator, builds the complete release tree, and mirrors it to `release-please/branches/main/components/vscode-extension`. The mergeable shadow PR contains only GitHub-signed, DCO-signed-off release commits; later generator updates first use GitHub's normal verified `update-branch` merge to make current `main` an ancestor, then append the signed release-tree delta without rewriting either live ref.
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
3. Confirm the canonical unsigned Release Please generator PR is draft and the parseable signed shadow PR matches its release tree, then squash-merge the signed shadow PR through GitHub so the commit entering `main` is GitHub-verified.
4. Confirm release evidence is generated and attached.
5. Confirm marketplace publish jobs use protected environments and minimum secrets.
6. Confirm post-release docs and version surfaces are updated.
