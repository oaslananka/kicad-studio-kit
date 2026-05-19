# Repository Autonomy

This repository follows an organization-first automation model.

## Key Principles

- **Organization source of truth:** `oaslananka/kicad-studio` is the canonical repository for source, CI/CD, security scans, releases, publishing, and automation.
- **Personal canonical GitHub repository:** `oaslananka/kicad-studio` is a one-way mirror for public showcase purposes only.
- **GitHub-secrets minimum:** Release, mirror, and Codecov secrets live in GitHub Actions secrets only when required by their workflows. Tokens are never stored in the repository.
- **Local-first quality gates:** Every check that runs in CI should have a local npm script.
- **Conventional Commits:** `commitlint` keeps release notes and dependency PRs readable.
- **Human-gated releases:** Release notes may be drafted automatically, but publishing remains approval-gated.

## Workflow

1. Human and automation branches target `oaslananka/kicad-studio`.
2. CI, security scans, CodeQL, Scorecard, package checks, and release automation run in the organization repository.
3. Release and publish workflows require the `release` environment and explicit human approval.
4. `Mirror Personal` mirrors only `main` and `v*.*.*` tags from the organization repository to the canonical GitHub repository.
5. The canonical GitHub repository does not run CI/CD, publishing, or release automation.
