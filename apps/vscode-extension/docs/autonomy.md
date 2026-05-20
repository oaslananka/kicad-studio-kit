# Repository Autonomy

This repository follows a single-canonical GitHub automation model.

## Key Principles

- **Single source of truth:** `oaslananka/kicad-studio-kit` is the canonical repository for source, CI, security scans, release drafting, publishing, and dependency maintenance.
- **GitHub-secrets minimum:** Marketplace secrets live in GitHub Actions environments only when required by their workflows. Tokens are never stored in the repository.
- **Local-first quality gates:** Every blocking CI check should have a local command.
- **Conventional Commits:** `commitlint` keeps release notes and dependency pull requests readable.
- **Human-gated releases:** Release notes may be drafted automatically, but publishing remains approval-gated.

## Workflow

1. Human and automation branches target `oaslananka/kicad-studio-kit`.
2. CI, security scans, CodeQL, Scorecard, package checks, and release automation run in this repository.
3. Release and publish workflows require the configured GitHub environments.
4. Dependency updates are handled by Renovate and validated by the normal CI matrix.
