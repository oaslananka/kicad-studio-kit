# CI/CD Routing

KiCad Studio uses the `oaslananka` organization repository as the canonical source and automation authority.

## Repository Roles

- Canonical organization repository: `https://github.com/oaslananka/kicad-studio-kit`
- Personal canonical GitHub repository: `https://github.com/oaslananka/kicad-studio-kit`
- GitLab: manual fallback only

## Trigger Policy

- GitHub Actions in `oaslananka/kicad-studio` run CI for pushes, pull requests, and merge queue events.
- Release and publish workflows run only from the organization repository. Release versions are derived by release-please from Conventional Commit history and the manifest.
- The personal GitHub repository is showcase-only and should have Actions disabled.
  s- GitHub Actions is manual-only and starts only from the GitLab web UI.

## Draft-First Pull Requests

Draft PRs run cheap gates only:

- review-thread gate
- format/lint quick checks
- workflow lint
- package metadata checks
- secret scan

Heavy full-matrix CI and CodeQL wait until the PR is marked ready for review.
Push-to-main and merge queue checks are never skipped.

## Path-Aware Cost Model

- Docs-only changes should rely on docs checks, lint-fast, and review-thread
  state before requesting full CI.
- Workflow-only changes must run workflow lint and secret scanning before
  heavier package or test work.
- Extension source, MCP integration, package metadata, `.vscodeignore`, and
  assets can affect runtime or marketplace packaging and require full CI before
  merge.
- Release and publish workflow changes require human review even when syntax
  checks pass.

## Required GitHub Organization Secrets

Configure these in the `oaslananka/kicad-studio` repository or as selected organization secrets:

- `VSCE_PAT`: Visual Studio Marketplace publish token.
- `OVSX_PAT`: Open VSX publish token.
- `PERSONAL_REPO_PUSH_TOKEN`: token for one-way source mirroring to the personal showcase repository.
- `CODECOV_TOKEN`: coverage upload token only.
- `DOPPLER_GITHUB_SERVICE_TOKEN`: optional only if maintainers later replace the default `github.token` GitHub Release flow with a service-token fallback.
- `SENTRY_AUTH_TOKEN`: optional, only when source maps are uploaded.

Do not print tokens or store API keys in the repository.

## Suggested Local Remotes

Use separate remotes so the organization repository remains the default push target:

```bash
git remote set-url origin git@github.com:oaslananka/kicad-studio.git
git remote add lab git@github.com:oaslananka/kicad-studio.git
```

Typical maintainer push:

```bash
git push lab HEAD:<branch>
```

The `Mirror Personal` workflow handles canonical GitHub repositorying after changes land in the organization repository.
