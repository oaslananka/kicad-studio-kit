# KiCad Studio Changelog

Source: `apps/vscode-extension/CHANGELOG.md`

All notable changes to the KiCad Studio VS Code extension will be documented in
this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this extension adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Comparison links will be added after the first public component tags are
published.

## [Unreleased]

### Added

- Surfaced KiCad 8.x, 9.x, and 10.0.x compatibility state in the status
  bar/menu with feature-level capability probe results.
- Added explicit KiCanvas/CLI SVG fallback/metadata-only viewer engine state,
  toolbar engine badges, unsupported-control disabling, and regression coverage
  for fallback diagnostics.

### Changed

- Clarified Codex support as an external MCP client workflow, removed it from the
  direct extension provider settings, and migrated legacy
  `kicadstudio.ai.provider=codex` selections to GitHub Copilot.
- Restyled the KiCanvas viewer toolbar with VS Code theme tokens, compact
  spacing, and a single primary reload action for dark, light, and high-contrast
  themes.

### Deprecated

- Marked KiCad 9.x as a deprecated best-effort compatibility line in status
  surfaces now that upstream active maintenance has ended.

## [1.0.0] - 2026-05-20

### Added

- Released the baseline KiCad Studio extension from the canonical monorepo.
