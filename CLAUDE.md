# Claude Repository Guide

Claude Code and Claude Desktop users should treat `AGENTS.md` as the canonical
repository instructions, then apply the Claude-specific notes below.

## Working In This Repo

- Keep changes scoped to one issue and one PR.
- Read the relevant source, tests, docs, and manifests before editing.
- Use `rg` for searches and the root validation commands documented in `AGENTS.md`.
- Do not modify release PR #16 unless explicitly assigned a release-bot maintenance task.
- Do not commit secrets or local machine paths.

## Claude MCP Setup

Use the checked-in examples under `examples/mcp-clients/`:

- `claude-code.mcp.example.json` for project-scoped Claude Code setup.
- `claude-desktop.config.example.json` for Claude Desktop.

Replace `/absolute/path/to/your/kicad-project` with the target KiCad project path before
copying a config into a real client location.

Recommended local server:

```bash
claude mcp add --transport stdio --scope project \
  --env KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
  --env KICAD_MCP_PROFILE=analysis \
  --env KICAD_MCP_OPERATING_MODE=readonly \
  kicad -- uvx kicad-mcp-pro
```

Use broader MCP operating modes only for tasks that explicitly require write,
manufacturing, or experimental tools.
