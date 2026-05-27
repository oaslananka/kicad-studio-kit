# Install

KiCad Studio Kit has three install surfaces:

| Surface                        | Use when                                                                                                               | Install path                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| KiCad Studio VS Code extension | You want KiCad project navigation, viewers, validation, exports, component search, and MCP integration inside VS Code. | Install `oaslananka.kicadstudiokit` from the VS Code Marketplace or Open VSX once release publishing is enabled. |
| kicad-mcp-pro Python server    | You want an MCP server that exposes KiCad workflows to MCP clients.                                                    | Install the Python package or run from this repository with `uv`.                                             |
| npm launcher                   | You want a Node package that launches the Python MCP server consistently.                                              | Install `kicad-mcp-pro` once npm publishing is enabled.                                                       |

## Local Repository Setup

```bash
corepack enable
corepack pnpm install --frozen-lockfile
uv sync --all-extras --frozen --project packages/mcp-server
```

Run the product checks before using a local build:

```bash
corepack pnpm run check:kicad-studio
corepack pnpm run check:kicad-mcp-pro
corepack pnpm run check:mcp-npm
```

## Extension Development Build

```bash
corepack pnpm --filter kicadstudiokit run build
corepack pnpm --filter kicadstudiokit run package
```

The generated VSIX is validated by `corepack pnpm run verify:dist`.

## MCP Server Development Run

```bash
uv run --project packages/mcp-server --all-extras kicad-mcp-pro --help
```

For HTTP mode:

```bash
uv run --project packages/mcp-server --all-extras kicad-mcp-pro --transport streamable-http --host 127.0.0.1 --port 3334
```

## Docker

Container setup and runtime security notes are documented in [Docker deployment](deployment/docker.md).

## Compatibility

Supported KiCad, VS Code, Node, pnpm, Python, and MCP protocol versions are tracked in the
[support matrix](support-matrix.md).
