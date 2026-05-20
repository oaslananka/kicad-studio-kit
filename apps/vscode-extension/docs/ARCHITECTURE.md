# KiCad Studio Architecture

## Overview

KiCad Studio is a VS Code extension that combines three layers:

1. KiCad-aware document parsing and CLI orchestration.
2. Webview-based viewers and side panels.
3. Optional AI and MCP-assisted workflows.

The extension is activated from KiCad project, schematic, PCB, jobset, or DRC rule files and composes its runtime in `src/extension.ts`.

## Core Runtime

- `src/extension.ts` wires activation, commands, providers, diagnostics, context keys, and status bars.
- `src/language/sExpressionParser.ts` is the shared parser used by diagnostics, BOM parsing, DRC rule parsing, and metadata extraction.
- `src/cli/` contains `kicad-cli` detection, execution, exports, checks, and import helpers.
- `src/statusbar/kicadStatusBar.ts` summarizes CLI, DRC/ERC, AI, and MCP state.

## Viewer Layer

- `BaseKiCanvasEditorProvider` handles file loading, caching, large-file behavior, viewer state restore, and webview message plumbing.
- `SchematicEditorProvider` and `PcbEditorProvider` specialize the shared provider.
- `viewerHtml.ts` renders the common KiCanvas host shell, theme sync, metadata sidebars, export buttons, and lasso/selection events.
- PCB metadata extraction currently feeds layer visibility controls and tuning profile summaries.

## Project And Sidebar Providers

- `KiCadProjectTreeProvider` discovers project assets.
- `BomViewProvider` and `NetlistViewProvider` present secondary data views beside the main editors.
- `VariantProvider` reads/writes KiCad project variant metadata and exposes active variant switching.
- `DrcRulesProvider` parses `.kicad_dru` content into a tree view for fast rule navigation.
- `FixQueueProvider` surfaces MCP-supplied suggested fixes.

## AI Layer

- `AIProviderRegistry` resolves the configured provider and model selection.
- Claude and OpenAI providers call their remote APIs from the extension host only.
- Copilot and Gemini providers use the VS Code Language Model API when available.
- `KiCadChatPanel` is the multi-turn chat UI and can render MCP tool suggestions embedded in assistant replies.
- Prompt construction in `src/ai/prompts.ts` is KiCad 10-aware and injects active variant / MCP context when available.
- `src/lm/languageModelTools.ts` registers agent-callable KiCad tools for supported VS Code hosts.
- `src/lm/languageModelChatProvider.ts` exposes a Claude-backed `kicadstudio` chat-model vendor when the host supports chat-provider registration.

## MCP Layer

- `McpDetector` locates `kicad-mcp-pro` and can generate `.vscode/mcp.json`.
- `McpClient` handles HTTP JSON-RPC calls, tool previews, tool execution, and fix queue reads.
- `ContextBridge` debounces and pushes studio context to MCP.
- `DesignIntentPanel` is a user-friendly wrapper around design-intent MCP tools.
- `src/lm/mcpServerDefinitionProvider.ts` advertises the detected local MCP server directly to the editor when supported.

## Data Flow

### File Open

1. VS Code opens a KiCad document.
2. The extension parses it and updates diagnostics/context state.
3. The relevant custom editor loads the file into a CSP-locked webview.
4. Viewer metadata is extracted and passed into sidebar sections.

### DRC/ERC

1. A check command runs through `KiCadCliRunner`.
2. JSON output is normalized into `vscode.Diagnostic[]`.
3. The Problems panel and status bar update.
4. Latest DRC context can be pushed into AI and MCP flows.

### AI + MCP

1. Active editor context is collected through `getActiveAiContext()`.
2. KiCad 10 and active-variant details are merged into the system prompt.
3. If MCP is connected, the assistant may emit `mcp` fenced JSON blocks.
4. The chat UI can preview and optionally apply those tool calls.

## CI/CD

- `oaslananka/kicad-studio-kit` owns the automated CI/CD workflows.
- GitHub Actions run from the canonical repository only.
