# ADR 0008: MCP 2026-07-28 Protocol Upgrade Plan

Status: Draft

Date: 2026-05-30

Last reviewed: 2026-07-20

## Context

The active MCP protocol for KiCad Studio and KiCad MCP Pro is
`2025-11-25`. The MCP maintainers published a release candidate for the
breaking `2026-07-28` specification and scheduled the final specification for
July 28, 2026.

Reference: <https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/>

Since [ADR 0009](0009-split-kicad-mcp-pro-into-separate-repository.md), the
upgrade spans two repositories and published artifacts:

- this repository owns the KiCad Studio extension, its client-side protocol
  adapter, its compatibility declaration, and published-artifact canaries;
- [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/) owns the Python
  server, MCP SDK dependency, server transport, server manifests, protocol
  schema source, and MCP product publishing workflows;
- `@oaslananka/kicad-protocol-schemas` is the npm contract artifact consumed by
  both repositories;
- `kicad-mcp-pro` on PyPI and the signed container/registry artifacts are the
  server evidence consumed by the cross-repository compatibility gate.

No local MCP server or protocol-schema source package exists in this
repository. Upgrade instructions must therefore assign work to the owning
repository or published artifact rather than to removed local paths.

## Current ownership audit

| Surface                                    | Current value                            | Owner / source of truth                                              |
| ------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------- |
| Active MCP protocol                        | `2025-11-25`                             | Both repositories' compatibility metadata                            |
| Tracked next protocol                      | `2026-07-28`                             | This repository's `compatibility.yaml` and the KiCad MCP Pro roadmap |
| Extension protocol adapter                 | `2025-11-25` initialize/session behavior | This repository, `apps/vscode-extension/src/mcp/`                    |
| Server protocol implementation             | `2025-11-25`                             | KiCad MCP Pro                                                        |
| Protocol schemas consumed by the extension | `@oaslananka/kicad-protocol-schemas`     | Published npm artifact                                               |
| Protocol schema source and publishing      | Current published schema package         | KiCad MCP Pro                                                        |
| Extension compatibility range              | `products.kicad-studio.compatibleMcpPro` | This repository's `compatibility.yaml`                               |
| Server compatibility range                 | `compatibleExtension`                    | KiCad MCP Pro compatibility metadata                                 |
| Cross-product proof                        | Published schema and server artifacts    | `.github/workflows/cross-repo-compatibility.yml`                     |

The versioned extension adapter/transport boundary is tracked by issue #492.
Its preparation phase must preserve `2025-11-25` and keep any `2026-07-28`
envelope fixture non-selectable until the final specification and compatible
published server artifacts exist.

## Key 2026-07-28 changes

### 1. Stateless HTTP core (breaking)

- `initialize`/`initialized` handshake removed ([SEP-2575]).
- `Mcp-Session-Id` and protocol-level sessions removed ([SEP-2567]).
- Protocol version, client information, and capabilities travel in request
  `_meta`.
- `server/discover` replaces `initialize` for capability discovery.
- `Mcp-Method` and `Mcp-Name` headers support Streamable HTTP routing
  ([SEP-2243]).

### 2. Tasks extension

- Tasks move from experimental core behavior to an official extension.
- A server can answer `tools/call` with a task handle; clients use task methods
  for progress and cancellation.
- Long-running KiCad operations require server-side adoption and matching
  extension behavior; they are not part of protocol activation by default.

### 3. MCP Apps extension

- Servers may publish interactive UI resources rendered by supporting clients.
- KiCad MCP Pro remains headless-first, so Apps adoption is optional and must be
  evaluated separately from the core protocol migration.

### 4. Authorization hardening

- OAuth 2.1/OIDC issuer validation, credential binding, dynamic client
  registration metadata, refresh-token guidance, and step-up scope behavior are
  strengthened.
- Remote deployment authorization remains owned by KiCad MCP Pro and its
  deployment documentation.

### 5. JSON Schema 2020-12

- Tool input/output schemas support the full JSON Schema 2020-12 vocabulary.
- Schema source changes are made and published by KiCad MCP Pro; this repository
  consumes the resulting npm artifact and validates extension compatibility.

