---
search: false
---

# MCP 2026-07-28 — published artifact activation readiness checkpoint

Date: 2026-10-20

Status: **Production activation blocked. Evidence review only.**

## Verified published inputs

- **Specification:** final `2026-07-28`, [published MCP specification](https://modelcontextprotocol.io/specification/2026-07-28).
- **Python SDK:** stable `mcp==2.2.0` from PyPI, consumed by `kicad-mcp-pro==4.3.0` under the published dependency range `mcp[cli]>=2.2.0,<3.0.0`. This is the server SDK, not the Studio client runtime.
- **npm protocol schemas:** published `@oaslananka/kicad-protocol-schemas@2.0.0`, used in both Studio package manifests and the pnpm lockfile without bypassing the seven-day minimum release age.
- **Server:** published and signed PyPI `kicad-mcp-pro==4.3.0`, GitHub source tag `mcp-server-v4.3.0` at `282c7499f67457bb247d2390379410f05e96a3e8`. Both wheel and sdist passed independent PyPI publisher signature verification, SHA-256 comparison with the GitHub Release, and GitHub-signed CycloneDX SBOM attestation matching the source tag and workflow; [recorded evidence](https://github.com/oaslananka/kicad-studio-kit/issues/777#issuecomment-6290023968).
- **Published server final protocol:** KiCad MCP Pro ADR-0006 and server issue #924 record native SDK v2 and the public `2026-07-28` contract. The retained `2026-07-28-rc` server selector is an optional strict conformance profile, not the public protocol revision.

## Exact-reviewed Studio acceptance

All PRs below were merged after required checks and confirmed successful on the **exact merge SHA**, not just a PR head:

| Gate                                                                                | Source review and evidence                                                                                                          | Result                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Published schema and final client envelope                                          | [PR #806](https://github.com/oaslananka/kicad-studio-kit/pull/806)                                                                  | Passed                            |
| Negative tool/header contracts                                                      | [PR #807](https://github.com/oaslananka/kicad-studio-kit/pull/807), [#808](https://github.com/oaslananka/kicad-studio-kit/pull/808) | Passed                            |
| Published mixed-peer VS Code Extension Host                                         | [PR #809](https://github.com/oaslananka/kicad-studio-kit/pull/809)                                                                  | Passed                            |
| MRTR rejection, invalid discovery, HTTP failures and timeout                        | [PR #810](https://github.com/oaslananka/kicad-studio-kit/pull/810)                                                                  | Passed                            |
| Signed PyPI artifact provenance enforced in CI                                      | [PR #811](https://github.com/oaslananka/kicad-studio-kit/pull/811)                                                                  | Passed                            |
| Published 2026 to 2025 isolated rollback and metadata/session isolation             | [PR #812](https://github.com/oaslananka/kicad-studio-kit/pull/812)                                                                  | Passed                            |
| Published final GA on normal server protocol lane, strict canary, and 2025 fallback | [PR #813](https://github.com/oaslananka/kicad-studio-kit/pull/813), `main@fb1170bdd3d7985ed8c4c3a118f511409ea8befc`                 | Passed, 10/10 postmerge workflows |

Final published server `4.3.0` completed the real Studio adapter/transport test with **24 tools in each of three lanes**: normal final 2026 stateless, strict final 2026 canary stateless, and legacy 2025 session; each completed a read-only `kicad_get_version` call and refused an unknown tool. These tests use `KICAD_MCP_STATEFUL_HTTP=0` for both 2026 lanes; they do **not** prove every default HTTP configuration is stateless or a VSIX release is ready.

## Production cutover is still blocked

1. **Studio adapter registry:** the compiled final adapter is intentionally nonselectable; the product currently selects `2025-11-25`. Production registration, full client integration and protected tests must happen in the coordinated activation change.
2. **Version support promise:** Studio still advertises `>=3.5.2 <5.0.0` as a compatible MCP server range. That includes older servers without the published native 2026 contract. Do not activate final 2026 against this old range; either narrow the new active-protocol minimum to reviewed published 4.3.0, or implement and prove safe version-aware client negotiation before enabling it.
3. **Production switch and rollback:** isolated 2026-to-2025 Host recovery is proven, but the actual production adapter selection, default Studio extension lifecycle, protected cross-platform CI, and versioned product rollback/metadata are not yet accepted together.
4. **Source versus published release:** signing, extension VSIX packaging, support docs and Marketplace publication require a separate release decision after activation gates are complete. There was no release in the acceptance PR series.

`compatibility.yaml` **continues to declare `2025-11-25` active and `2026-07-28` blocked**; ADR 0008 remains Proposed. This record fills factual evidence fields without granting permission to turn on the final adapter. Keep [issue #777](https://github.com/oaslananka/kicad-studio-kit/issues/777) OPEN until the production cutover and release gates are independently passed.
