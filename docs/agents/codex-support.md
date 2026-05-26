# Codex Support

KiCad Studio Kit has two distinct Codex-related surfaces.

## VS Code Extension Provider

Inside the VS Code extension, `kicadstudio.ai.provider=codex` is implemented as a direct
extension provider. It routes through the VS Code Language Model API using the local VS Code
host and available language-model extensions. It does not read Codex CLI config, does not
start the Codex CLI, and does not require a separate Codex API key in KiCad Studio.

Related implementation and docs:

- `apps/vscode-extension/src/ai/aiProvider.ts`
- `apps/vscode-extension/src/ai/copilotProvider.ts`
- `apps/vscode-extension/docs/AI_PROVIDERS.md`
- [`docs/extension/settings.md`](../extension/settings.md)

## External Codex MCP Client

OpenAI Codex CLI and Codex IDE extension can connect to `kicad-mcp-pro` as MCP clients.
Use `examples/mcp-clients/codex.config.example.toml` as the `~/.codex/config.toml`
starting point, or use the CLI form below:

```bash
codex mcp add kicad \
  --env KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
  --env KICAD_MCP_PROFILE=analysis \
  --env KICAD_MCP_OPERATING_MODE=readonly \
  -- uvx kicad-mcp-pro
```

This external-client path gives Codex access to KiCad MCP tools. It is separate from the
VS Code extension's `codex` provider enum.

## Rule Of Thumb

- Use `kicadstudio.ai.provider=codex` when working inside KiCad Studio's chat UI in VS
  Code.
- Use Codex MCP config when Codex is the coding agent or IDE agent connecting to
  `kicad-mcp-pro`.
- Do not describe the extension provider enum as the Codex CLI integration.
