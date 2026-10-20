# ADR 0008: MCP 2026-07-28 Protocol Activation

Status: Accepted

Date: 2026-05-30

Last reviewed: 2026-10-20

## Context

The repository's production source now selects MCP `2026-07-28` through the
stateless adapter; its server support minimum is the signed and verified
`kicad-mcp-pro==4.3.0`. The previously published Studio `v1.17.1` artifact
remains on `2025-11-25` with the older server compatibility window. Updating
source metadata or accepting this ADR does **not** publish a new VSIX or authorize
Marketplace rollout. Published server 4.3.0 uses Python MCP SDK v2 and retains
`2025-11-25` initialize/session traffic for explicit fallback tests.
References:

- <https://modelcontextprotocol.io/specification/2026-07-28>
- <https://blog.modelcontextprotocol.io/posts/2026-07-28/>
- <https://pypi.org/project/mcp/2.0.0/>

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

## 2026-10-20 published-artifact and source-activation checkpoint

The published `@oaslananka/kicad-protocol-schemas@2.0.0` artifact satisfies
the original `minimumReleaseAge: 10080` policy and is already consumed in the
Studio root and extension manifests. The published PyPI server `4.3.0` uses
stable Python SDK v2 and advertises the final MCP 2026 revision, independently
from the retained historical strict RC conformance selector.

