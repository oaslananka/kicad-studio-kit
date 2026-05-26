# Client Configuration

KiCad MCP Pro works with MCP clients that can start a local `stdio` server or connect to a
Streamable HTTP endpoint. The most portable setup is local `stdio` with `uvx`.

Replace `/absolute/path/to/your/kicad-project` with your KiCad project directory. You can
omit `KICAD_MCP_PROJECT_DIR` and call `kicad_set_project()` from the client instead, but
setting it once in the client config gives you a persistent default project.

## Recommended Local Server

Use this command in clients that ask for a command and arguments:

```text
command: uvx
args: ["kicad-mcp-pro"]
```

Recommended environment:

```text
KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project
KICAD_MCP_PROFILE=pcb_only
KICAD_MCP_OPERATING_MODE=readonly
```

Use `KICAD_MCP_PROFILE=full` if you want every tool category. Preferred focused profiles are
`minimal`, `pcb_only`, `schematic_only`, `manufacturing`, `high_speed`, `power`,
`simulation`, and `analysis`. Legacy aliases `pcb` and `schematic` still work for older
client configs. Profiles select a tool category set; `KICAD_MCP_OPERATING_MODE` is the
risk gate applied on top. The default mode is `readonly`. Use `write` only for schematic
or PCB source edits, `manufacturing` for release/export handoff tools, and `experimental`
for routing, tuning, and unstable helpers.

## VS Code And GitHub Copilot

VS Code uses `.vscode/mcp.json` for workspace-level configuration and a user profile MCP
configuration for global setup. GitHub Copilot in VS Code uses the same MCP server setup.

`.vscode/mcp.json`:

```json
{
  "servers": {
    "kicad": {
      "type": "stdio",
      "command": "uvx",
      "args": ["kicad-mcp-pro"],
      "env": {
        "KICAD_MCP_PROJECT_DIR": "/absolute/path/to/your/kicad-project",
        "KICAD_MCP_PROFILE": "pcb_only",
        "KICAD_MCP_OPERATING_MODE": "readonly"
      }
    }
  }
}
```

Use an absolute KiCad project path for `KICAD_MCP_PROJECT_DIR`. Some VS Code MCP setups do
not expand `${workspaceFolder}` and may fail at server startup.

## Codex CLI And Codex IDE Extension

Codex stores MCP servers in `~/.codex/config.toml` or a trusted project-scoped
`.codex/config.toml`.

CLI setup:

```bash
codex mcp add kicad \
  --env KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
  --env KICAD_MCP_PROFILE=pcb_only \
  --env KICAD_MCP_OPERATING_MODE=readonly \
  -- uvx kicad-mcp-pro
```

`~/.codex/config.toml`:

```toml
[mcp_servers.kicad]
command = "uvx"
args = ["kicad-mcp-pro"]
startup_timeout_sec = 20
tool_timeout_sec = 120

[mcp_servers.kicad.env]
KICAD_MCP_PROJECT_DIR = "/absolute/path/to/your/kicad-project"
KICAD_MCP_PROFILE = "pcb_only"
KICAD_MCP_OPERATING_MODE = "readonly"
```

## Claude Desktop

Add the server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kicad": {
      "command": "uvx",
      "args": ["kicad-mcp-pro"],
      "env": {
        "KICAD_MCP_PROJECT_DIR": "/absolute/path/to/your/kicad-project",
        "KICAD_MCP_PROFILE": "pcb_only",
        "KICAD_MCP_OPERATING_MODE": "readonly"
      }
    }
  }
}
```

## Claude Code

Use KiCad MCP Pro 1.0.0 or newer for Claude Code `stdio` setups. That release defers
heavy tool registration until after the MCP `initialize` handshake, avoiding startup races
on slower WSL or cold KiCad environments.

Project-scoped `.mcp.json`:

```json
{
  "mcpServers": {
    "kicad": {
      "command": "uvx",
      "args": ["kicad-mcp-pro"],
      "env": {
        "KICAD_MCP_PROJECT_DIR": "/absolute/path/to/your/kicad-project",
        "KICAD_MCP_PROFILE": "pcb_only",
        "KICAD_MCP_OPERATING_MODE": "readonly"
      }
    }
  }
}
```

CLI setup:

```bash
claude mcp add kicad \
  --scope project \
  --env KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
  --env KICAD_MCP_PROFILE=pcb_only \
  --env KICAD_MCP_OPERATING_MODE=readonly \
  -- uvx kicad-mcp-pro
```

## Cursor

Use `.cursor/mcp.json` for project configuration or `~/.cursor/mcp.json` for global
configuration:

```json
{
  "mcpServers": {
    "kicad": {
      "type": "stdio",
      "command": "uvx",
      "args": ["kicad-mcp-pro"],
      "env": {
        "KICAD_MCP_PROJECT_DIR": "/absolute/path/to/your/kicad-project",
        "KICAD_MCP_PROFILE": "pcb_only",
        "KICAD_MCP_OPERATING_MODE": "readonly"
      }
    }
  }
}
```

## Gemini CLI

Add the server to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "kicad": {
      "command": "uvx",
      "args": ["kicad-mcp-pro"],
      "env": {
        "KICAD_MCP_PROJECT_DIR": "/absolute/path/to/your/kicad-project",
        "KICAD_MCP_PROFILE": "pcb_only",
        "KICAD_MCP_OPERATING_MODE": "readonly"
      },
      "timeout": 120000
    }
  }
}
```

## Antigravity And Other MCP Clients

If your client accepts the common `mcpServers` JSON shape, use this as the starting point:

```json
{
  "mcpServers": {
    "kicad": {
      "type": "stdio",
      "command": "uvx",
      "args": ["kicad-mcp-pro"],
      "env": {
        "KICAD_MCP_PROJECT_DIR": "/absolute/path/to/your/kicad-project",
        "KICAD_MCP_PROFILE": "pcb_only",
        "KICAD_MCP_OPERATING_MODE": "readonly"
      }
    }
  }
}
```

Client-specific behavior can vary. If the client supports only HTTP servers, use the HTTP
setup below.

## Streamable HTTP Setup

Start KiCad MCP Pro as an HTTP server:

```bash
KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
KICAD_MCP_PROFILE=pcb_only \
KICAD_MCP_OPERATING_MODE=readonly \
kicad-mcp-pro --transport http --host 127.0.0.1 --port 3334
```

The default endpoint is:

```text
http://127.0.0.1:3334/mcp
```

VS Code HTTP example:

```json
{
  "servers": {
    "kicad": {
      "type": "http",
      "url": "http://127.0.0.1:3334/mcp"
    }
  }
}
```

Codex HTTP example:

```toml
[mcp_servers.kicad]
url = "http://127.0.0.1:3334/mcp"
tool_timeout_sec = 120
```

Gemini CLI HTTP example:

```json
{
  "mcpServers": {
    "kicad": {
      "httpUrl": "http://127.0.0.1:3334/mcp",
      "timeout": 120000
    }
  }
}
```

## References

- Agent onboarding and examples: ../../../docs/agents/client-configs.md
- VS Code MCP configuration: https://code.vscode.dev/docs/copilot/customization/mcp-servers
- Codex MCP configuration: https://developers.openai.com/learn/docs-mcp
- Claude Code MCP configuration: https://docs.anthropic.com/en/docs/claude-code/mcp
- Anthropic MCP overview: https://docs.anthropic.com/en/docs/mcp
- Cursor MCP configuration: https://docs.cursor.com/en/context/mcp
- Gemini CLI MCP setup notes: https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
