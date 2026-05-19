# Settings Panel

KiCad Studio settings are contributed through the VS Code Settings UI under the `kicadstudio` namespace. The extension manifest is the source of truth for setting keys, defaults, enum values, and descriptions.

## Maintainer Notes

- Keep setting descriptions concise and user-facing because they render directly in VS Code.
- Update README and feature docs when a setting changes public behavior.
- Keep prompt-facing AI settings aligned with `docs/AI_PROVIDERS.md`.
- Keep MCP settings aligned with `docs/INTEGRATION.md` and the `.vscode/mcp.json` schema.
- Validate manifest edits with `pnpm run format:check`, `pnpm run typecheck`, and package metadata checks before release.
