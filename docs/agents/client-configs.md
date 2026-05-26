# Agent MCP Client Configurations

KiCad MCP Pro supports local stdio and Streamable HTTP MCP transports. The canonical
copyable examples live under `examples/mcp-clients/`.

Replace `/absolute/path/to/your/kicad-project` with the target KiCad project directory.
Use an absolute path unless the client-specific documentation says workspace variables are
expanded in MCP config files.

## Setup Matrix

| Client                     | Config file                                      | Transport       | Example                                                                       | Notes                                                                                |
| -------------------------- | ------------------------------------------------ | --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| VS Code and GitHub Copilot | `.vscode/mcp.json` or user profile MCP config    | stdio           | `.vscode/mcp.example.json` and `examples/mcp-clients/vscode.mcp.example.json` | VS Code uses top-level `servers`. Copilot Agent mode uses the same MCP server setup. |
| Codex CLI / IDE extension  | `~/.codex/config.toml` or trusted project config | stdio           | `examples/mcp-clients/codex.config.example.toml`                              | This is Codex as an external MCP client, not the VS Code extension provider enum.    |
| Claude Code                | `.mcp.json`                                      | stdio           | `examples/mcp-clients/claude-code.mcp.example.json`                           | Project-scoped config is shareable after replacing paths.                            |
| Claude Desktop             | `claude_desktop_config.json`                     | stdio           | `examples/mcp-clients/claude-desktop.config.example.json`                     | Keep user-local credentials out of this repo.                                        |
| Cursor                     | `.cursor/mcp.json` or `~/.cursor/mcp.json`       | stdio           | `examples/mcp-clients/cursor.mcp.example.json`                                | Cursor reads MCP config from `mcp.json` locations.                                   |
| Gemini CLI                 | `~/.gemini/settings.json`                        | stdio           | `examples/mcp-clients/gemini.settings.example.json`                           | The example leaves `trust` false so tools still require confirmation.                |
| Generic stdio client       | Client-specific                                  | stdio           | `examples/mcp-clients/generic-stdio.mcp.example.json`                         | Use this for clients that accept the common `mcpServers` shape.                      |
| Generic HTTP client        | Client-specific                                  | Streamable HTTP | `examples/mcp-clients/generic-http.mcp.example.json`                          | Start the local HTTP server separately on `127.0.0.1`.                               |

## Recommended Environment

```text
KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project
KICAD_MCP_PROFILE=pcb_only
KICAD_MCP_OPERATING_MODE=readonly
```

`KICAD_MCP_PROFILE` narrows the tool categories. `KICAD_MCP_OPERATING_MODE` is the risk
gate applied after the profile. Keep onboarding configs in `readonly`; switch modes only
when the workflow explicitly needs a broader tool surface.

## HTTP Startup

For HTTP clients, start the server outside the client:

```bash
KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
KICAD_MCP_PROFILE=pcb_only \
KICAD_MCP_OPERATING_MODE=readonly \
kicad-mcp-pro --transport http --host 127.0.0.1 --port 3334
```

Then configure the client URL as:

```text
http://127.0.0.1:3334/mcp
```

Do not bind local MCP HTTP to `0.0.0.0` as an onboarding default. If a remote deployment is
needed, document the network boundary, authentication model, and operating mode in the PR.

## Source References

The config shapes were checked against the current client documentation on 2026-05-26:

- VS Code MCP configuration reference: <https://code.vscode.dev/docs/copilot/customization/mcp-servers>
- OpenAI Codex configuration reference: <https://developers.openai.com/codex/config-reference>
- Claude Code MCP configuration: <https://docs.anthropic.com/en/docs/claude-code/mcp>
- Cursor MCP documentation: <https://docs.cursor.com/context/mcp>
- Gemini CLI MCP server documentation: <https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md>
- MCP transport specification: <https://modelcontextprotocol.io/specification/2025-06-18/basic/transports>
