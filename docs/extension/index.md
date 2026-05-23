# KiCad Studio Extension

KiCad Studio is the VS Code extension in `apps/vscode-extension`. It provides project discovery,
schematic and PCB viewers, KiCad CLI validation and export commands, component/library workflows,
MCP integration, quality gates, AI-assisted fix queues, and release-oriented manufacturing flows.

## Main User Paths

| Workflow                                                       | Documentation                         |
| -------------------------------------------------------------- | ------------------------------------- |
| Open and inspect KiCad projects                                | [Views](views.md)                     |
| Run command palette actions                                    | [Commands](commands.md)               |
| Configure CLI paths, viewers, exports, MCP, telemetry, and PCM | [Settings](settings.md)               |
| Resolve local setup and runtime issues                         | [Troubleshooting](troubleshooting.md) |
| Understand privacy and telemetry behavior                      | [Telemetry](../telemetry.md)          |
| Review accessibility target                                    | [Accessibility](../accessibility.md)  |

## Source Files

- Extension manifest: `apps/vscode-extension/package.json`
- Runtime entrypoint: `apps/vscode-extension/src/extension.ts`
- MCP adapter: `apps/vscode-extension/src/mcp/`
- Commands: `apps/vscode-extension/src/commands/`
- Webviews and providers: `apps/vscode-extension/src/providers/`

Generated command, setting, and view reference pages are refreshed with:

```bash
corepack pnpm run docs:generate
```
