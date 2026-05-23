# Extension Settings

Machine-maintained from the VS Code extension configuration schema.
Refresh with `corepack pnpm run docs:generate`.

Total settings: 45.

| Setting | Type | Default | Allowed values | Description |
| --- | --- | --- | --- | --- |
| `kicadstudio.kicadCliPath` | string | `` |  | Path to kicad-cli executable or a Flatpak command (e.g. 'flatpak run --command=kicad-cli org.kicad.KiCad'). Leave empty for auto-detection. |
| `kicadstudio.kicadPath` | string | `` |  | Path to KiCad installation directory (used to open files in KiCad). |
| `kicadstudio.defaultOutputDir` | string | `fab` |  | Default output directory for exports (relative to project root). |
| `kicadstudio.gerber.precision` | number | `6` | `5`, `6` | Gerber file precision (number of digits). |
| `kicadstudio.gerber.useProtelExtension` | boolean | `false` |  | Use Protel file extensions for Gerber files. |
| `kicadstudio.ipc2581.version` | string | `C` | `B`, `C` | IPC-2581 standard version. |
| `kicadstudio.ipc2581.units` | string | `mm` | `mm`, `in` | Units for IPC-2581 export. |
| `kicadstudio.bom.groupIdentical` | boolean | `true` |  | Group identical components in BOM. |
| `kicadstudio.bom.fields` | array | `["Reference","Value","Footprint","Quantity","MPN","Manufacturer","Description"]` |  | BOM fields to include and their order. |
| `kicadstudio.cli.defineVars` | object | `{}` |  | Optional KiCad CLI --define-var values that are passed to compatible kicad-cli commands. |
| `kicadstudio.viewer.theme` | string | `dark` | `dark`, `light`, `kicad` | Color theme for schematic and PCB viewers. |
| `kicadstudio.viewer.autoRefresh` | boolean | `true` |  | Automatically refresh viewer when file is saved. |
| `kicadstudio.viewer.largeFileThresholdBytes` | number | `10485760` |  | Maximum file size for fully interactive embedded viewing before KiCad Studio falls back to metadata-only mode. |
| `kicadstudio.viewer.syncThemeWithVscode` | boolean | `true` |  | Automatically sync viewer colors with the active VS Code theme. |
| `kicadstudio.viewer.enableLayerPanel` | boolean | `true` |  | Show layer visibility controls when PCB metadata is available. |
| `kicadstudio.viewer.enableSnapshotExport` | boolean | `true` |  | Enable PNG and SVG export actions inside the embedded viewer. |
| `kicadstudio.componentSearch.enableLCSC` | boolean | `true` |  | Enable LCSC component search. |
| `kicadstudio.pcm.repositoryUrls` | array | `["https://repository.kicad.org/repository.json"]` |  | PCM repository JSON feed URLs. The default points at KiCad's official add-on repository; add community repository.json feeds here. |
| `kicadstudio.pcm.configDir` | string | `` |  | Optional KiCad user configuration directory for PCM metadata such as installed_packages.json. Leave empty for platform defaults. |
| `kicadstudio.pcm.thirdPartyDir` | string | `` |  | Optional KiCad third-party content directory used by PCM installs. Leave empty for KiCad environment variables or the KiCad Studio fallback. |
| `kicadstudio.ai.provider` | string | `none` | `none`, `claude`, `openai`, `openrouter`, `copilot`, `gemini`, `local`, `codex` | AI provider for circuit analysis and error explanation. |
| `kicadstudio.ai.model` | string | `` |  | Optional AI model override. Leave empty to use the provider default when the provider has one. |
| `kicadstudio.ai.localEndpoint` | string | `` |  | OpenAI-compatible local chat endpoint base URL. KiCad Studio enables the local provider only after this endpoint is configured. |
| `kicadstudio.ai.openaiApiMode` | string | `responses` | `responses`, `chat-completions` | OpenAI API mode. Responses is the default for new work; Chat Completions is retained for compatibility. |
| `kicadstudio.ai.geminiApiMode` | string | `rest` | `rest` | Gemini API mode (REST only; Vertex AI not yet supported). |
| `kicadstudio.ai.maxTokens` | number | `4096` |  | Maximum tokens for AI responses. Higher values allow more detailed analysis. |
| `kicadstudio.ai.streamingEnabled` | boolean | `true` |  | Stream AI responses in the chat panel as they arrive. |
| `kicadstudio.ai.timeout` | number | `120` |  | AI request timeout in seconds. |
| `kicadstudio.ai.language` | string | `en` | `en`, `tr`, `de`, `zh-CN`, `ja`, `fr`, `es`, `ko`, `pt-BR` | Language for AI-generated answers. Extension UI language follows VS Code locale packs. |
| `kicadstudio.ai.allowTools` | boolean | `true` |  | Allow KiCad Studio to register language-model tools when the host VS Code build supports them. |
| `kicadstudio.logLevel` | string | `info` | `debug`, `info`, `warn`, `error` | KiCad Studio log verbosity |
| `kicadstudio.drc.autoRunOnSave` | boolean | `false` |  | Automatically run DRC when PCB file is saved. |
| `kicadstudio.erc.autoRunOnSave` | boolean | `false` |  | Automatically run ERC when schematic file is saved. |
| `kicadstudio.mcp.autoDetect` | boolean | `true` |  | Automatically detect kicad-mcp-pro and offer to create .vscode/mcp.json. |
| `kicadstudio.mcp.endpoint` | string | `http://127.0.0.1:27185` |  | Loopback kicad-mcp-pro HTTP endpoint when the server is running in HTTP mode. |
| `kicadstudio.mcp.allowRemoteEndpoint` | boolean | `false` |  | Allow KiCad Studio to connect to a non-loopback MCP HTTP endpoint. Keep disabled unless you intentionally trust that remote server. |
| `kicadstudio.mcp.allowLegacySse` | boolean | `false` |  | Allow a best-effort fallback to the legacy /sse MCP transport when Streamable HTTP is unavailable. |
| `kicadstudio.mcp.timeout` | number | `15` |  | MCP HTTP request timeout in seconds. |
| `kicadstudio.mcp.pushContext` | boolean | `true` |  | Push active file, DRC summary, and lasso selection context to kicad-mcp-pro. |
| `kicadstudio.mcp.profile` | string | `full` | `full`, `minimal`, `schematic_only`, `pcb_only`, `manufacturing`, `high_speed`, `power`, `simulation`, `analysis`, `agent_full` | Preferred kicad-mcp-pro profile when no workspace .vscode/mcp.json overrides it. |
| `kicadstudio.mcp.logSize` | number | `200` |  | Number of recent MCP request/response log entries retained in memory. |
| `kicadstudio.exportPresets` | array | `[]` |  | Saved export presets managed by the extension. |
| `kicadstudio.telemetry.enabled` | boolean | `false` |  | Enable opt-in KiCad Studio usage and error telemetry. Disabled by default and capped by VS Code's telemetry.telemetryLevel setting. |
| `kicadstudio.telemetry.endpoint` | string | `` |  | HTTP endpoint for a self-hosted Sentry relay, OpenTelemetry collector, or compatible telemetry intake. Empty disables network export. |
| `kicadstudio.telemetry.bufferLimit` | number | `100` |  | Maximum number of redacted telemetry events retained in the offline retry buffer. |