Source-reviewed [activation readiness evidence](../evidence/mcp-2026-07-28/2026-10-20-activation-readiness.md)
records the final on-wire Studio adapter tests, both 2026 server modes, the
legacy 2025 session lane, Extension Host acceptance, fail-closed error/MRTR,
publisher/signature verification, rollback isolation, and 10/10 exact-merge
CI on [PR #813](https://github.com/oaslananka/kicad-studio-kit/pull/813).

The source cutover is now coordinated: `compatibility.yaml`, the compiled
compatibility matrix, and the production adapter registry all select the final
2026 protocol and require `kicad-mcp-pro >=4.3.0 <5.0.0`. The real VS Code Host
proves the **default, non-injected Studio client** selects 2026 against a signed
published server; a separate 2025 adapter establishes a fresh rollback session.
The existing published Studio release stays on 2025. A new VSIX/Marketplace
release is a **separate rollout decision** after protected source CI and
independent exact-merge validation.

## Current ownership audit

| Surface                                    | Current value                                   | Owner / source of truth                                              |
| ------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------- |
| Active MCP protocol                        | `2026-07-28`                                    | Both repositories' compatibility metadata                            |
| Previously tracked protocol                | `2025-11-25`                                    | This repository's `compatibility.yaml` and the KiCad MCP Pro roadmap |
| Extension protocol adapter                 | `2026-07-28` stateless discovery; 2025 fallback | This repository, `apps/vscode-extension/src/mcp/`                    |
| Server protocol implementation             | Published final 2026 plus 2025 compatibility    | KiCad MCP Pro                                                        |
| Protocol schemas consumed by the extension | `@oaslananka/kicad-protocol-schemas`            | Published npm artifact                                               |
| Protocol schema source and publishing      | Current published schema package                | KiCad MCP Pro                                                        |
| Extension compatibility range              | `products.kicad-studio.compatibleMcpPro`        | This repository's `compatibility.yaml`                               |
| Server compatibility range                 | `compatibleExtension`                           | KiCad MCP Pro compatibility metadata                                 |
| Cross-product proof                        | Published schema and server artifacts           | `.github/workflows/cross-repo-compatibility.yml`                     |

The versioned extension adapter/transport boundary is tracked by issue #492.
Its preparation phase must preserve `2025-11-25` and keep any `2026-07-28`
envelope fixture non-selectable until compatible published server/schema
artifacts, a production adapter, and final real-pair evidence exist.

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

### Machine-enforced activation record

The `mcp.activation` record in `compatibility.yaml` is the fail-closed release
control for this decision. While its state is `blocked`, the active protocol must
remain different from the target, `nextProtocolVersion` must identify the target,
the production adapter registry must not select the target, and ADR 0008 must
remain `Proposed`.

The state may change to `active` only when the record identifies the official
stable specification, a stable Python SDK, stable published protocol schemas, a
stable KiCad MCP Pro artifact advertising the target protocol, the checked-in
stateless extension adapter, published-artifact real-pair evidence, and this ADR
as `Accepted`. Prerelease, RC, draft, source-checkout, or missing-file evidence
fails the compatibility contract.

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

1. Adopt a stable Python MCP SDK 2.x release in the owning repository when the
   GA server is ready to implement the final protocol.
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
3. Record final conformance fixtures from stable published artifacts before activation.
4. Keep each repository's CI independent; exchange only published artifacts and
   explicit compatibility metadata.

## Phase 1: Final protocol and server/schema publication

The final specification, stable Python SDK, signed published server 4.3.0,
published schemas 2.0.0, and the Studio client/Host real-pair acceptance have
passed. The remaining product operation is the separately authorized Studio
release and its supported-server upgrade notification.

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

### Reviewed server compatibility decision for the final activation

The activated source `2026-07-28` extension requires a **minimum published
`kicad-mcp-pro` version of 4.3.0**, the first signed final server whose normal
protocol lane, strict 2026 canary lane, and legacy 2025 session lane all passed
Studio's real-pair and Host acceptance tests. Studio **does not auto-select**
the final adapter on a legacy server based on untrusted discovery metadata.
Do not interpret a compatible server _product_ version as proof of the active
_protocol_ revision.

The source-validated activation gate fails closed unless the supported-server
required and recommended semver ranges in both `supportAxes.mcpServer` and
`products.kicad-studio.compatibleMcpPro` include the reviewed artifact and
exclude every lower version, including through union ranges. The lower bound
of the recorded server artifact may not precede 4.3.0. This policy does not
change the currently released 2025 client support range of `>=3.5.2 <5.0.0`.
The coordinated source cutover tightens its supported range, updates the
compiled matrix, and verifies the default-selected production 2026 client and
explicit 2025 fallback in the same real Host. Before distributing the new
extension, protected exact-merge CI must pass and a release decision must be
recorded. Users who require older servers may stay on the published
2025-capable `v1.17.1` release.

### Release order for a breaking transition

1. KiCad MCP Pro publishes the schema artifact.
2. KiCad MCP Pro publishes the compatible server/runtime artifacts.
3. KiCad Studio consumes the published schema, activates the adapter, and
   validates the published server pair.
4. KiCad Studio publishes a release with the new required server range.

No repository publishes another repository's artifacts.

## Release decision and concrete rollback

The source activation is accepted only if the independent PR and exact-merge
main CI, CodeQL, SonarCloud, Codecov, real published-pair Extension Host, and
Windows/Linux/macOS build checks all pass. **Do not publish a VSIX or change
Marketplace defaults as a side effect of this source merge.**

If a future Studio release using final MCP 2026 causes a compatibility
regression, stop promoting that release, select the previously published
[`vscode-extension-v1.17.1`](https://github.com/oaslananka/kicad-studio-kit/releases/tag/vscode-extension-v1.17.1)
artifact, and confirm an older supported server can initialize with 2025,
issue `tools/list`, and run read-only `kicad_get_version`. Revert the coordinated
source cutover rather than publishing mixed metadata that claims 2026 while
selecting 2025. Do not reuse stored 2025 `MCP-Session-Id` in modern requests;
modern discovery and header tests must remain fail-closed. The explicit
adapter-level 2025 recovery was verified in a real published-server Host.

Production release owner approval and downstream server-version communication
remain outside this ADR's source activation. The old published extension
supports `>=3.5.2 <5.0.0`; the new source/client would require
`>=4.3.0 <5.0.0`. **This is a breaking change**, not silent version negotiation.

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

1. `nextProtocolVersion` has been removed with source activation; confirm the same metadata in published release manifests.
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

Revisit this ADR when KiCad MCP Pro publishes a stable server/schema pair that
advertises `2026-07-28` and KiCad Studio has final adapter plus real-pair
evidence. Record the selected package/server versions and move the ADR from
Proposed to Accepted only after the cross-repository release sequence is proven.

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
