# ADR 0008: MCP 2026-07-28 Protocol Upgrade Plan

Status: Draft

Date: 2026-05-30

## Context

The repo is currently pinned to MCP protocol version `2025-11-25`. On May 21,
2026 the MCP maintainers published the release candidate for the **2026-07-28**
specification — the largest revision since the protocol launched. The final
specification ships on July 28, 2026.

Reference: https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/

The 2026-07-28 spec is a **breaking change** from 2025-11-25. Upgrade cannot
happen until the Python MCP SDK ships a version supporting 2026-07-28 (expected
within the 10-week RC window per the SDK tier system).

## Current State Audit (as of 2026-05-30)

| Dimension                   | Current Value                                | Source                                                   |
| --------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| MCP protocol version        | `"2025-11-25"`                               | `compatibility.yaml`, `compatibility.py`                 |
| MCP tool schema             | `"1.0"`                                      | `compatibility.yaml`                                     |
| MCP registry schema         | `"2025-12-11"`                               | `compatibility.yaml`                                     |
| Server info schema          | `"1.2.0"`                                    | `server_info.py`                                         |
| Python MCP SDK              | `1.27.1`                                     | `pip show mcp`                                           |
| Transport config            | `stdio`, `http`, `sse`, `streamable-http`    | `config.py`                                              |
| Primary transport           | `streamable-http` (stateless by default)     | `server_info.py`                                         |
| SSE support                 | Legacy fallback, `legacy_sse` flag           | `config.py`                                              |
| Stateful HTTP               | Optional, `stateful_http` flag               | `config.py`                                              |
| Session management          | Yes — `Mcp-Session-Id` for stateful sessions | Streamable HTTP protocol                                 |
| SDK Tasks extension         | Not present (`no tasks module`)              | SDK probe                                                |
| SDK StreamableHTTPServer    | Not present (uses `SseServerTransport`)      | SDK probe                                                |
| SDK LATEST_PROTOCOL_VERSION | `"2025-11-25"`                               | SDK probe                                                |
| Long-running tools          | Use `ctx.report_progress()` (non-standard)   | `simulation.py`, `export.py`, `project.py`, `routing.py` |
| Tool annotations            | Read-only/destructive via `is_destructive`   | `metadata.py`                                            |
| JSON Schema for tools       | Draft (not 2020-12)                          | Tool definitions                                         |

## Key 2026-07-28 Changes Affecting This Repo

### 1. Stateless HTTP Core (BREAKING)

- `initialize`/`initialized` handshake removed ([SEP-2575])
- `Mcp-Session-Id` header and protocol-level session removed ([SEP-2567])
- Protocol version, client info, capabilities travel in `_meta` on every request
- New `server/discover` method replaces `initialize` for capability discovery
- `Mcp-Method` and `Mcp-Name` headers required on Streamable HTTP ([SEP-2243])
- Load balancers can route on method headers — no sticky sessions needed

### 2. Tasks Extension (NEW)

- Tasks graduated from experimental core feature to official extension
- Server answers `tools/call` with a task handle; client drives with
  `tasks/get`, `tasks/update`, `tasks/cancel`
- Task creation is server-directed: client advertises extension, server decides
  when a call should run as a task
- `tasks/list` removed (cannot be scoped safely without sessions)
- **Migration needed** if any tool used experimental Tasks API

### 3. MCP Apps Extension (NEW)

- Servers can ship interactive HTML UIs rendered in sandboxed iframes
- Tools declare UI templates ahead of time for prefetch/cache/security-review
- UI-initiated actions go through same JSON-RPC base protocol — audit path
- **Low urgency** for kicad-mcp-pro — headless-first product

### 4. Authorization Hardening (ENHANCED)

- OAuth 2.1/OIDC alignment — `iss` parameter validation ([SEP-2468])
- `application_type` in Dynamic Client Registration ([SEP-837])
- Credential binding to authorization server issuer ([SEP-2352])
- Refresh token request documentation ([SEP-2207])
- Scope accumulation during step-up ([SEP-2350])

### 5. Deprecations (TRACKING)

| Feature  | Replacement                                      |
| -------- | ------------------------------------------------ |
| Roots    | Tool parameters, resource URIs, or server config |
| Sampling | Direct LLM provider API integration              |
| Logging  | `stderr` for stdio; OpenTelemetry for structured |

### 6. JSON Schema 2020-12 for Tools (ENHANCED)

- Tool `inputSchema`/`outputSchema` lifted to full JSON Schema 2020-12 ([SEP-2106])
- Composition (`oneOf`, `anyOf`, `allOf`), conditionals, `$ref`/`$defs` supported
- Output schemas unrestricted
- Error code for missing resource changes from `-32002` to `-32602` ([SEP-2164])

