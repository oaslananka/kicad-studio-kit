# Issue #531 Bundle Chunk Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the optional ExcelJS and documentation-search chunks while preserving activation behavior, search quality, packaging reproducibility, and performance budgets.

**Architecture:** Keep the existing lazy boundaries. Import only ExcelJS's Node Workbook constructor for XLSX export, and render a smaller VitePress local-search index that excludes repository-internal plans and code blocks. Enforce measured per-class documentation chunk limits after every docs build.

**Tech Stack:** TypeScript 6, Webpack 5, ExcelJS 4.4, VitePress 1.6, Node test runner, Jest, pnpm 11.

## Global Constraints

- Do not add a new runtime dependency.
- Keep the Webpack target `node` and output `commonjs2`.
- Keep ExcelJS outside the initial extension chunk.
- Keep local documentation search enabled and lazy.
- Local-search JavaScript must not exceed 625,000 bytes.
- Other documentation JavaScript chunks must not exceed 500,000 bytes.
- Preserve the repeatable VSIX and all existing performance budgets.
- Inspect every bot and agent finding before merge.

---

### Task 1: Narrow the lazy ExcelJS entry

**Files:**

- Modify: `apps/vscode-extension/src/bom/bomExporter.ts`
- Create: `apps/vscode-extension/src/types/exceljs-workbook.d.ts`
- Create: `apps/vscode-extension/test/unit/bomExporter.test.ts`
- Create: `apps/vscode-extension/scripts/bundle-import-policy.test.mjs`
- Modify: `apps/vscode-extension/package.json`

**Interfaces:**

- Consumes: ExcelJS `Workbook` constructor and `BomEntry`.
- Produces: unchanged `BomExporter.exportXlsx(entries, outputFile): Promise<string>` and lazy chunk `dist/exceljs.js`.

- [ ] **Step 1: Write failing behavior and source-policy tests**

Create an XLSX export test that reopens the file with the public ExcelJS API and
asserts the header and first data row. Add a Node source-policy test requiring
`exceljs/lib/doc/workbook.js`, the `webpackChunkName: "exceljs"` marker, and no
runtime dynamic import of the broad `exceljs` root.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false test/unit/bomExporter.test.ts
node --test apps/vscode-extension/scripts/bundle-import-policy.test.mjs
```

Expected: the source-policy test fails because the broad root entry is still
present.

- [ ] **Step 3: Implement the narrow memoized loader**

Declare `exceljs/lib/doc/workbook.js` as the public `Workbook` constructor type,
dynamically import it with the existing chunk name, normalize the CommonJS
default export, and construct it in `exportXlsx()`.

- [ ] **Step 4: Run focused tests, typecheck, and production build**

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false test/unit/bomExporter.test.ts
node --test apps/vscode-extension/scripts/bundle-import-policy.test.mjs
corepack pnpm --filter kicadstudiokit run typecheck
corepack pnpm --filter kicadstudiokit run build
corepack pnpm --filter kicadstudiokit run check:bundle-size
```

Expected: all tests pass and `dist/exceljs.js` is approximately 461 kB while
`dist/extension.js` remains approximately 742 kB.

- [ ] **Step 5: Commit**

```bash
git add apps/vscode-extension/src/bom/bomExporter.ts \
  apps/vscode-extension/src/types/exceljs-workbook.d.ts \
  apps/vscode-extension/test/unit/bomExporter.test.ts \
  apps/vscode-extension/scripts/bundle-import-policy.test.mjs \
  apps/vscode-extension/package.json
git commit -m "perf(kicad-studio): narrow the lazy ExcelJS chunk"
```

### Task 2: Reduce and enforce the documentation search chunk

**Files:**

- Create: `scripts/lib/docs-search-index.mjs`
- Create: `scripts/docs-search-index.test.mjs`
- Create: `scripts/check-docs-bundle-size.mjs`
- Create: `scripts/check-docs-bundle-size.test.mjs`
- Modify: `docs/.vitepress/config.mts`
- Modify: `package.json`

**Interfaces:**

