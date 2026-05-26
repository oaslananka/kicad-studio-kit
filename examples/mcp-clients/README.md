# MCP Client Config Examples

These examples are the canonical copyable MCP client setup pack for KiCad Studio Kit.
They are safe defaults for local development and external coding-agent workflows.

Replace `/absolute/path/to/your/kicad-project` with the KiCad project directory you want
the client to inspect. Keep the path absolute unless the target client explicitly supports
workspace variables for MCP configuration.

## Defaults

All stdio examples use:

- command: `uvx`
- args: `["kicad-mcp-pro"]`
- profile: `pcb_only`
- operating mode: `readonly`

`KICAD_MCP_PROFILE` narrows the tool categories. `KICAD_MCP_OPERATING_MODE` is the risk
gate applied on top of that profile. Switch to `write`, `manufacturing`, or
`experimental` only when the task explicitly requires that surface.

## Example Files

| Client                         | File                                 | Install location                                 |
| ------------------------------ | ------------------------------------ | ------------------------------------------------ |
| VS Code and GitHub Copilot     | `vscode.mcp.example.json`            | `.vscode/mcp.json` or user profile MCP config    |
| Codex CLI / IDE extension      | `codex.config.example.toml`          | `~/.codex/config.toml` or trusted project config |
| Claude Code                    | `claude-code.mcp.example.json`       | `.mcp.json`                                      |
| Claude Desktop                 | `claude-desktop.config.example.json` | `claude_desktop_config.json`                     |
| Cursor                         | `cursor.mcp.example.json`            | `.cursor/mcp.json` or `~/.cursor/mcp.json`       |
| Gemini CLI                     | `gemini.settings.example.json`       | `~/.gemini/settings.json`                        |
| Generic stdio MCP client       | `generic-stdio.mcp.example.json`     | Client-specific MCP config                       |
| Generic Streamable HTTP client | `generic-http.mcp.example.json`      | Client-specific MCP config                       |

## Streamable HTTP

For HTTP clients, start the server separately:

```bash
KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
KICAD_MCP_PROFILE=pcb_only \
KICAD_MCP_OPERATING_MODE=readonly \
kicad-mcp-pro --transport http --host 127.0.0.1 --port 3334
```

Then point the client at:

```text
http://127.0.0.1:3334/mcp
```

Do not bind the HTTP server to `0.0.0.0` unless you have added an explicit network and
authentication design for that environment.
