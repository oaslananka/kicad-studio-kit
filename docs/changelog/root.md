# Root Changelog

Source: `CHANGELOG.md`

All notable changes to the KiCad Studio Kit monorepo will be documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and released packages in this repository adhere to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The root changelog
records repository-wide release governance and monorepo changes; product
changelogs remain the release-owned sources for package-specific changes.

Comparison links will be added after the first public release tags are
published.

## Repository maturity notes

This repository tracks Professional OSS / Mature OSS hardening through `docs/repo-maturity-report.md`, `docs/openssf-evidence.md`, and `.bestpractices.json`. Gold/foundation-grade maturity remains gap-tracked only until branch protection, independent review, and multi-maintainer evidence are active.

## [Unreleased]

### Changed

- Normalized the root and product changelog sources to Keep a Changelog 1.1.0
  structure so release evidence and generated docs can be audited consistently.
- Replaced the legacy external secret-manager setup with repository-scoped
  GitHub Actions secrets and local environment documentation.

### Added

- Added a root Taskfile and secrets-free `.env.example` for consistent local
  validation.

### Fixed

- Updated the documented extension version and completed the README install,
  usage, contributing, and license sections.

## [1.0.0] - 2026-05-20

### Added

- Established the canonical KiCad Studio Kit monorepo baseline.
