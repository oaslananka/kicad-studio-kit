# Agent Onboarding

This section centralizes the instructions and client configuration surfaces used by
coding agents and MCP-capable clients that work with KiCad Studio Kit.

## Start Here

- Repository agent rules: `AGENTS.md`
- Claude-specific guide: `CLAUDE.md`
- GitHub Copilot instructions: `.github/copilot-instructions.md`
- MCP client setup matrix: [Client Configurations](client-configs.md)
- Codex support model: [Codex Support](codex-support.md)

## Default Safety Model

Use `readonly` MCP operating mode and a focused profile such as `pcb_only` for onboarding,
triage, review, and code-agent workflows. Broader tool surfaces are opt-in and should be
documented in the PR when used.
