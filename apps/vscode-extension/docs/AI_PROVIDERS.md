# AI Providers

## Supported Providers

KiCad Studio supports four AI provider paths:

- Claude
- OpenAI
- GitHub Copilot
- Gemini

For compatible VS Code builds, KiCad Studio can also contribute:

- Language Model Tools for agent mode
- a Claude-backed Language Model Chat Provider under the `kicadstudio` vendor

## Claude

- Set `kicadstudio.ai.provider` to `claude`.
- Store the API key with `KiCad: Set AI API Key`.
- The default model comes from the extension's shared provider constants and can be overridden with `kicadstudio.ai.model`.

## OpenAI

- Set `kicadstudio.ai.provider` to `openai`.
- Store the API key with `KiCad: Set AI API Key`.
- The default model comes from the extension's shared provider constants and can be overridden with `kicadstudio.ai.model`.
- API mode can be `responses` or `chat-completions`.

## GitHub Copilot

- Set `kicadstudio.ai.provider` to `copilot`.
- Requires a VS Code environment where the Language Model API exposes Copilot models.
- No separate API key is stored by KiCad Studio.

## Gemini

- Set `kicadstudio.ai.provider` to `gemini`.
- Requires Gemini availability through the VS Code Language Model API in the user environment.
- No separate API key is stored by KiCad Studio.

## Response Language

Use `kicadstudio.ai.language` to control the response language independently from the VS Code UI locale.

## Language Model Tools

KiCad Studio 2.7.0 targets VS Code `^1.99.0` for Language Model Tool and chat-provider contribution metadata. When `kicadstudio.ai.allowTools` is enabled and the host VS Code build exposes the API, KiCad Studio registers tools for:

- DRC
- ERC
- Gerber export
- opening a file
- component search
- symbol search
- footprint search
- reading the active editor context
- listing design variants
- switching the active variant

These tools are available to agent mode and can also be referenced directly in supported chat UIs.

## Chat Provider

When the host exposes `registerLanguageModelChatProvider`, KiCad Studio contributes a `kicadstudio` chat-model vendor that routes requests through the stored Claude API key and enriches the prompt with active project context.

The contributed prompt-facing tool definitions are pinned in the extension manifest and should be updated with the VS Code engine and `@types/vscode` version together.

Use `KiCad: Manage Chat Provider` to:

- store or replace the Claude API key
- choose the model string override
- test the configured provider

## Security Model

- KiCad Studio stores external API keys in VS Code SecretStorage.
- Webviews do not call AI providers directly.
- Network calls stay in the extension host.
- Debug logging must never print raw API keys; larger request bodies are redacted.

## MCP-Assisted Suggestions

When MCP is connected, assistant replies may include executable `mcp` tool suggestions that the user can preview and apply from the chat UI.
