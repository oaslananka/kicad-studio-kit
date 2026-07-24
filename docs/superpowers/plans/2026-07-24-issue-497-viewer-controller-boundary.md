# Issue #497 Viewer Controller Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the browser-side KiCanvas viewer controller from `viewerHtml.ts` into a pure, independently syntax-tested module without changing generated viewer behavior.

**Architecture:** `viewerHtml.ts` remains the host-side HTML/CSP/payload assembler. A new `viewerControllerScript.ts` module returns the unchanged strict-mode browser IIFE, which the host assembler injects into the existing nonce-bearing inline script element.

**Tech Stack:** TypeScript 6, Jest, Node `vm.Script`, VS Code webviews, pnpm, Webpack.

## Global Constraints

- Preserve every viewer DOM ID, message type, payload field, event handler, worker source, and user-facing string.
- Keep the controller inline and protected by the existing CSP nonce; do not add a packaged JavaScript asset.
- Keep the production TypeScript graph at zero cycles.
- Do not modify MCP or unrelated hotspot modules.
- Require DCO sign-off on every non-trivial commit.

---

### Task 1: Define the pure controller-script contract

**Files:**
- Create: `apps/vscode-extension/test/unit/viewerControllerScript.test.ts`
- Create: `apps/vscode-extension/src/providers/viewer/viewerControllerScript.ts`

**Interfaces:**
- Consumes: no runtime input.
- Produces: `createViewerControllerScript(): string` returning the complete browser IIFE without `<script>` tags.

- [ ] **Step 1: Write the failing focused test**

```ts
import { Script } from 'node:vm';
import { createViewerControllerScript } from '../../src/providers/viewer/viewerControllerScript';

describe('createViewerControllerScript', () => {
  it('returns the standalone strict-mode viewer controller', () => {
    const source = createViewerControllerScript();

    expect(source).toContain("'use strict';");
    expect(source).toContain('const vscode = acquireVsCodeApi();');
    expect(source).toContain("window.addEventListener('message'");
    expect(source).toContain("vscode.postMessage({ type: 'ready'");
    expect(source).not.toContain('<script');
    expect(() => new Script(source)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false test/unit/viewerControllerScript.test.ts
```

Expected: FAIL because `viewerControllerScript.ts` does not exist.

- [ ] **Step 3: Create the pure script module**

Create the module with this wrapper and move the existing IIFE body from `viewerHtml.ts` into the raw string without edits:

```ts
export function createViewerControllerScript(): string {
  return String.raw`(function () {
    'use strict';

    // Existing controller source, byte-for-byte through the closing `})();`.
  })();`;
}
```

The implementation must contain the complete current controller source, not a rewritten or behaviorally equivalent version.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command again.

Expected: 1 suite and 1 test pass.

- [ ] **Step 5: Commit the contract and extraction module**

```bash
git add apps/vscode-extension/src/providers/viewer/viewerControllerScript.ts apps/vscode-extension/test/unit/viewerControllerScript.test.ts
git commit -s -m "refactor(kicad-studio): extract viewer controller script"
```

---

### Task 2: Compose the extracted controller from the host HTML assembler

**Files:**
- Modify: `apps/vscode-extension/src/providers/viewerHtml.ts:1-1910`
- Test: `apps/vscode-extension/test/unit/viewerHtml.test.ts`

**Interfaces:**
- Consumes: `createViewerControllerScript(): string` from Task 1.
- Produces: unchanged `createKiCanvasViewerHtml(options): string` output and public exports.

- [ ] **Step 1: Add a failing host-composition assertion**

Add this assertion to the existing syntactic-validity test in `viewerHtml.test.ts`:

```ts
expect(html).toContain('<script nonce="');
expect(html).toContain("const vscode = acquireVsCodeApi();");
expect(html).not.toContain('${createViewerControllerScript()}');
```

Before changing `viewerHtml.ts`, temporarily import and mock `createViewerControllerScript()` to return a unique marker, then assert the marker is absent. This proves the host does not yet consume the new boundary.

- [ ] **Step 2: Run the host test and verify RED**

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false test/unit/viewerHtml.test.ts
```

Expected: FAIL on the unique controller marker assertion.

- [ ] **Step 3: Replace the embedded IIFE with the controller factory**

Add the import:

```ts
import { createViewerControllerScript } from './viewer/viewerControllerScript';
```

Replace the existing embedded controller block with:

```ts
<script nonce="${nonce}">${createViewerControllerScript()}</script>
```

Do not change the payload element, KiCanvas script element, CSP, nonce, localization injection, or document compaction.

- [ ] **Step 4: Run host, controller, security, and architecture tests**

```bash
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false \
  test/unit/viewerControllerScript.test.ts \
  test/unit/viewerHtml.test.ts \
  test/security/securityRegression.test.ts
node scripts/check-vscode-architecture.mjs
```

Expected: all selected Jest suites pass; architecture reports 143 production TypeScript modules and 0 cycles.

- [ ] **Step 5: Commit the host composition change**

```bash
git add apps/vscode-extension/src/providers/viewerHtml.ts apps/vscode-extension/test/unit/viewerHtml.test.ts
git commit -s -m "refactor(kicad-studio): compose extracted viewer controller"
```

---

### Task 3: Record final ownership and run release-confidence gates

**Files:**
- Modify: `docs/architecture/vscode-hotspots.md`
- Modify: `scripts/check-vscode-architecture.test.mjs`

**Interfaces:**
- Consumes: final source line counts and the architecture graph from Tasks 1-2.
- Produces: accurate issue #497 ownership documentation and architecture guard expectations.

- [ ] **Step 1: Update the architecture expectation and hotspot map**

Change the architecture test/document count from 142 to 143 modules. Update hotspot order 2 to list both files and state:

- `viewerHtml.ts` owns CSP, payload, document shell, localization, and resource URIs.
- `viewerControllerScript.ts` owns browser DOM orchestration, state, messages, worker, exports, and SVG fallback.
- Phase 2a is complete; typed message-contract and finer browser-controller decomposition remain separate phases.

Use measured `wc -l` values rather than estimates.

- [ ] **Step 2: Run documentation and focused quality gates**

```bash
node scripts/check-vscode-architecture.mjs
node --test scripts/check-vscode-architecture.test.mjs
corepack pnpm --filter kicadstudiokit run lint
corepack pnpm --filter kicadstudiokit run typecheck
corepack pnpm --filter kicadstudiokit exec jest --runInBand --coverage=false \
  test/unit/viewerControllerScript.test.ts \
  test/unit/viewerHtml.test.ts \
  test/security/securityRegression.test.ts
```

Expected: architecture 143 modules / 0 cycles; all tests, lint, and typecheck pass.

- [ ] **Step 3: Run viewer regression lanes**

```bash
corepack pnpm --filter kicadstudiokit run test:webview
corepack pnpm --filter kicadstudiokit run test:a11y
corepack pnpm --filter kicadstudiokit run test:visual
```

Expected: webview, accessibility, and visual suites pass without snapshot changes.

- [ ] **Step 4: Run the complete repository gate**

```bash
bash scripts/run-validation-host.sh corepack pnpm run check
```

Expected: exit 0, including unit, coverage, security, accessibility, build, repeatable VSIX, docs, performance budgets, and package validation.

- [ ] **Step 5: Commit documentation and final evidence**

```bash
git add docs/architecture/vscode-hotspots.md scripts/check-vscode-architecture.test.mjs
git commit -s -m "docs(kicad-studio): record viewer controller ownership"
```
