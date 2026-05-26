# ADR 0007: Agent Onboarding And MCP Config Pack

Status: Accepted

Date: 2026-05-26

## Context

KiCad Studio Kit is used by repository-level coding agents and by MCP-capable clients such
as VS Code/GitHub Copilot, Codex, Claude, Cursor, and Gemini CLI. Before this decision,
the repo had product docs and MCP client examples, but it did not have a single onboarding
layer that told agents where the product boundaries, validation commands, safety modes, and
client config examples live.

Current MCP client documentation checked on 2026-05-26 supports:

- VS Code workspace/user `mcp.json` with top-level `servers`.
- Codex shared MCP setup through the Codex CLI/IDE config.
- Claude Code project-scoped `.mcp.json`.
- Cursor `mcp.json` setup.
- Gemini CLI `settings.json` with top-level `mcpServers`.
- MCP stdio and Streamable HTTP transports.

## Decision

Ship repository-local agent onboarding and a checked-in MCP client config pack now:

- `AGENTS.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`
- `docs/agents/`
- `examples/mcp-clients/`

Default the examples to `KICAD_MCP_OPERATING_MODE=readonly` and
`KICAD_MCP_PROFILE=analysis`. Keep checked-in workspace config free of fixture paths and
machine-specific production paths.

Do not add Codex skills or a packaged plugin in this change. Skills should be added only
after a workflow is stable enough to encode as a reusable procedure. Plugin distribution
should be revisited only after repeated external reuse proves that repo-local docs and MCP
server configuration are insufficient.

## Consequences

- Agents can start from root instructions instead of discovering scattered docs.
- Client examples are parseable and copyable after replacing the project path placeholder.
- The root VS Code MCP config is a safe developer default, not a fixture shortcut.
- Codex is documented as both a VS Code extension provider enum and as an external MCP
  client, with a clear boundary between those meanings.
- CI must validate the agent docs and client examples so stale or unsafe defaults fail
  before merge.

## Future Revisit

Reconsider repo-scoped skills or plugin packaging only when at least one workflow has all
of the following:

- repeated use across multiple issues,
- stable commands and acceptance criteria,
- dedicated validation coverage,
- an owner for keeping the packaged instructions current.
