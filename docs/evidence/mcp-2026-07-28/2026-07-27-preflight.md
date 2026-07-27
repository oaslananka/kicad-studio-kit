---
search: false
---

# MCP 2026-07-28 Final Activation Preflight

Date: 2026-07-27

Status: **Blocked — production activation is not authorized.**

## Verified upstream state

- The live official MCP GitHub releases API exposes `2026-07-28-RC` only; it is marked as a prerelease. The latest stable protocol release remains `2025-11-25`.
- The official `2026-07-28` specification URLs returned HTTP 404 during the 2026-07-27 20:06 UTC verification.
- The official final-release milestone still has one open item.
- The Python MCP SDK stable line is `1.28.1`; the v2 line required for the native stateless protocol remains prerelease (`2.0.0rc1`).
- The TypeScript v2 packages remain beta.

## Published KiCad MCP Pro state

- PyPI and GitHub Releases published stable `kicad-mcp-pro` `3.29.1` on 2026-07-27.
- The published package still constrains the Python SDK to `mcp[cli]>=1.27.1,<2.0.0`.
- KiCad MCP Pro compatibility metadata keeps MCP `2025-11-25` active and tracks `2026-07-28` as the next protocol.
- The package exposes an explicit, non-GA `2026-07-28-rc` Streamable HTTP lane for artifact canaries.
- `@oaslananka/kicad-protocol-schemas` `1.4.0` is published, but that release is not a final MCP `2026-07-28` schema compatibility claim. KiCad Studio currently consumes reviewed version `1.1.1`.

## Published RC artifact evidence

The published `kicad-mcp-pro==3.29.1` wheel was installed from PyPI and launched with:

```text
KICAD_MCP_PROTOCOL_LANE=2026-07-28-rc
KICAD_MCP_TRANSPORT=streamable-http
KICAD_MCP_STATEFUL_HTTP=0
KICAD_MCP_LEGACY_SSE=0
```

The KiCad Studio artifact canary then proved:

- `server/discover` accepted `MCP-Protocol-Version: 2026-07-28`, `Mcp-Method`, and request `_meta` values;
- discovery returned `supportedVersions: ["2026-07-28"]`, server identity `kicad-mcp-pro` `3.29.1`, `resultType: complete`, private cache scope, and a positive TTL;
- `tools/list` returned 24 deterministically ordered tools with private cache metadata;
- neither response returned `MCP-Session-Id`;
- the existing manual Cross-repo Compatibility run `30300849797` independently resolved and installed PyPI `kicad-mcp-pro` `3.29.1` successfully.

This proves the published **release-candidate lane** and the expected stateless envelope. It is not final protocol real-pair evidence and does not authorize production selection.

## Remaining activation blockers

1. A stable MCP `2026-07-28` specification release/tag and official specification page are not published.
2. A stable Python MCP SDK v2 is not published.
3. A protocol-schema release explicitly claiming final MCP `2026-07-28` compatibility is not published and consumed.
4. KiCad MCP Pro does not advertise `2026-07-28` as its active GA protocol; `3.29.1` exposes only an opt-in RC compatibility lane.
5. KiCad Studio does not contain a production-selectable final adapter.
6. Published-artifact real-pair evidence against the final GA protocol does not exist.
7. ADR 0008 remains `Proposed`; it must become `Accepted` only in the proven activation change.

## Production state retained

- `compatibility.yaml` remains `mcp.activation.state: blocked`.
- `mcp.protocolVersion` remains `2025-11-25` and `mcp.nextProtocolVersion` remains `2026-07-28`.
- `SUPPORTED_MCP_PROTOCOL_VERSIONS` remains `['2025-11-25']`.
- The RC artifact canary is isolated from the production adapter registry.

## Sources reviewed

- <https://github.com/modelcontextprotocol/modelcontextprotocol/releases>
- <https://github.com/modelcontextprotocol/modelcontextprotocol/milestones>
- <https://modelcontextprotocol.io/specification/2026-07-28>
- <https://pypi.org/project/mcp/>
- <https://pypi.org/project/kicad-mcp-pro/>
- <https://www.npmjs.com/package/@oaslananka/kicad-protocol-schemas>
- <https://oaslananka.github.io/kicad-mcp-pro/>

This evidence is a dated preflight snapshot, not a production compatibility claim. Replace it with final release and artifact evidence during the coordinated activation PR.
