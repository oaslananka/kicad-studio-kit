# KiCad 10.0.5 Stable Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the verified final KiCad 10.0.5 release to the canonical stable patch baseline using checked-in canary evidence, without changing the KiCad 11 support boundary.

**Architecture:** Keep `compatibility.yaml` as the only machine-readable source of truth. Treat prerelease canaries as optional active metadata: once the preview becomes the verified stable baseline, retain its historical evidence document but remove the active `kicad.patchCanary` entry. Generate public support tables from the updated contract and validate all evidence paths and release URLs.

**Tech Stack:** Node.js 24, YAML, Node test runner, VitePress documentation generation, KiCad MCP Pro Python canary artifacts.

## Global Constraints

- The official final AppImage digest is `af65bb1fd5ee2730df860bc2a8c49f507a64c83c15c2ce13927eec74d38eba8f`.
- KiCad 10.0.5 must remain inside the existing `10.0.x` primary support line.
- KiCad 11 readiness and MCP `2026-07-28` production compatibility are out of scope.
- Historical 10.0.4 and 10.0.5 RC1 evidence must remain immutable.
- No direct dependency on KiCad MCP Pro source may be introduced.

---

### Task 1: Stable-baseline contract

**Files:**
- Modify: `scripts/check-compatibility-contract.test.mjs`
- Modify: `scripts/check-compatibility-contract.mjs`

**Interfaces:**
- Consumes: parsed `compatibility.yaml` metadata.
- Produces: `validateKiCadPatchBaseline({ compatibility, repoRoot })`, accepting a verified stable baseline with no active patch canary while retaining strict prerelease validation when one exists.

- [ ] **Step 1: Write failing tests** asserting stable `10.0.5`, matching feature-parity metadata, final evidence ownership, and absence of an active `patchCanary`.
- [ ] **Step 2: Run** `node --test scripts/check-compatibility-contract.test.mjs` and confirm failure is caused by the old 10.0.4/RC contract.
- [ ] **Step 3: Make active patch-canary validation conditional** while preserving all current checks whenever `kicad.patchCanary` exists.
- [ ] **Step 4: Re-run the focused tests** and keep them red until metadata/evidence are updated in Task 2.

### Task 2: Final-release evidence and canonical metadata

**Files:**
- Create: `docs/evidence/kicad-10-0-5/2026-07-26/summary.md`
- Modify: `compatibility.yaml`
- Rename: `docs/compatibility/kicad-10-0-4-feature-parity.md` to `docs/compatibility/kicad-10-0-5-feature-parity.md`

**Interfaces:**
- Consumes: official release digest and `/var/tmp/kicad-10.0.5-stable/canary/summary.json` evidence from KiCad MCP Pro commit `e3536e4a0c671e9e89ddbed996dd75fde7328120`.
- Produces: stable metadata with `latestVerified` and parity baseline `10.0.5`, official release URLs, and checked-in final canary evidence.

- [ ] **Step 1: Check in a concise evidence summary** with artifact digest, host, command, 31-step result, intentional Allegro skip, semantic results, and deterministic evidence-bundle digest.
- [ ] **Step 2: Promote compatibility metadata** to 10.0.5 and remove active RC canary metadata.
- [ ] **Step 3: Update the parity document** to the 10.0.5 baseline while retaining links to the historical RC1 evidence.
- [ ] **Step 4: Run focused contract tests** and confirm they pass.

### Task 3: Generated and operational documentation

**Files:**
- Modify: `docs/support-matrix.md`
- Modify: `docs/testing-strategy.md`
- Modify: `docs/compatibility/kicad-10-to-11-migration.md`
- Modify: `docs/.vitepress/config.mts`

**Interfaces:**
- Consumes: the updated `compatibility.yaml` and final evidence summary.
- Produces: public support surfaces consistently identifying 10.0.5 as the latest verified stable patch, without promoting KiCad 11.

- [ ] **Step 1: Update non-generated prose and navigation** from 10.0.4/RC preview wording to final 10.0.5 evidence.
- [ ] **Step 2: Run** `corepack pnpm run docs:generate` to refresh machine-owned tables.
- [ ] **Step 3: Run** `corepack pnpm run check:compatibility-contract` and `corepack pnpm run check:docs-site`.

### Task 4: Repository verification and delivery

**Files:**
- Review all changed files from Tasks 1-3.

**Interfaces:**
- Consumes: completed stable-baseline promotion.
- Produces: merge-ready PR closing #558.

- [ ] **Step 1: Run** `git diff --check`, formatting, lint, typecheck, build, unit/security/accessibility tests, and package validation through the repository pre-push gate.
- [ ] **Step 2: Commit** with an allowed repository scope and `Closes #558`.
- [ ] **Step 3: Push, open the PR, wait for all required checks, squash merge, and synchronize canonical `main`.
