# Monorepo Migration Phases

This checklist tracks the monorepo foundation work in reviewable phases. Each phase must leave the repository buildable.

## Phase M0.1 - Canonical topology

- [x] Keep one canonical GitHub repository.
- [x] Preserve VS Code extension root at `apps/vscode-extension`.
- [x] Preserve Python MCP server root at `packages/mcp-server`.
- [x] Preserve npm launcher root at `packages/mcp-npm`.
- [x] Document the topology in `docs/architecture/repo-structure.md`.

Related issues: #49, #56, #63.

## Phase M0.2 - Product boundaries

- [x] Document allowed and forbidden dependencies.
- [x] Add CODEOWNERS for product workspaces.
- [x] Add a root boundary checker.
- [x] Run boundary checks in CI metadata.

Related issues: #50, #64.

## Phase M0.3 - Product-scoped commands

- [x] Add root commands for extension check/test/build/package.
- [x] Add root commands for MCP server check/test/build/package.
- [x] Add root command for npm wrapper validation.
- [x] Document local workflows in `CONTRIBUTING.md`.

Related issues: #51, #59.

## Phase M0.4 - Release model

- [x] Keep release metadata per product workspace.
- [x] Keep publish workflows separate by target registry.
- [x] Add compatibility/version checks before release.
- [x] Document release ownership and external setup.

Related issues: #52, #87.

M0 completion evidence: [M0 completion audit](m0-completion-audit.md).

## Phase M1+ - Shared test assets

- [ ] Add dedicated KiCad fixture corpus.
- [ ] Add protocol schema package if generated schemas need shared ownership.
- [ ] Add shared cross-product test harness.
- [ ] Add full real-pair E2E contract tests.

Related issues: #37, #53, #54, #55, #76.

## Phase M2 - MCP 2026-07-28 Protocol Upgrade

- [x] Add `nextProtocolVersion: "2026-07-28"` tracking field to `compatibility.yaml`
- [x] Create ADR 0008 with phased upgrade plan
- [x] Surface `2026-07-28` as the tracked next protocol line in `docs/support-matrix.md`
- [ ] P0: Update transport layer — `Mcp-Method`/`Mcp-Name` headers, remove session handshake
- [ ] P0: Add `server/discover` response for capability discovery
- [ ] P1: Bump MCP Python SDK when RC with 2026-07-28 support ships
- [ ] P1: Update protocol version in `compatibility.py`, `server_info.py`, schemas
- [ ] P1: Add CI protocol contract check against 2026-07-28
- [ ] P2: Adopt Tasks extension for long-running tools (DRC, ERC, export, simulation, routing)
- [ ] P2: Add `ttlMs`/`cacheScope` to list/resource responses
- [ ] P2: Update tool schemas to JSON Schema 2020-12
- [ ] P3: Phase out legacy SSE transport
- [ ] P3: Evaluate OAuth 2.1/OIDC auth hardening for remote deployments

Related issues: #197, ADR 0008.
