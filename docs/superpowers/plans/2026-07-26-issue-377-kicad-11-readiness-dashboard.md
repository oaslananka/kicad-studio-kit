# KiCad 11 Readiness Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make KiCad 11 readiness a generated, reviewable product surface without promoting KiCad 11 before an official RC/stable canary passes.

**Architecture:** Keep `compatibility.yaml.kicadIpcReadiness` as the only machine-readable source of truth. A small pure library validates and renders the dashboard. The existing docs generator writes `docs/compatibility/kicad-11-readiness-dashboard.md`; the compatibility contract rejects incomplete dimensions, invalid states, missing evidence, or premature promotion claims.

**Tech Stack:** Node.js 24, YAML, Node test runner, VitePress documentation generation.

## Global Constraints

- KiCad 10.0.5 remains the primary release-blocking baseline.
- The upstream KiCad 11 line is still nightly-only as of 2026-07-26; no RC/stable support claim is allowed.
- Production `pcbnew` / SWIG usage remains forbidden and the visible claim must point to the official deprecation/removal source.
- KiCad MCP Pro owns native CLI/IPC canary execution; this repository owns extension UX, client compatibility metadata, generated docs, and published-artifact integration gates.
- No source dependency on KiCad MCP Pro may be introduced.

---

### Task 1: Dashboard contract and red tests

**Files:**

- Create: `scripts/kicad-11-readiness-dashboard.test.mjs`
- Create: `scripts/lib/kicad-11-readiness-dashboard.mjs`
- Modify: `scripts/check-compatibility-contract.mjs`

**Interfaces:**

- `validateKiCad11Readiness({ compatibility, repoRoot }) -> string[]`
- `renderKiCad11ReadinessDashboard(compatibility) -> string`

- [ ] Write failing tests for required readiness dimensions, allowed states, evidence ownership, no-production-SWIG claim, snapshot contract, same-day checklist, and generated markdown.
- [ ] Confirm the test fails because the library and metadata do not exist.
- [ ] Implement the pure validator/renderer and compose it into `check:compatibility-contract`.
- [ ] Keep the focused tests red until Task 2 provides complete metadata.

### Task 2: Machine-readable KiCad 11 readiness state

**Files:**

- Modify: `compatibility.yaml`

**Interfaces:**

- Consumes official KiCad nightly/RC and PCB Python binding documentation.
- Produces explicit overall state, six readiness dimensions, SWIG guard claim, CLI snapshot requirements, and stable-release checklist.

- [ ] Refresh `kicadIpcReadiness.reviewed` to 2026-07-26.
- [ ] Record upstream state as nightly and promotion state as blocked.
- [ ] Add CLI, IPC, VS Code UX, MCP integration, tests, and docs dimensions with owners, evidence, and blockers.
- [ ] Add required critical-command snapshot definitions for the first KiCad 11 canary.
- [ ] Add the same-day stable-release compatibility checklist.
- [ ] Run focused tests and compatibility contract.

### Task 3: Generated documentation and navigation

**Files:**

- Modify: `scripts/generate-docs-site.mjs`
- Generate: `docs/compatibility/kicad-11-readiness-dashboard.md`
- Modify: `docs/.vitepress/config.mts`
- Modify: `docs/compatibility/kicad-10-to-11-migration.md`
- Modify: `docs/support-matrix.md`

**Interfaces:**

- Consumes the validated readiness contract.
- Produces a generated public dashboard with no hand-maintained status duplication.

- [ ] Wire the renderer into `docs:generate`.
- [ ] Add dashboard navigation and links from the migration guide/support matrix.
- [ ] Generate docs and verify generated freshness, markdown, links, VitePress build, and bundle budget.

### Task 4: Delivery

**Files:**

- Review all changed files.

- [ ] Run `git diff --check`, focused tests, compatibility contract, forbidden-reference guard, docs site gate, and full pre-push repository gate.
- [ ] Commit with an allowed scope and `Refs #377` without closing the tracker.
- [ ] Push, open the PR, resolve review findings, wait for all required checks, squash merge, and synchronize canonical `main`.
