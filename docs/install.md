# Install

KiCad Studio Kit has two install surfaces:

| Surface                        | Use when                                                                                                               | Install path                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| KiCad Studio VS Code extension | You want KiCad project navigation, viewers, validation, exports, component search, and MCP integration inside VS Code. | Install `oaslananka.kicadstudiokit` from the VS Code Marketplace or Open VSX once release publishing is enabled. |
| kicad-mcp-pro Python server    | You want an MCP server that exposes KiCad workflows to MCP clients.                                                    | Install from PyPI or see [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/).                        |

## Local Repository Setup

```bash
corepack enable
corepack pnpm install --frozen-lockfile
```

Run the product checks before using a local build:

```bash
corepack pnpm run check:kicad-studio
```

Run MCP server checks from the
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/) repository.

## Extension Development Build

```bash
corepack pnpm --filter kicadstudiokit run build
corepack pnpm --filter kicadstudiokit run package
```

The generated VSIX is validated by `corepack pnpm run verify:dist`.

## MCP Server

The `kicad-mcp-pro` Python MCP server source has moved to [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/). Install and run instructions are available there.

For a quick install from PyPI:

```bash
pip install kicad-mcp-pro
kicad-mcp-pro --help
```

## Docker

Container setup and runtime security notes are documented in [Docker deployment](deployment/docker.md).

## Compatibility

Supported KiCad, VS Code, Node, pnpm, Python, and MCP protocol versions are tracked in the
[support matrix](support-matrix.md).
