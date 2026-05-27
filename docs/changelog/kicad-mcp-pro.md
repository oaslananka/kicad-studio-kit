# kicad-mcp-pro Changelog

Source: `packages/mcp-server/CHANGELOG.md`

All notable changes to the `kicad-mcp-pro` Python server will be documented in
this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Comparison links will be added after the first public component tags are
published.

## [Unreleased]

### Added

- Added `kicad-mcp-pro doctor`, JSON diagnostics, and redacted support bundles for
  setup troubleshooting.
- Added real KiCad CLI contract canaries with shared fixtures, Windows primary
  KiCad 10.0.3 smoke coverage, scheduled 9.x/10.x lanes, and structured
  unsupported-feature artifacts.

### Deprecated

- Marked KiCad 9.x as a deprecated best-effort compatibility line in MCP
  discovery metadata while retaining scheduled non-blocking canary coverage.

## [1.0.0] - 2026-05-20

### Added

- Released the baseline KiCad MCP Pro server from the canonical monorepo.
