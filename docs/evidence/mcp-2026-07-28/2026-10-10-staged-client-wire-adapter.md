# MCP 2026-07-28: staged Studio client wire adapter

Status: **not activated** — Studio production remains on `2025-11-25`.

Issue: [#492](https://github.com/oaslananka/kicad-studio-kit/issues/492).

## Source and scope

The [final MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28), the [TypeScript SDK v2 migration notes](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28), and the published KiCad MCP Pro [v4.1.0 release](https://pypi.org/project/kicad-mcp-pro/4.1.0/) establish a stable target. This staged tranche adds an independently tested `Mcp2026ProtocolAdapter` without inserting it into `SUPPORTED_MCP_PROTOCOL_VERSIONS`, changing `mcp.activation`, or claiming production compatibility.

The adapter provides `server/discover` instead of `initialize`, validates `supportedVersions` (the GA discovery field); mirrors the request method and principal name in `Mcp-Method` and `Mcp-Name` (UTF-8 Base64-encoded for non-ASCII names); attaches self-contained protocol version, client information and capabilities to **every** request's `_meta`; ignores historic session IDs; and rejects unsupported `input_required`, unknown or missing `resultType` rather than interpreting them as complete results. Existing 2025 request headers and params remain unchanged. Discovery cache reuse remains disabled pending a version-scoped TTL/cache-scope contract.

## Verification and remaining activation gates

Focused tests cover the legacy and staged adapter, header/name parity, metadata forgery resistance, isolated stateless lifecycle and fail-closed response discrimination. Local typecheck, lint, architecture, compatibility and protocol-schema checks form the initial tranche acceptance, in addition to ordinary PR CI.

This is **not** published-artifact real-pair proof. Before activating the 2026 version in Studio, a separate protocol-impacting PR must reconcile the final discovery `serverInfo` response metadata and `resultType` interpretation with the extension's server-card normalization; validate a real published 2026 server/schema pair including older 2025 compatibility; assess and support or explicitly reject multi-round-trip behavior; update the protocol schema dependency, activation evidence, ADR 0008, docs and release notes; then pass exact-head protected cross-platform CI. Retain the current 2025 registry entry for a rollback-compatible protocol lane. No release is authorized by this staged change.