### 7. List/Read Caching (NEW)

- `ttlMs` and `cacheScope` on list and resource read results ([SEP-2549])
- Clients know how long `tools/list` is fresh and whether cache is shareable
- Replaces SSE-based change notification pattern

### 8. W3C Trace Context (ENHANCED)

- `traceparent`, `tracestate`, `baggage` key names locked in spec ([SEP-414])
- Distributed traces correlate across SDKs and gateways

### 9. Multi Round-Trip Requests (ENHANCED)

- Server returns `InputRequiredResult` instead of holding SSE stream open ([SEP-2322])
- Client gathers answers and re-issues original call with `inputResponses`

## Decision

Proceed with a phased upgrade plan that tracks the Python MCP SDK release
timeline. Do not implement before SDK support ships — the SDK is the dependency
that gates all changes.

### Phase 0: Preparation (Now — SDK RC available)

Target: All groundwork done so upgrade is a SDK-bump + validation.

1. **Add `nextProtocolVersion` tracking field** to `compatibility.yaml`:

   ```yaml
   mcp:
     protocolVersion: "2025-11-25"
     nextProtocolVersion: "2026-07-28" # NEW — tracks RC readiness
     toolSchema: "1.0"
     registrySchema: "2025-12-11"
   ```

2. **Audit transport layer** — confirm `StreamableHTTP` is primary; gate SSE
   paths behind `legacy_sse` flag (already done — verify in tests).

3. **Evaluate long-running tools** against Tasks extension:
   - `run_drc`, `run_erc`, `export_manufacturing_package`, simulation, routing
   - Current pattern: `ctx.report_progress()` — non-standard, not cancellable
   - Tasks extension: server-directed task creation, client-driven
     progress/cancellation
   - **Recommendation**: Adopt Tasks extension for genuinely long operations
     (>30s). Keep progress reporting for short operations.

4. **Review tool annotations against new SEPs** — ensure read-only/destructive
   classification reflects 2026-07-28 annotation expansion.

5. **Review registry schema** — `"2025-12-11"` may need a version bump to
   align with new 2026-07-28 schema fields.

6. **Update `server_info.py`** — `SERVER_INFO_SCHEMA_VERSION` may need bump;
   review `get_server_info_contract()` for new fields.

### Phase 1: SDK Upgrade (SDK RC available — July 28, 2026)

1. **Update Python MCP SDK** to version supporting 2026-07-28.
2. **Update `compatibility.py`**: change `MCP_PROTOCOL_VERSION` to
   `"2026-07-28"`.
3. **Update `compatibility.yaml`**: change `protocolVersion` and update
   `nextProtocolVersion` to next draft or remove.
4. **Update protocol schemas** in `packages/protocol-schemas/` for any new
   fields in the server-info contract.
5. **Update transport layer**:
   - Add `Mcp-Method` and `Mcp-Name` headers (required by SEP-2243)
   - Remove `initialize`/`initialized` handshake (removed by SEP-2575)
   - Remove `Mcp-Session-Id` support (removed by SEP-2567)
   - Add `server/discover` response for capability discovery
   - Add `_meta` propagation for protocol version and client info
6. **Update `validate_mcp_manifest.py`** for 2026-07-28 schema validation.
7. **Update `check_compatibility_matrix.py`**: add 2026-07-28 protocol matrix
   entry.
