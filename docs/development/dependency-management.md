# Dependency Management

## Package manager

This repository uses pnpm. Do not introduce npm, yarn, or another package manager for Node workspace dependency management.

## Update automation

- Renovate manages dependency update PRs and dependency dashboard workflows.
- GitHub-native dependency alerts and update configuration are retained for GitHub Actions security updates and native alerts.
- Major updates require dashboard approval and manual review.
- Runtime dependencies are reviewed separately from build/test dependencies.

## Lockfile policy

Use frozen lockfile installs in CI and release workflows. Commit lockfile changes with dependency updates.

## Security policy

Security updates should be prioritized by exploitability, affected runtime surface, and availability of safe patched versions. Do not auto-merge high-risk runtime dependency updates without review.

## Evidence

Document dependency update rationale in PRs, especially for major updates, abandoned package exceptions, protocol-related dependencies, and release tooling.
