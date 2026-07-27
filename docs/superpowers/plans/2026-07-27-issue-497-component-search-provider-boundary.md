# Component Search Provider Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Component Search remote-provider, cache, and fallback ordering from the VS Code webview service.

**Architecture:** Add a pure coordinator that accepts structural provider/cache adapters, a cache-key function, LCSC availability, Octopart warning callback, and local/PCM fallback callbacks. Keep VS Code configuration, notifications, provider construction, local library mapping, PCM mapping, webviews, and commands in `componentSearch.ts`.

**Tech Stack:** TypeScript, Jest, VS Code extension APIs, repository architecture graph checks.

## Global Constraints

- Preserve source selection, result concatenation, cache semantics, Octopart-only warnings, LCSC fallback, local fallback, and PCM fallback order.
- Preserve the existing duplicate LCSC retry when both selected remote sources return no results and LCSC is enabled.
- The coordinator must not import `vscode`, Node built-ins, concrete providers, cache classes, library indexers, or PCM services.
- Keep this phase separate from local-library/PCM result mapping and broad shared type ownership.

---

### Task 1: Lock provider/cache/fallback behavior

**Files:**
- Create: `apps/vscode-extension/test/unit/componentSearchProviders.test.ts`
- Create: `apps/vscode-extension/src/components/componentSearchProviders.ts`

**Interfaces:**
- Produces: `searchComponentProviders(query, sources, adapters)`.
- Produces: `ComponentSearchSource` and structural adapter interfaces.
- Consumes: `ComponentSearchResult` only.

- [x] **Step 1: Write failing direct tests**

Cover cache hits, selected provider ordering, empty-result caching, Octopart Error/non-Error warnings, silent LCSC failure, enabled/disabled LCSC fallback, duplicate LCSC retry, local fallback, PCM fallback, and short-circuit behavior.

- [x] **Step 2: Run the direct test and verify red**

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false test/unit/componentSearchProviders.test.ts
```

Expected: module resolution failure.

- [x] **Step 3: Implement the pure coordinator**

Keep cache reads outside the provider try/catch and provider search plus cache writes inside it to preserve current error semantics.

- [x] **Step 4: Run direct tests and verify green**

Run the same Jest command and require all cases to pass.

### Task 2: Integrate the coordinator

**Files:**
- Modify: `apps/vscode-extension/src/components/componentSearch.ts`
- Modify: `apps/vscode-extension/test/unit/componentSearch.test.ts`

**Interfaces:**
- Consumes: `searchComponentProviders()` and `ComponentSearchSource`.
- Preserves: `ComponentSearchService.searchQuery()` public signature and provider behavior.

- [x] **Step 1: Delegate `searchQuery()` to the coordinator**

Pass concrete providers/cache, `ComponentSearchCache.buildKey`, the LCSC setting, warning adapter, and bound local/PCM callbacks.

- [x] **Step 2: Remove the private remote cache method and its private-method test**

Keep cache-class TTL/eviction tests and replace remote coordination coverage with direct coordinator tests.

- [x] **Step 3: Run focused compatibility gates**

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false test/unit/componentSearchProviders.test.ts test/unit/componentSearch.test.ts test/unit/componentSearchRanking.test.ts test/unit/componentSearchView.test.ts
corepack pnpm --filter kicadstudiokit run lint
corepack pnpm --filter kicadstudiokit run typecheck
```

### Task 3: Enforce architecture and documentation

**Files:**
- Modify: `scripts/check-vscode-architecture.test.mjs`
- Modify: `docs/architecture/vscode-hotspots.md`

- [x] **Step 1: Add a dependency allowlist**

Require `componentSearchProviders.ts` to depend only on `types.ts` and reject VS Code/Node imports.

- [x] **Step 2: Update module/line counts and ownership**

Record the remote/cache/fallback coordinator and remaining service responsibilities.

- [x] **Step 3: Run architecture and docs gates**

```bash
corepack pnpm run check:vscode-architecture
corepack pnpm run check:docs-site
```

### Task 4: Verify and publish

- [x] **Step 1: Run the full extension validation host**

```bash
bash scripts/run-validation-host.sh corepack pnpm --filter kicadstudiokit run check
```

- [x] **Step 2: Review and commit the phase-scoped diff**

Use a conventional commit without an umbrella issue reference.

- [x] **Step 3: Run full repository pre-push and publish the branch**

- [ ] **Step 4: Open a phase-scoped PR, wait for every required/external check, squash merge only when CLEAN, sync canonical main, and update the umbrella issue manually.**
