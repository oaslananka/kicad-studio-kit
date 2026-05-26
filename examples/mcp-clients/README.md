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

## CLI Setup Commands

Use these commands when the client can register MCP servers directly from a CLI. Otherwise,
copy the matching example file into the install location below.

### Linux/macOS

```bash
codex mcp add kicad \
  --env KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
  --env KICAD_MCP_PROFILE=pcb_only \
  --env KICAD_MCP_OPERATING_MODE=readonly \
  -- uvx kicad-mcp-pro

claude mcp add --transport stdio --scope project \
  --env KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
  --env KICAD_MCP_PROFILE=pcb_only \
  --env KICAD_MCP_OPERATING_MODE=readonly \
  kicad -- uvx kicad-mcp-pro

gemini mcp add --scope project --transport stdio \
  -e KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
  -e KICAD_MCP_PROFILE=pcb_only \
  -e KICAD_MCP_OPERATING_MODE=readonly \
  kicad uvx kicad-mcp-pro
```

### Windows PowerShell

```powershell
codex mcp add kicad `
  --env 'KICAD_MCP_PROJECT_DIR=C:\absolute\path\to\your\kicad-project' `
  --env 'KICAD_MCP_PROFILE=pcb_only' `
  --env 'KICAD_MCP_OPERATING_MODE=readonly' `
  -- uvx kicad-mcp-pro

claude mcp add --transport stdio --scope project `
  --env 'KICAD_MCP_PROJECT_DIR=C:\absolute\path\to\your\kicad-project' `
  --env 'KICAD_MCP_PROFILE=pcb_only' `
  --env 'KICAD_MCP_OPERATING_MODE=readonly' `
  kicad -- uvx kicad-mcp-pro

gemini mcp add --scope project --transport stdio `
  -e 'KICAD_MCP_PROJECT_DIR=C:\absolute\path\to\your\kicad-project' `
  -e 'KICAD_MCP_PROFILE=pcb_only' `
  -e 'KICAD_MCP_OPERATING_MODE=readonly' `
  kicad uvx kicad-mcp-pro
```

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

## Destination Paths

Copy the example into the client-owned config file for your real project. Keep these
`.example.*` files as inert templates in this repository.
The Windows paths use `%USERPROFILE%` and `%APPDATA%` conventions used on Windows 11 and
current supported Windows releases.

| Client                     | Linux/macOS destination                                                                                          | Windows destination                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| VS Code and GitHub Copilot | `<project>/.vscode/mcp.json`, or the user-profile config opened by `MCP: Open User Configuration`                | `<project>\.vscode\mcp.json`, or the user-profile config opened from VS Code |
| Codex CLI / IDE extension  | `~/.codex/config.toml`, or a trusted `<project>/.codex/config.toml`                                              | `%USERPROFILE%\.codex\config.toml`, or `<project>\.codex\config.toml`        |
| Claude Code                | `<project>/.mcp.json`, or use `claude mcp add --scope project`                                                   | `<project>\.mcp.json`, or use `claude mcp add --scope project`               |
| Claude Desktop             | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Linux users should use Claude Code MCP | `%APPDATA%\Claude\claude_desktop_config.json`                                |
| Cursor                     | `<project>/.cursor/mcp.json` or `~/.cursor/mcp.json`                                                             | `<project>\.cursor\mcp.json` or `%USERPROFILE%\.cursor\mcp.json`             |
| Gemini CLI                 | `~/.gemini/settings.json` or `<project>/.gemini/settings.json`                                                   | `%USERPROFILE%\.gemini\settings.json` or `<project>\.gemini\settings.json`   |
| Generic stdio MCP client   | The client's MCP config file                                                                                     | The client's MCP config file                                                 |
| Generic HTTP MCP client    | The client's remote/HTTP MCP config file                                                                         | The client's remote/HTTP MCP config file                                     |

## Streamable HTTP

For HTTP clients, start the server separately:

### Linux/macOS

```bash
KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
KICAD_MCP_PROFILE=pcb_only \
KICAD_MCP_OPERATING_MODE=readonly \
uvx kicad-mcp-pro --transport http --host 127.0.0.1 --port 3334
```

### Windows PowerShell

```powershell
$Env:KICAD_MCP_PROJECT_DIR = 'C:\absolute\path\to\your\kicad-project'
$Env:KICAD_MCP_PROFILE = 'pcb_only'
$Env:KICAD_MCP_OPERATING_MODE = 'readonly'
uvx kicad-mcp-pro --transport http --host 127.0.0.1 --port 3334
```

Then point the client at:

```text
http://127.0.0.1:3334/mcp
```

Do not bind the HTTP server to `0.0.0.0` unless you have added an explicit network and
authentication design for that environment.
Set `KICAD_MCP_AUTH_TOKEN` only when HTTP binds outside loopback or crosses a tunnel or
remote network boundary. In that case, configure the client to send the same value as a
bearer token and keep the token in local environment or secret storage, never in a checked-in
example.
