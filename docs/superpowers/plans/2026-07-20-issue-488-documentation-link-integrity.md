# Issue 488 Documentation Link Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Correct the two shipped documentation links and add a deterministic repository gate that prevents missing own-repository documentation targets.

**Architecture:** A typed extension module owns canonical documentation URLs. Existing user flows consume those constants, while a standalone Node checker scans extension TypeScript source for own-repository `blob/main` URLs and verifies their local targets without network access.

**Tech Stack:** TypeScript 6, Jest 30, Node.js 24 ESM scripts, pnpm 11.

## Global Constraints

- Work only on GitHub issue `#488`; do not include issue `#489` changes.
- Preserve the Settings panel external-link allowlist behavior.
- Do not add runtime dependencies.
- Repository validation must be deterministic and offline.
- Bug-fix tests must reference `#488`.

---

### Task 1: Capture the two user-flow regressions

**Files:**

- Modify: `apps/vscode-extension/test/unit/settingsPanel.test.ts`
- Modify: `apps/vscode-extension/test/unit/kicadCliDetector.test.ts`

**Interfaces:**

- Consumes: existing `buildSettingsHtml`, `KiCadSettingsPanel`, and `KiCadCliDetector.detect(notifyOnMissing)` behavior.
- Produces: regression expectations for the canonical MCP and KiCad CLI documentation URLs.

- [x] **Step 1: Update the Settings panel regression expectation**

Send `openExternalLink` with `https://github.com/oaslananka/kicad-studio-kit/blob/main/apps/vscode-extension/docs/INTEGRATION.md`, then assert `vscode.env.openExternal` receives a URI whose string is that exact URL. Rename the test so its name includes `#488`.

- [x] **Step 2: Add the missing-CLI Help regression test**

Configure candidate validation to return `undefined`, make `vscode.window.showErrorMessage` resolve to `Help`, call `detector.detect(true)`, and assert `vscode.env.openExternal` receives `https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/install.md`. Include `#488` in the test name.

- [x] **Step 3: Run both tests and verify RED**

Run:

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand test/unit/settingsPanel.test.ts test/unit/kicadCliDetector.test.ts
```

Expected: FAIL because production still emits `docs/INTEGRATION.md` and `docs/installation.md`.

### Task 2: Centralize and repair documentation URLs

**Files:**

- Create: `apps/vscode-extension/src/documentation/documentationUrls.ts`
- Modify: `apps/vscode-extension/src/settings/settingsHtml.ts`
- Modify: `apps/vscode-extension/src/cli/kicadCliDetector.ts`

**Interfaces:**

- Produces: `DOCUMENTATION_URLS.mcpIntegration` and `DOCUMENTATION_URLS.kicadCliInstallation`, both readonly string literals.
- Consumers: Settings HTML event payload and KiCad CLI Help action.

- [x] **Step 1: Add the typed URL source**

Create:

```ts
export const DOCUMENTATION_URLS = {
  mcpIntegration:
    "https://github.com/oaslananka/kicad-studio-kit/blob/main/apps/vscode-extension/docs/INTEGRATION.md",
  kicadCliInstallation:
    "https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/install.md",
} as const;
```

- [x] **Step 2: Use the MCP constant in Settings HTML**

Import `DOCUMENTATION_URLS`, serialize `DOCUMENTATION_URLS.mcpIntegration` with `JSON.stringify`, and use the serialized literal in the `open-mcp-docs` message payload.

- [x] **Step 3: Use the install constant in CLI detection**

Import `DOCUMENTATION_URLS` and pass `DOCUMENTATION_URLS.kicadCliInstallation` to `vscode.Uri.parse` in the Help branch.

- [x] **Step 4: Run both tests and verify GREEN**

Run the Task 1 Jest command. Expected: both suites pass.

### Task 3: Add the offline repository-link integrity gate

**Files:**

- Create: `scripts/check-extension-documentation-links.mjs`
- Create: `scripts/check-extension-documentation-links.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `collectExtensionDocumentationLinkErrors({ repoRoot }) => string[]`.
- Consumes: TypeScript files under `<repoRoot>/apps/vscode-extension/src` and local target files under `<repoRoot>`.

- [x] **Step 1: Write checker tests first**

Cover three behaviors: valid own-repository targets return no errors; a missing target returns a message containing source file, line, and target; root `package.json` defines `check:extension-doc-links` and includes it in `check`.

- [x] **Step 2: Run the checker tests and verify RED**

Run:

```bash
node --test scripts/check-extension-documentation-links.test.mjs
```

Expected: FAIL because the checker module and package wiring do not exist.

- [x] **Step 3: Implement the checker**

Recursively read `.ts` files, match this repository's `blob/main` URL prefix, decode the captured path, reject absolute or parent-traversal targets, check `statSync(...).isFile()`, and return all formatted errors. When invoked directly, print errors and set exit code 1; otherwise print a success summary.

- [x] **Step 4: Wire the root scripts**

Add:

```json
"check:extension-doc-links": "node scripts/check-extension-documentation-links.mjs && node --test scripts/check-extension-documentation-links.test.mjs"
```

Insert `pnpm run check:extension-doc-links` before `pnpm run check:docs-site` in the root `check` chain.

- [x] **Step 5: Run checker tests and verify GREEN**

Run:

```bash
corepack pnpm run check:extension-doc-links
```

Expected: checker success plus all Node tests passing.

### Task 4: Verify issue acceptance criteria

**Files:**

- No new files.

**Interfaces:**

- Consumes: all Task 1–3 outputs.
- Produces: fresh verification evidence for the commit and PR.

- [x] **Step 1: Run focused quality gates**

```bash
corepack pnpm --filter kicadstudiokit run format:check
corepack pnpm --filter kicadstudiokit run lint
corepack pnpm --filter kicadstudiokit run typecheck
corepack pnpm --filter kicadstudiokit exec jest --runInBand test/unit/settingsPanel.test.ts test/unit/kicadCliDetector.test.ts
corepack pnpm run check:extension-doc-links
```

Expected: all commands exit 0.

- [ ] **Step 2: Run product and package gates**

```bash
corepack pnpm run check:kicad-studio
corepack pnpm run package:kicad-studio
```

Expected: both commands exit 0 and VSIX validation succeeds.

- [x] **Step 3: Review the diff**

```bash
git diff --check
git status --short
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
```

Expected: only issue `#488` source, tests, checker wiring, and approved spec/plan files are present.

- [x] **Step 4: Commit**

```bash
git add docs/superpowers apps/vscode-extension/src apps/vscode-extension/test scripts package.json
git commit -m "fix(kicad-studio): validate shipped documentation links (#488)"
```
