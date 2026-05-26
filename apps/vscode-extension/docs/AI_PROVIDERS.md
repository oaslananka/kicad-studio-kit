# AI Providers

## Supported Providers

KiCad Studio supports seven direct AI provider paths:

- Claude
- OpenAI
- OpenRouter
- GitHub Copilot
- Gemini
- local OpenAI-compatible endpoints
- Codex through the VS Code Language Model API

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

## OpenRouter

- Set `kicadstudio.ai.provider` to `openrouter`.
- Store the OpenRouter API key with `KiCad: Set AI API Key`.
- Set `kicadstudio.ai.model` to an OpenRouter model ID when overriding the shared default.
- OpenRouter requests use its chat-completions endpoint from the extension host.

## GitHub Copilot

- Set `kicadstudio.ai.provider` to `copilot`.
- Requires a VS Code environment where the Language Model API exposes Copilot models.
- No separate API key is stored by KiCad Studio.

## Codex

- Set `kicadstudio.ai.provider` to `codex`.
- Requires a VS Code environment where the Language Model API exposes compatible models.
- No separate API key is stored by KiCad Studio.
- This provider is a direct KiCad Studio extension provider. It does not start the Codex CLI, read `~/.codex/config.toml`, or configure Codex as an external MCP client.
- For Codex CLI or Codex IDE extension MCP setup, use [`docs/agents/codex-support.md`](../../../docs/agents/codex-support.md) and [`examples/mcp-clients/codex.config.example.toml`](../../../examples/mcp-clients/codex.config.example.toml).

## Gemini

- Set `kicadstudio.ai.provider` to `gemini`.
- Store the Gemini API key with `KiCad: Set AI API Key`.
- The default model comes from the extension's shared provider constants and can be overridden with `kicadstudio.ai.model`.

## Local

- Set `kicadstudio.ai.provider` to `local`.
- Set `kicadstudio.ai.localEndpoint` to the base URL of a local OpenAI-compatible chat endpoint, for example one that exposes `/v1/chat/completions`.
- Set `kicadstudio.ai.model` to the model ID expected by that endpoint.
- KiCad Studio does not store or send an API key for the local provider. Without a configured local endpoint, provider selection falls back to an unconfigured state.

## Response Language

Use `kicadstudio.ai.language` to control the response language independently from the VS Code UI locale.

## Language Model Tools

KiCad Studio 1.0.0 targets VS Code `^1.120.0` for Language Model Tool and chat-provider contribution metadata. When `kicadstudio.ai.allowTools` is enabled and the host VS Code build exposes the API, KiCad Studio registers tools for:

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

- KiCad Studio stores external API keys in VS Code SecretStorage under provider-specific keys.
- Legacy plaintext AI and Octopart/Nexar settings are migrated into SecretStorage and cleared from settings during activation.
- Webviews do not call AI providers directly.
- Network calls stay in the extension host.
- Debug logging must never print raw API keys; larger request bodies are redacted.

## MCP-Assisted Suggestions

When MCP is connected, assistant replies may include executable `mcp` tool suggestions that the user can preview and apply from the chat UI.