### 6. Caching, tracing, and multi-round-trip requests

- List/read results can advertise TTL and cache scope.
- W3C Trace Context keys are standardized.
- `InputRequiredResult` enables multi-round-trip tools without holding a stream
  open.

These features may be adopted incrementally after core protocol compatibility
is proven.

## Decision

Use a gated, cross-repository migration. Do not activate `2026-07-28` until all
of the following are true:

1. the final MCP specification is published;
2. the Python MCP SDK version used by KiCad MCP Pro supports the final protocol;
3. KiCad MCP Pro publishes compatible protocol schemas and a compatible server
   artifact;
4. this repository implements and selects the matching extension adapter;
5. published-artifact real-pair and cross-repository canaries are green;
6. both repositories update compatibility metadata and release notes in the
   required order.

A draft fixture, planning document, or unmerged adapter boundary is not a
compatibility claim.

## Phase 0: Preparation while 2025-11-25 remains active

### This repository: KiCad Studio client

1. Keep `compatibility.yaml` `mcp.protocolVersion` on `2025-11-25` and track
   `nextProtocolVersion: "2026-07-28"`.
2. Maintain a versioned extension protocol-adapter and transport boundary under
   issue #492.
3. Preserve exact current initialize, session-header, Streamable HTTP, and
   opt-in legacy SSE behavior in regression tests.
4. Keep the `2026-07-28` planning envelope as a draft, non-selectable test
   fixture.
5. Define structured diagnostics for unsupported or explicitly mismatched
   protocol versions.
6. Keep extension compatibility ranges and published-artifact canaries green.

### KiCad MCP Pro: server and schema source

1. Track the Python MCP SDK release that implements the final specification.
2. Audit server transport, discovery, manifest, well-known metadata, and
   compatibility surfaces against the final specification.
3. Review long-running tools for optional Tasks adoption without coupling that
   work to core activation.
4. Review tool annotations and JSON Schema 2020-12 requirements.
5. Prepare the protocol-schema source and publishing process for a versioned npm
   release.

### Cross-repository evidence

1. Validate the current published schema package from this repository.
2. Validate the current published `kicad-mcp-pro` artifact with real-pair flows.
3. Record final conformance fixtures only after the specification is final.
4. Keep each repository's CI independent; exchange only published artifacts and
   explicit compatibility metadata.

## Phase 1: Final protocol and server/schema publication

This phase starts only after the final specification and supported Python SDK
are available.

### KiCad MCP Pro publishes first

1. Update the Python MCP SDK dependency.
2. Implement the final stateless lifecycle, discovery method, routing headers,
   request metadata, and removal of protocol sessions.
3. Update server-info, compatibility, registry, and manifest validation.
4. Update protocol-schema source for final server-info or compatibility fields.
5. Publish a versioned `@oaslananka/kicad-protocol-schemas` npm artifact.
6. Publish a compatible `kicad-mcp-pro` server release and associated container
   and MCP Registry evidence.
7. Widen or document `compatibleExtension` so the server's compatibility window
   is explicit.

### This repository consumes and activates second

1. Bump `@oaslananka/kicad-protocol-schemas` in the root and extension package
   metadata and update the lockfile.
2. Implement the final `2026-07-28` extension protocol adapter from the published
   specification, not from the RC fixture.
3. Add final request-envelope, discovery, statelessness, routing-header,
   timeout, retry, and mismatch contract tests.
4. Update `compatibility.yaml` only after the adapter is implemented and the
   required published server version is known.
5. Run protocol-schema, compatibility, real-pair, security, package, and all
   cross-platform extension gates.
6. Tighten `compatibleMcpPro` only after the published server pair passes.

### Release order for a breaking transition

1. KiCad MCP Pro publishes the schema artifact.
2. KiCad MCP Pro publishes the compatible server/runtime artifacts.
3. KiCad Studio consumes the published schema, activates the adapter, and
   validates the published server pair.
4. KiCad Studio publishes a release with the new required server range.

No repository publishes another repository's artifacts.

## Phase 2: Optional feature adoption

After core compatibility is stable:

