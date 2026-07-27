# Component Search Ranking Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic Component Search result presentation, confidence ranking, and BOM recommendation construction from the VS Code service.

**Architecture:** Add a pure `componentSearchRanking.ts` module that consumes shared component/BOM types and Component Search view contracts. Keep provider access, caching, filesystem parsing, webview orchestration, and VS Code localization in `componentSearch.ts`; pass localized message functions and locale into the pure boundary.

**Tech Stack:** TypeScript, Jest, VS Code extension APIs, repository architecture graph checks.

## Global Constraints

- Preserve existing rendered search metadata and recommendation behavior.
- The new module must not import `vscode`, Node built-ins, provider clients, cache implementations, or filesystem APIs.
- Existing `ComponentSearchService` and `componentSearch.ts` exports must remain compatible.
- Keep this phase separate from provider/network orchestration and broad `types.ts` / `constants.ts` ownership changes.

---

### Task 1: Lock the ranking and recommendation contract

**Files:**
- Create: `apps/vscode-extension/test/unit/componentSearchRanking.test.ts`
- Create: `apps/vscode-extension/src/components/componentSearchRanking.ts`

**Interfaces:**
- Produces: `buildComponentSearchViewResults(results, query, options)`.
- Produces: `buildComponentSearchRecommendation(entry, projectContext, messages)`.
- Consumes: `BomEntry`, `ComponentSearchResult`, `ComponentSearchProjectContext`, `ComponentSearchRecommendation`, and `ComponentSearchViewResult`.

- [x] **Step 1: Write failing direct tests**

Cover inventory aggregation and locale formatting, stock/no-data states, footprint/category fallback, datasheet labels, exact/partial/local/token confidence, low confidence, MPN/LCSC/value-footprint recommendation precedence, compact footprint handling, and empty recommendation rejection.

- [x] **Step 2: Run the direct test and verify red**

Run:

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false test/unit/componentSearchRanking.test.ts
```

Expected: module resolution failure for `componentSearchRanking.ts`.

- [x] **Step 3: Implement the pure model**

Implement deterministic transformations without importing VS Code or I/O modules.

- [x] **Step 4: Run the direct test and verify green**

Run the same Jest command. Expected: all ranking/recommendation tests pass.

### Task 2: Integrate the pure boundary into the service

**Files:**
- Modify: `apps/vscode-extension/src/components/componentSearch.ts`
- Test: `apps/vscode-extension/test/unit/componentSearch.test.ts`

**Interfaces:**
- Consumes: the two pure functions from Task 1.
- Preserves: existing service methods, inline rendering, localized strings, and recommendation parsing.

- [x] **Step 1: Replace private transforms with pure calls**

Keep `vscode.env.language` and `vscode.l10n.t` in the service and pass their outputs/functions into the pure module.

- [x] **Step 2: Remove obsolete helper functions**

Remove `formatAvailability`, `formatFootprintMatch`, `estimateConfidence`, and `compactFootprint` from `componentSearch.ts` after all consumers migrate.

- [x] **Step 3: Run focused service compatibility tests**

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false test/unit/componentSearchRanking.test.ts test/unit/componentSearch.test.ts test/unit/componentSearchView.test.ts
corepack pnpm --filter kicadstudiokit run lint
corepack pnpm --filter kicadstudiokit run typecheck
```

Expected: all tests and static checks pass.

### Task 3: Make the boundary architectural and documented

**Files:**
- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/architecture/vscode-hotspots.md`

**Interfaces:**
- Produces: a permanent dependency allowlist for `componentSearchRanking.ts`.
- Updates: production module count and Component Search ownership/line counts.

- [x] **Step 1: Add the dependency regression test**

Require the new module to depend only on `types.ts` and `components/componentSearchView.ts`, with no `vscode` or `node:` imports.

- [x] **Step 2: Update architecture documentation**

Record the service/model split and actual line/module counts from the checked-in tree.

- [x] **Step 3: Run architecture and docs gates**

```bash
corepack pnpm run check:vscode-architecture
corepack pnpm run check:docs-site
```

Expected: updated module count, zero cycles, dependency allowlist, links, generated docs, and bundle budgets pass.

### Task 4: Verify and publish the phase

**Files:**
- Modify: this plan checklist only after evidence exists.

- [x] **Step 1: Run the full extension validation host**

```bash
bash scripts/run-validation-host.sh corepack pnpm --filter kicadstudiokit run check
```

- [x] **Step 2: Review and commit the phase-scoped diff**

Use a conventional commit without an issue reference in its subject/body so the umbrella issue remains open.

- [ ] **Step 3: Run the repository pre-push hook and publish the branch**

```bash
git push -u origin refactor/497-component-search-ranking-boundary
```

- [ ] **Step 4: Open a phase-scoped PR, wait for every required and external check, squash merge only when CLEAN, sync canonical main, and update the umbrella issue manually.**
