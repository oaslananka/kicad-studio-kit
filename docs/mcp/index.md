# kicad-mcp-pro

`kicad-mcp-pro` is the MCP server published from
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/). It exposes KiCad project discovery,
schematic and PCB inspection, validation, exports, manufacturing workflows, library lookup, and
release-quality checks to MCP clients. The source lives exclusively at KiCad MCP Pro (removed from this monorepo).

## Main User Paths

| Workflow                                                 | Documentation                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| Review all tools and their profile availability          | [Tool catalog](tools.md)                                       |
| Connect through Streamable HTTP or stdio                 | [Transport](transport.md)                                      |
| Deploy with Docker, systemd, tunnels, or reverse proxies | [Deployment](deployment.md)                                    |
| Validate server-info and capabilities                    | [API reference](api-reference.md)                              |
| Connect to the VS Code extension                         | [KiCad Studio integration](../integration/kicad-studio-mcp.md) |

## Source Files

- Published package: `kicad-mcp-pro` (PyPI) / `ghcr.io/oaslananka/kicad-mcp-pro` (Docker)
- Development source: [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/) (removed from this monorepo)
- Server-info schema: `@oaslananka/kicad-protocol-schemas/schemas/kicad-mcp-server-info.schema.json`

The MCP tool catalog is generated from the registered server tools published and maintained by the KiCad MCP Pro repository.
