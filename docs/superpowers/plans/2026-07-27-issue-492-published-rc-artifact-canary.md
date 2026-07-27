# Issue 492 Published RC Artifact Canary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that the published `kicad-mcp-pro` release-candidate compatibility lane accepts KiCad Studio's expected stateless `2026-07-28` envelope without making the target protocol production-selectable.

**Architecture:** Add a small pure request/response contract module and a CLI canary that launches the published PyPI artifact in its opt-in `2026-07-28-rc` lane. Wire the CLI into the existing cross-repository workflow after the PyPI install smoke, and record dated evidence while preserving `compatibility.yaml` state `blocked`, active protocol `2025-11-25`, and ADR 0008 status `Proposed`.

**Tech Stack:** Node.js 24, Node test runner, Fetch API, child processes, GitHub Actions, uv, published PyPI artifacts.

## Global Constraints

- Keep `2025-11-25` as the only production-selectable protocol.
- Do not add `2026-07-28` to `SUPPORTED_MCP_PROTOCOL_VERSIONS`.
- Treat `2026-07-28-rc` as an opt-in artifact canary, not a final compatibility claim.
- Launch only a stable semver `kicad-mcp-pro` package from PyPI; do not use a source checkout.
- Prove `server/discover`, `tools/list`, statelessness, routing headers, request `_meta`, result metadata, TTL, and cache scope.
- Keep the final specification, stable SDK v2, final schema, production adapter, final real-pair, and ADR acceptance blockers open.

---

### Task 1: Define the candidate request and response contract with TDD

**Files:**

- Create: `scripts/mcp-2026-rc-artifact-canary.test.mjs`
- Create: `scripts/lib/mcp-2026-rc-artifact-canary.mjs`

**Interfaces:**

- Produces: `buildMcp2026RcRequest({ id, method, params, clientInfo })` returning `{ headers, payload }`.
- Produces: `validateMcp2026RcDiscover({ json, headers, expectedServerVersion })`.
- Produces: `validateMcp2026RcToolsList({ json, headers, expectedServerVersion })`.
- Produces: `assertStablePackageVersion(version)`.

- [x] Write tests proving exact protocol/version/routing headers, `_meta` composition, named-method `Mcp-Name`, and absence of `MCP-Session-Id`.
- [x] Write tests proving stable semver acceptance and prerelease rejection.
- [x] Write tests proving discover validation requires `2026-07-28`, `complete`, private caching, server identity/version, and no session header.
- [x] Write tests proving tools-list validation requires a non-empty tool array, deterministic names, result metadata, and no session header.
- [x] Run `node --test scripts/mcp-2026-rc-artifact-canary.test.mjs` and verify RED because the contract module does not exist.
- [x] Implement the minimal pure module.
- [x] Re-run the focused test and verify GREEN.

### Task 2: Add the published-artifact CLI canary and workflow wiring

**Files:**

- Create: `scripts/check-mcp-2026-rc-artifact.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/cross-repo-compatibility.yml`
- Modify: `scripts/mcp-2026-rc-artifact-canary.test.mjs`

**Interfaces:**

- Consumes: Task 1 contract functions.
- Produces: CLI `node scripts/check-mcp-2026-rc-artifact.mjs --version <stable-semver>`.

- [x] Extend tests to require the root package script and workflow step, including `steps.pypi-check.outputs.pypi_version` as the selected artifact version.
- [x] Run the focused test and verify RED because CLI/package/workflow wiring is absent.
- [x] Implement a fail-closed CLI that resolves `uv`, allocates an ephemeral loopback port, launches the exact PyPI version with `KICAD_MCP_PROTOCOL_LANE=2026-07-28-rc`, waits for readiness, sends `server/discover` and `tools/list`, validates both responses, and terminates the child process.
- [x] Add `check:mcp-2026-rc-artifact` to `package.json`.
- [x] Add the workflow step immediately after the PyPI install smoke.
- [x] Re-run focused tests and verify GREEN.
- [x] Run `/var/lib/exec-agent/.local/bin/uv` through the CLI against `kicad-mcp-pro==3.29.1` and verify the published artifact passes.

### Task 3: Record evidence without activating production

**Files:**

- Modify: `docs/evidence/mcp-2026-07-28/2026-07-27-preflight.md`
- Modify: `docs/superpowers/plans/2026-07-27-issue-492-published-rc-artifact-canary.md`

**Interfaces:**

- Consumes: successful Task 2 artifact output and manual workflow run `30300849797`.
- Produces: dated evidence that distinguishes published RC-lane proof from final activation evidence.

- [x] Record `kicad-mcp-pro` `3.29.1`, its PyPI/GitHub release publication, the successful `server/discover` and `tools/list` canary, and the existing schema package state.
- [x] Update blockers to distinguish completed RC artifact proof from missing final specification, stable SDK v2, final schema claim, production adapter, final real-pair, and ADR acceptance.
- [x] Assert in prose that `compatibility.yaml` remains `blocked` and `SUPPORTED_MCP_PROTOCOL_VERSIONS` remains `['2025-11-25']`.
- [x] Run docs formatting/link/bundle checks (search index 611.7/625.0 kB).

### Task 4: Validate, review, and publish the phase

**Files:**

- Update this plan with exact validation evidence.

- [x] Run `node --test scripts/mcp-2026-rc-artifact-canary.test.mjs` (10/10 passed, including Unicode `Mcp-Name` encoding).
- [x] Run `corepack pnpm run check:mcp-2026-rc-artifact -- --version 3.29.1` with `UV=/var/lib/exec-agent/.local/bin/uv` (24 tools; stateless private-cache responses).
- [x] Run `corepack pnpm run check:compatibility-contract` and `corepack pnpm run check:protocol-schemas`.
- [x] Run architecture, docs, format, and workflow-policy gates (160 production modules, 0 cycles).
- [x] Run the full repository pre-push chain on implementation commit `eba5825`.
- [x] Commit with DCO sign-off and open phase-scoped PR 578 without auto-closing issue 492.
- [ ] Merge only after all required and external checks pass with zero open Sonar findings.
- [ ] Update issue 492, keeping the final activation and ADR acceptance criteria open.
