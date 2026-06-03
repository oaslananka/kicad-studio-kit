# Frequently Asked Questions

## General

### What is KiCad Studio Kit?

KiCad Studio Kit is a VS Code extension that provides schematic/PCB viewing, DRC/ERC,
export, component search, and AI-assisted design workflows. It pairs with the optional
`kicad-mcp-pro` MCP server for advanced quality gates and AI fix queues.

### Which KiCad versions are supported?

See the [Support Matrix](/support-matrix) for the current version range. The extension
tracks KiCad's file format evolution — opening a file from a newer KiCad version than
listed may produce degraded results.

### Do I need to install KiCad separately?

The extension does not require the KiCad GUI to view schematics and PCBs. However,
`kicad-cli` (the KiCad command-line tool) is needed for DRC, ERC, and exports. Install
the full KiCad application to get `kicad-cli`, or use the Flatpak distribution on Linux.

### Is the extension available for VS Code for the Web (vscode.dev)?

No. The extension depends on Node.js APIs (file system, child process, webview) that are
not available in the browser-based editor.

## Installation & Setup

### How do I install the extension?

Open VS Code, go to the Extensions view (Ctrl+Shift+X), search for "KiCad Studio Kit",
click **Install**. Alternatively, download the `.vsix` from the
[GitHub Releases](https://github.com/oaslananka/kicad-studio-kit/releases) page.

### How do I install kicad-mcp-pro?

**pip (recommended):**

```bash
pip install kicad-mcp-pro
```

**uvx (alternative):**

```bash
uvx kicad-mcp-pro
```

**Docker:**

```bash
docker pull ghcr.io/oaslananka/kicad-mcp-pro:latest
```

See the [MCP deployment docs](/mcp/deployment) for detailed instructions.

### kicad-cli is not detected. What should I do?

1. Verify KiCad is installed and `kicad-cli` is on your system PATH.
2. On Linux, check if you are using Flatpak: `flatpak run --command=kicad-cli org.kicad.KiCad`.
3. Set the path manually in VS Code settings under `kicadstudio.kicadCliPath`.
4. Run the **KiCad: Detect kicad-cli** command from the Command Palette.

### Do I need to set up an API key for AI features?

AI features (error analysis, chat, DRC explanation) require a provider API key.
Open VS Code Settings → KiCad Studio → AI and select your provider (Claude, OpenAI,
Gemini, or GitHub Copilot). For GitHub Copilot, no separate key is needed if you have
a GitHub Copilot subscription.

## Cross-Platform

### Linux: Flatpak vs native KiCad — which should I use?

Both work. If KiCad is installed via Flatpak, set `kicadstudio.kicadCliPath` to:
`flatpak run --command=kicad-cli org.kicad.KiCad`. Native installations are auto-detected.

### Windows: PowerShell execution policy blocks scripts?

The extension does not require script execution. If `kicad-cli` is on your PATH, it is
called directly as a native executable.

### macOS: "kicad-cli cannot be opened because the developer cannot be verified"

Open **System Settings → Privacy & Security** and click **Allow Anyway** for kicad-cli,
or remove the quarantine attribute: `xattr -d com.apple.quarantine /path/to/kicad-cli`.

## MCP & AI

### How do I connect kicad-mcp-pro?

Three transport options:

| Transport       | Setup                                                                          | Best for                    |
| --------------- | ------------------------------------------------------------------------------ | --------------------------- |
| VS Code stdio   | Bundled — enabled by default                                                   | Quick start                 |
| Streamable HTTP | `kicad-mcp-pro --port 27185`, then point extension at `http://localhost:27185` | Quality gates, AI fix queue |
| Docker          | See [Deployment](/mcp/deployment)                                              | Isolated environments       |

### Which operating mode should I use?

- **readonly**: Default. Safe for viewing and analysis.
- **write**: Required for file modifications (DRC rules, project settings).
- **manufacturing**: Enables export and production-related tools.
- **experimental**: Unstable or in-development tools.

### Why is the AI Fix Queue empty?

The fix queue requires:

1. kicad-mcp-pro running in HTTP mode (not stdio).
2. DRC/ERC results available in the Problems panel.
3. The `readonly` mode at minimum.

Run **KiCad: Launch kicad-mcp-pro (HTTP mode)** from the Command Palette.

## Telemetry & Privacy

### Does the extension collect telemetry?

Telemetry is opt-in and disabled by default. When enabled, only anonymized usage metrics
and error counts are sent. No board data, schematic content, project names, or personal
identifiers are collected. See [Telemetry](/telemetry) for details.

### How do I disable telemetry?

Set `kicadstudio.telemetry.enabled` to `false` in VS Code settings. The VS Code-level
`telemetry.telemetryLevel` setting also governs this.

## Troubleshooting

### The viewers show a blank page or "Loading..."

1. Check that the file is not corrupted by opening it in KiCad.
2. Large files (≥50 MB) fall back to metadata-only mode — this is expected and noted
   in the status bar.
3. Disable and re-enable the extension, then reload the window.
4. Check the **KiCad Studio** output channel for errors (View → Output → KiCad Studio).

### MCP connection fails with "ECONNREFUSED"

The kicad-mcp-pro server is not running on the expected port. Start it manually:

```bash
kicad-mcp-pro --port 27185
```

Then use **KiCad: Retry MCP Connection** from the Command Palette.

### How do I report a bug or request a feature?

Open an issue on [GitHub](https://github.com/oaslananka/kicad-studio-kit/issues/new).
Include your VS Code version, KiCad version, OS, and steps to reproduce.

### Where can I get help?

- GitHub Issues: https://github.com/oaslananka/kicad-studio-kit/issues
- Documentation site: https://oaslananka.github.io/kicad-studio-kit
- KiCad community forums (for KiCad-specific questions)
