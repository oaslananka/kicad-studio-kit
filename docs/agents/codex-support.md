# Codex Support

KiCad Studio Kit supports Codex through the external MCP client path.

## Extension Provider Status

`kicadstudio.ai.provider=codex` is a legacy setting value, not a current direct KiCad
Studio extension provider. KiCad Studio migrates that legacy value to `copilot` because the
old implementation used the VS Code Language Model API and Copilot-compatible models.

Related implementation and docs:

- `apps/vscode-extension/src/ai/aiProvider.ts`
- `apps/vscode-extension/src/settings/settingsMigrations.ts`
- `apps/vscode-extension/docs/AI_PROVIDERS.md`
- [`docs/extension/settings.md`](../extension/settings.md)

## External Codex MCP Client

OpenAI Codex CLI and Codex IDE extension can connect to `kicad-mcp-pro` as MCP clients.
Use `examples/mcp-clients/codex.config.example.toml` as the `~/.codex/config.toml`
starting point, or use the CLI form below:

```bash
codex mcp add kicad \
  --env KICAD_MCP_PROJECT_DIR=/absolute/path/to/your/kicad-project \
  --env KICAD_MCP_PROFILE=pcb_only \
  --env KICAD_MCP_OPERATING_MODE=readonly \
  -- uvx kicad-mcp-pro
```

This external-client path gives Codex access to KiCad MCP tools. It is separate from the
VS Code extension's direct AI provider setting.

## Rule Of Thumb

- Use `kicadstudio.ai.provider=copilot` when you want KiCad Studio's chat UI to route
  through the VS Code Language Model API.
- Use Codex MCP config when Codex is the coding agent or IDE agent connecting to
  `kicad-mcp-pro`.
- Do not describe the extension provider setting as the Codex CLI integration.