- Produces: `renderDocsSearchContent(src, env, markdownRenderer): string`.
- Produces: `validateDocsBundle(rootDir): { assets, errors }`.

- [ ] **Step 1: Write failing search-renderer and bundle-policy tests**

Cover `search: false`, `superpowers/` exclusion, deterministic `<pre>` removal,
malformed HTML fallback, one valid local-search asset, oversized local-search
failure, and oversized ordinary chunk failure.

- [ ] **Step 2: Run tests and verify failure**

```bash
node --test scripts/docs-search-index.test.mjs scripts/check-docs-bundle-size.test.mjs
```

Expected: failure because the helper and checker modules do not exist.

- [ ] **Step 3: Implement search rendering and measured limits**

Create the deterministic renderer and bundle checker. Configure VitePress local
search to use the renderer, set `chunkSizeWarningLimit: 625`, and run the checker
after every repository docs build.

- [ ] **Step 4: Run focused tests and documentation build**

```bash
node --test scripts/docs-search-index.test.mjs scripts/check-docs-bundle-size.test.mjs
corepack pnpm run check:docs-site
```

Expected: tests pass, build emits no oversized-chunk warning, local search is at
or below 625,000 bytes, and all other JavaScript chunks are below 500,000 bytes.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/docs-search-index.mjs scripts/docs-search-index.test.mjs \
  scripts/check-docs-bundle-size.mjs scripts/check-docs-bundle-size.test.mjs \
  docs/.vitepress/config.mts package.json
git commit -m "perf(docs): bound the local search index"
```

### Task 3: Record final measurements and run release-confidence gates

**Files:**

- Modify: `apps/vscode-extension/scripts/bundle-size-baseline.json`
- Modify: `docs/performance-baselines.md`
- Modify: `docs/superpowers/specs/2026-07-23-issue-531-bundle-chunk-optimization-design.md`

**Interfaces:**

- Consumes: production build, docs build, package, and performance artifacts.
- Produces: reviewable before/after evidence and final bundle baseline.

- [ ] **Step 1: Build and package final artifacts**

```bash
corepack pnpm --filter kicadstudiokit run build
corepack pnpm --filter kicadstudiokit run package
corepack pnpm --filter kicadstudiokit run check:bundle-size
corepack pnpm run check:repeatable-vsix
corepack pnpm run check:docs-site
corepack pnpm --filter kicadstudiokit run test:perf
```

Expected: all commands pass with deterministic package output and no performance
regression.

- [ ] **Step 2: Record exact final sizes and ratios**

Update the baseline and performance documentation with raw, gzip, and Brotli
measurements, build times, VSIX size, percentage reductions, and retained-limit
justification.

- [ ] **Step 3: Run the full pinned repository gate**

```bash
bash scripts/run-validation-host.sh corepack pnpm run check
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/vscode-extension/scripts/bundle-size-baseline.json \
  docs/performance-baselines.md \
  docs/superpowers/specs/2026-07-23-issue-531-bundle-chunk-optimization-design.md
git commit -m "docs(repo): record bundle optimization evidence"
```

### Task 4: Publish and review the PR

**Files:**

- No additional repository files unless a bot or scanner finding requires a fix.

- [ ] **Step 1: Ensure a GitHub-verified signed final history**

Create a GitHub-signed commit with the validated tree if local commits are not
verified under the repository ruleset.

- [ ] **Step 2: Open the PR with measurements and rollback notes**

Use title `perf(repo): reduce optional bundle chunks` and include `Closes #531`.

- [ ] **Step 3: Inspect all final-head evidence**

Inspect checks, issue comments, reviews, inline comments, review threads,
SonarQube issues/hotspots, Codecov patch/bundle reports, and every bot or agent
finding. Resolve all actionable findings.

- [ ] **Step 4: Record sole-maintainer owner review and merge**

Record a COMMENT review by `oaslananka`. Do not request an additional reviewer;
the live ruleset requires zero approving reviews. Merge only when the final head
is signed, merge state is clean, and every required check is green.