1. Adopt Tasks for selected long-running operations with server and client
   evidence.
2. Add caching metadata where it provides measurable value.
3. Align OpenTelemetry propagation with final W3C Trace Context requirements.
4. Use JSON Schema 2020-12 composition only where it improves tool contracts.
5. Evaluate multi-round-trip requests for explicit user confirmation flows.
6. Evaluate MCP Apps only when a supported client experience justifies it.

Each feature can ship independently and must complete the protocol-impact PR
checklist in both owning repositories.

## Phase 3: Post-activation cleanup

1. Remove `nextProtocolVersion` after `2026-07-28` is active and released.
2. Replace or remove obsolete 2025 lifecycle fixtures only after the supported
   compatibility window closes.
3. Phase out legacy SSE according to the documented support policy.
4. Update user setup, support matrix, release coordination, and troubleshooting
   documentation in both repositories.

## File and artifact ownership

### This repository

| Surface                                          | Required change                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `compatibility.yaml`                             | Track next protocol, then activate final protocol and server range after evidence |
| `package.json` / extension package metadata      | Consume the published schema version                                              |
| `apps/vscode-extension/src/mcp/protocol/`        | Implement/select the final extension adapter                                      |
| `apps/vscode-extension/src/mcp/transport/`       | Preserve protocol-neutral execution and final routing behavior                    |
| Extension MCP unit/integration tests             | Prove lifecycle, envelope, diagnostics, and backward compatibility                |
| `.github/workflows/cross-repo-compatibility.yml` | Validate published schemas and server artifacts                                   |
| `docs/support-matrix.md` and release notes       | Publish the client-side compatibility claim                                       |

### KiCad MCP Pro

| Surface                                               | Required change                                                |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Python project metadata                               | Adopt a Python MCP SDK supporting the final protocol           |
| Server compatibility and well-known metadata          | Advertise the final protocol and extension compatibility range |
| Server transport/discovery implementation             | Implement the final stateless lifecycle and routing behavior   |
| Protocol-schema source                                | Update final server-info/compatibility schemas                 |
| Server manifest/registry validation                   | Validate final protocol and registry fields                    |
| Server conformance, transport, and tool tests         | Prove server behavior before publication                       |
| Schema, Python, container, and MCP Registry workflows | Publish owned artifacts and evidence                           |

### Published artifacts

| Artifact                             | Consumer evidence                                                      |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `@oaslananka/kicad-protocol-schemas` | Package resolution and schema contract validation in both repositories |
| PyPI `kicad-mcp-pro`                 | Install/smoke and real-pair validation                                 |
| Signed KiCad MCP Pro container       | Container metadata, provenance, and deployment verification            |
| MCP Registry listing                 | Registry validation and server metadata consistency                    |

## Consequences

- The repositories remain independently releasable and source-decoupled.
- Final protocol activation requires published artifacts rather than source-path
  assumptions.
- The extension can preserve `2025-11-25` while the final server and SDK mature.
- Schema publication and server publication become explicit prerequisites for a
  breaking extension compatibility bump.
- Optional Tasks, Apps, caching, tracing, and multi-round-trip work cannot delay
  the minimum core compatibility migration unless required by the final spec.
- Historical monorepo paths remain in historical ADRs and migration evidence but
  are forbidden in active execution guidance.

## Future revisit

Revisit this ADR when the final specification and supported Python SDK are
published. At that point, replace RC assumptions with final normative behavior,
record the selected package/server versions, and move the ADR from Draft to
Accepted only after the cross-repository release sequence is proven.

## References

- [SEP-2575]: Remove initialize/initialized handshake
- [SEP-2567]: Remove Mcp-Session-Id
- [SEP-2243]: Mcp-Method and Mcp-Name headers
- [SEP-2322]: Multi Round-Trip Requests
- [SEP-2549]: TTL and cache scope
- [SEP-414]: W3C Trace Context
- [SEP-2133]: Extensions framework
- [SEP-1865]: MCP Apps
- [SEP-2106]: JSON Schema 2020-12 for tools
- [SEP-2484]: Conformance suite requirement for Final status
