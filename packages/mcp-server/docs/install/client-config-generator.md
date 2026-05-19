# Client Config Generator

KiCad MCP Pro can print minimal MCP client configuration snippets from the CLI:

```bash
kicad-mcp-pro mcp-config generate --client claude
kicad-mcp-pro mcp-config generate --client cursor
kicad-mcp-pro mcp-config generate --client vscode
kicad-mcp-pro mcp-config generate --client codex
```

The generated snippets use stdio and `uvx kicad-mcp-pro`. Add environment
variables such as `KICAD_MCP_PROJECT_DIR` after generation when a client should
open a specific KiCad project by default.

Related inspection commands:

```bash
kicad-mcp-pro tools list --json
kicad-mcp-pro capabilities --json
kicad-mcp-pro doctor --json --strict
```

Strict doctor exit codes are stable for launcher integration:

| Exit code | Meaning |
|---|---|
| 0 | OK |
| 1 | Degraded but usable |
| 2 | Configuration or runtime error |
| 3 | Missing external dependency |
