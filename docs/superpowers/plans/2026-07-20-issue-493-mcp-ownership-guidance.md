# Issue 493 MCP Ownership Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Follow test-driven development and verification-before-completion.

**Goal:** Reconcile active MCP operational guidance with post-split repository ownership and enforce the distinction between active instructions, historical evidence, and migration guards.

**Architecture:** Extend the existing split-doc checker with path-role classification and active ownership rules. Rewrite only current operational documents; preserve historical and guard records. Add a dedicated root command and compose it into the existing forbidden-reference gate.

**Tech stack:** Node.js 24 ESM scripts, Node test runner, Markdown/VitePress docs, pnpm 11.

## Global constraints

- Work only on issue `#493`.
- Do not modify runtime/protocol implementation or compatibility values.
- Do not erase historical ADR/changelog/migration evidence.
- Do not remove intentional absence guards for retired package paths.
- Avoid files changed by open PR #501 unless required; `docs/integration/kicad-studio-mcp.md` is out of scope.
- Every new regression test must reference `#493`.
- Every non-trivial commit must include a DCO sign-off.

### Task 1: Lock the documentation-role policy with failing tests

**Files:**

- Modify: `scripts/check-mcp-split-docs.test.mjs`

- [x] Assert ADR 0008 is classified as active operational guidance.
- [x] Assert ADR 0009, changelogs, and dated superpowers plans are historical.
- [x] Assert protocol-schema/branch/workflow guard files are migration guards.
- [x] Assert stale active local paths and former repository wording are detected.
- [x] Assert canonical owner/artifact wording passes.
- [x] Assert a guard absence statement is not treated as active drift.
- [x] Assert root script wiring exposes `check:mcp-split-docs` and composes it into `check:forbidden-refs`.
- [x] Run the checker tests and verify RED because classification/rules/wiring are missing.

### Task 2: Implement role-aware MCP documentation validation

**Files:**

- Modify: `scripts/check-mcp-split-docs.mjs`
- Modify: `package.json`

- [x] Add explicit active operational and guard path policies.
- [x] Narrow ADR historical exemption so ADR 0008 is active.
- [x] Add active ownership/path rules with actionable owner hints.
- [x] Preserve the existing global stale-monorepo phrase rules.
- [x] Export a unified repository drift function and retain backward-compatible checker exports.
- [x] Add `check:mcp-split-docs` and compose it from `check:forbidden-refs`.
- [x] Run tests and verify that repository-state assertions remain RED only for actual stale docs.

### Task 3: Rewrite ADR 0008 by repository and artifact owner

**Files:**

- Modify: `docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md`

- [x] Refresh the current-state audit to distinguish extension, published contract, and KiCad MCP Pro surfaces.
- [x] Separate preparation, server/schema publication, extension activation, and post-final feature phases.
- [x] Replace removed local schema paths with KiCad MCP Pro source ownership and the published npm artifact.
- [x] Assign every file/task to this repository, KiCad MCP Pro, or a published artifact.
- [x] Document breaking-change release ordering and cross-repo evidence.
- [x] Keep the final protocol/SDK as activation gates and avoid claiming production support.

### Task 4: Correct active release, testing, compatibility, and product docs

**Files:**

- Modify: `docs/mcp/index.md`
- Modify: `docs/publishing.md`
- Modify: `docs/support-matrix.md`
- Modify: `docs/testing-strategy.md`
- Modify: `docs/architecture/product-boundaries.md`
- Modify: `docs/RELEASE-COORDINATION.md`
- Modify: `CONTRIBUTING.md`
- Modify: `scripts/check-ci-lanes.mjs`

- [x] Replace former repository shorthand with the canonical KiCad MCP Pro name/surface.
- [x] Clarify schema source/publisher versus npm consumer ownership.
- [x] Correct breaking-release ordering and workflow ownership.
- [x] Preserve current extension-owned compatibility and canary responsibilities.
- [x] Remove non-existent local MCP server commands from contributor guidance.
- [x] Run checker tests and repository-state validation to GREEN.

### Task 5: Verify and deliver

**Files:**

- Update this plan's completed checkboxes and PR evidence.

- [x] Run `corepack pnpm run check:mcp-split-docs`.
- [x] Run `corepack pnpm run check:forbidden-refs`.
- [x] Run docs generated-freshness, Markdown, links, and VitePress build.
- [x] Run compatibility, release, testing-strategy, and protocol checklist policy checks.
- [x] Run the broad root gate; it passed forbidden refs, boundaries, release, compatibility, supply chain, governance, branch protection, repeatable VSIX, fixtures, schemas, CI-lane, testing, regression, and protocol checks, then stopped at the pre-existing VPS-2 strict dev-doctor blocker tracked by #490 (Python 3.12 instead of 3.13 and missing `uv`).
- [x] Review the complete diff and run `git diff --check`.
- [x] Commit with DCO sign-off.
- [ ] Push and open a draft PR linked to `#493`.
- [ ] Watch all required checks to terminal state, address feedback, then mark ready.
