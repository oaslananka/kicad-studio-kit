# Examples

Examples are user-facing KiCad projects for extension, MCP, documentation,
screenshot, walkthrough, and release smoke workflows. They are intentionally
separate from deterministic automated fixtures; tests should not depend on these
files as golden outputs unless a future issue explicitly copies a scenario into
the fixture corpus.

## Project Examples

| Example                                                            | Primary workflow focus                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| [led-basic](led-basic/README.md)                                   | Basic schematic/PCB viewing, ERC/DRC, BOM, and netlist |
| [usb-c-power](usb-c-power/README.md)                               | Power-intake review and degraded MCP handling          |
| [buck-converter](buck-converter/README.md)                         | Power-stage review, BOM, netlist, ERC, and DRC         |
| [differential-pair-demo](differential-pair-demo/README.md)         | High-speed review flow and connected MCP inspection    |
| [manufacturing-release-demo](manufacturing-release-demo/README.md) | Manufacturing export release smoke workflow            |
| [mcp-demo](mcp-demo/README.md)                                     | Connected and degraded MCP client workflows            |

## Runtime Example

| Example                            | Purpose                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [mcp-docker](mcp-docker/README.md) | Docker Compose example for running `kicad-mcp-pro` over streamable HTTP with a read-only KiCad project mount |

## Output Policy

Generated outputs such as Gerbers, drill files, reports, screenshots, netlists,
BOM exports, and local MCP logs should stay outside git. The repository ignores
`examples/**/exports/`; use that directory when following smoke commands.
