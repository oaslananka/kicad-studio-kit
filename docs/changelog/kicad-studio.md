# KiCad Studio Changelog

Source: `apps/vscode-extension/CHANGELOG.md`

## [Unreleased]

- Clarify Codex support as an external MCP client workflow, remove it from the
  direct extension provider settings, and migrate legacy
  `kicadstudio.ai.provider=codex` selections to GitHub Copilot.
- Add explicit KiCanvas/CLI SVG fallback/metadata-only viewer engine state,
  toolbar engine badges, unsupported-control disabling, and regression coverage
  for fallback diagnostics.
- Restyle the KiCanvas viewer toolbar with VS Code theme tokens, compact
  spacing, and a single primary reload action for dark, light, and high-contrast
  themes.

## [1.0.0]

- Baseline KiCad Studio extension release from the canonical monorepo.