8. **Add CI protocol contract checks** to the extension canary and the
   [oaslananka/kicad-mcp-pro](https://github.com/oaslananka/kicad-mcp-pro) server
   canary.

### Phase 2: Feature Adoption (Post SDK upgrade)

1. **Tasks extension**: Adopt for `run_drc`, `run_erc`,
   `export_manufacturing_package`, simulation, and routing.
   - Server-directed task creation for operations >30s
   - Client-driven progress polling and cancellation
2. **Caching headers**: Add `ttlMs` and `cacheScope` to list/resource responses.
3. **W3C Trace Context**: Align existing OpenTelemetry with spec key names.
4. **JSON Schema 2020-12**: Review tool input/output schemas for composition
   patterns (`oneOf`, `anyOf`) where applicable.
5. **Multi Round-Trip**: Evaluate for tools that need user confirmation
   (e.g., `mfg_check_import_support`, destructive operations).
6. **Error code update**: Change `-32002` to `-32602` for missing resource
   errors (SEP-2164).

### Phase 3: Post-Final (After July 28, 2026)

1. **Remove `nextProtocolVersion`** tracking from `compatibility.yaml`.
2. **Update documentation** — `docs/mcp/`, README, client config examples.
3. **SSE deprecation**: Phase out `legacy_sse` support.
4. **Auth hardening**: Evaluate OAuth 2.1/OIDC alignment for remote deployments.

## Files Requiring Changes

### Phase 0 (Now)

| File                                    | Change                                               |
| --------------------------------------- | ---------------------------------------------------- |
| `compatibility.yaml`                    | Add `nextProtocolVersion: "2026-07-28"` under `mcp:` |
| `docs/architecture/migration-phases.md` | Track this upgrade in migration roadmap              |
| `docs/support-matrix.md`                | Add 2026-07-28 protocol line                         |

### Phase 1 (SDK Upgrade)

| File                                         | Change                          |
| -------------------------------------------- | ------------------------------- |
| (in `oaslananka/kicad-mcp-pro`) `pyproject.toml` | Bump MCP SDK dependency version |

| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/compatibility.py` | Change `MCP_PROTOCOL_VERSION` to `"2026-07-28"` |

| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/server_info.py` | Update `SERVER_INFO_SCHEMA_VERSION`; review `get_server_info_contract()` |

| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/wellknown.py` | Update protocol version in well-known card |

| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/config.py` | Update transport config if SDK changes transport model |
| `packages/protocol-schemas/schemas/kicad-mcp-server-info.schema.json` | Update for new server-info fields |
| `packages/protocol-schemas/schemas/compatibility-manifest.schema.json` | Update for new MCP fields |
| (in `oaslananka/kicad-mcp-pro`) `scripts/validate_mcp_manifest.py` | Update validation logic for 2026-07-28 |
| (in `oaslananka/kicad-mcp-pro`) `scripts/check_compatibility_matrix.py` | Add 2026-07-28 matrix entry |
| `.github/workflows/vscode-canary.yml` and `oaslananka/kicad-mcp-pro` canary workflows | Add protocol contract check with new SDK |

### Phase 2 (Feature Adoption)

| File                                                   | Change                                 |
| ------------------------------------------------------ | -------------------------------------- |
| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/tools/*.py` | Tasks extension for long-running tools |

| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/tools/metadata.py` | Update annotations for new SEPs |

| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/tools/export.py` | Tasks: `export_manufacturing_package` |

| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/tools/validation.py` | Tasks: `run_drc`, `run_erc` |

| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/tools/simulation.py` | Tasks: simulation progress |

| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/tools/routing.py` | Tasks: routing progress |

| (in `oaslananka/kicad-mcp-pro`) `src/kicad_mcp/*.py` | JSON Schema 2020-12, caching, trace context |

## Consequences

- The repo maintains dual compatibility during Phase 0 — `2025-11-25` continues
  to work until SDK support ships.
- Phase 1 is gated on Python MCP SDK release — no work before then.
- Phase 2 is optional — Tasks adoption can be incremental, tool by tool.
- The repo's stateless HTTP foundation (already in place) reduces Phase 1
  transport rework vs. a pure-SSE codebase.
- `ctx.report_progress()` current usage is non-standard — it will need
  migration to Tasks extension or removal.
- Breaking change in tool schema (JSON Schema 2020-12) may affect tool
  definitions — review needed but non-urgent since current schemas are valid
  2020-12 subsets.

## Future Revisit

Revisit Phase 2 Tasks adoption after Phase 1 is complete and the SDK has
stabilized. MCP Apps (server-rendered UI) is low priority for a headless-first
product — only revisit if a client explicitly requires interactive tool
templates.

## References

- [SEP-2575]: Remove initialize/initialized handshake
- [SEP-2567]: Remove Mcp-Session-Id
- [SEP-2243]: Mcp-Method and Mcp-Name headers
- [SEP-2260]: Server-initiated requests during active processing only
- [SEP-2322]: Multi Round-Trip Requests (InputRequiredResult)
- [SEP-2549]: TTL and cache scope on list/resource results
- [SEP-414]: W3C Trace Context propagation in `_meta`
- [SEP-2133]: Extensions framework
- [SEP-1865]: MCP Apps
- MCP Tasks extension: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2663
- [SEP-2106]: JSON Schema 2020-12 for tools
- [SEP-2164]: Error code -32002 → -32602
- [SEP-2468]: OAuth iss parameter validation
- [SEP-837]: OpenID Connect application_type
- [SEP-2352]: Credential binding to authorization server
- [SEP-2207]: Refresh token requests
- [SEP-2350]: Scope accumulation
- [SEP-2351]: .well-known discovery
- [SEP-2577]: Feature lifecycle policy
- [SEP-2484]: Conformance suite requirement for Final status
- MCP SDK tier system: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1777
