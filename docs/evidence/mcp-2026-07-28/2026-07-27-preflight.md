---
search: false
---

# MCP 2026-07-28 Final Activation Preflight

Date: 2026-07-27

Status: **Blocked — production activation is not authorized.**

## Verified upstream state

- The official MCP release list exposes `2026-07-28-RC` as a prerelease; the latest stable protocol release remains `2025-11-25`.
- The official final-release milestone still has one open item, including the general-availability announcement.
- The Python MCP SDK stable line is `1.28.1`; the v2 line required for the stateless protocol remains prerelease (`2.0.0rc1`).
- The TypeScript v2 packages remain beta (`2.0.0-beta.5`).

## Published KiCad MCP Pro state

- The latest PyPI artifact observed during this review is `kicad-mcp-pro` `3.29.0`.
- Current KiCad MCP Pro source metadata is `3.29.0` and still constrains the Python SDK to `mcp[cli]>=1.27.1,<2.0.0`.
- KiCad MCP Pro compatibility metadata still advertises MCP `2025-11-25` with `2026-07-28` tracked only as the next protocol.

## Activation blockers

1. Stable MCP `2026-07-28` specification release/tag is not published.
2. Stable Python MCP SDK v2 is not published.
3. A final-version protocol-schema artifact is not published.
4. A KiCad MCP Pro artifact advertising and implementing the final protocol is not published.
5. KiCad Studio does not contain a production-selectable final adapter.
6. Published-artifact real-pair evidence for the final protocol does not exist.
7. ADR 0008 remains `Proposed`; it must become `Accepted` only in the proven activation change.

## Sources reviewed

- <https://github.com/modelcontextprotocol/modelcontextprotocol/releases>
- <https://github.com/modelcontextprotocol/modelcontextprotocol/milestones>
- <https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3063>
- <https://pypi.org/project/mcp/>
- <https://www.npmjs.com/package/@modelcontextprotocol/client>
- <https://pypi.org/project/kicad-mcp-pro/>
- <https://oaslananka.github.io/kicad-mcp-pro/>

This evidence is a dated preflight snapshot, not a compatibility claim. Replace it with final release and artifact evidence during the coordinated activation PR.
