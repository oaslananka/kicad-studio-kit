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
Claude Code project scope writes shared server configuration to the project `.mcp.json`;
review that file before trusting servers from another branch or contributor.

Recommended local server on Linux/macOS:

```bash
claude mcp add --transport stdio --scope project \
  --env KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
  --env KICAD_MCP_PROFILE=pcb_only \
  --env KICAD_MCP_OPERATING_MODE=readonly \
  kicad -- uvx kicad-mcp-pro
```

Recommended local server on Windows PowerShell:

```powershell
claude mcp add --scope project --transport stdio `
  --env KICAD_MCP_PROJECT_DIR=C:\absolute\path\to\your\kicad-project `
  --env KICAD_MCP_PROFILE=pcb_only `
  --env KICAD_MCP_OPERATING_MODE=readonly `
  kicad -- uvx kicad-mcp-pro
```

Use broader MCP operating modes only for tasks that explicitly require write,
manufacturing, or experimental tools.
