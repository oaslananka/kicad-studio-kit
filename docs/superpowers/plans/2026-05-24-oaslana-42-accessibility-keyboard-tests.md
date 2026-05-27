# OASLANA-42 Accessibility Keyboard Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the KiCad Studio accessibility gate so CI catches missing accessible names, keyboard traps, high-contrast regressions, and unlabeled icon/status controls across webviews and native VS Code surfaces.

**Architecture:** Keep the existing `test:a11y` entry point and extend its Playwright/Jest coverage instead of adding a new runner. Fix only production UI gaps exposed by the stricter tests, then document the gate for future contributors.

**Tech Stack:** TypeScript, Jest, Playwright Chromium, axe-core, VS Code extension APIs, Markdown docs.

---

### Task 1: Webview A11y Gate Expansion

**Files:**

- Modify: `apps/vscode-extension/test/a11y/accessibilityConformance.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests that render each webview under dark, light, and high-contrast fixtures, verify interactive controls have accessible names, verify disabled buttons expose a reason, check deterministic tab traversal, and require production CSS to include focus-visible/reduced-motion affordances.

```ts
it.each(themeSurfaceCases())(
  "has no axe-core A/AA violations in %s under %s",
  async (surfaceName, themeName, html, theme) => {
    await page.emulateMedia(theme.media);
    await page.setContent(prepareForAxe(html, theme.css), {
      waitUntil: "domcontentloaded",
    });
    await page.addScriptTag({ content: axe.source });
    const results = await page.evaluate(
      async (options) => window.axe.run(document, options),
      axeOptions,
    );
    expect(formatViolations(results.violations)).toEqual([]);
  },
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter kicadstudiokit run test:a11y
```

Expected: FAIL on the newly enforced gaps before production fixes.

- [ ] **Step 3: Keep the test focused**

The test must remain limited to OASLANA-42 surfaces: Settings, AI Chat, KiCanvas viewer/error, BOM, Netlist, Visual Diff, DRC Rule Editor, Component Search details, MCP Tools, Quality Gates, AI Fix Queue, and status bar items.

### Task 2: Production UI Fixes

**Files:**

- Modify: `apps/vscode-extension/src/providers/viewerHtml.ts`
- Modify: `apps/vscode-extension/src/components/componentSearch.ts`
- Modify: `apps/vscode-extension/src/ai/chatHtml.ts`
- Modify: `apps/vscode-extension/src/settings/settingsHtml.ts`
- Modify: `apps/vscode-extension/src/drc/drcRuleEditorPanel.ts`
- Modify: `apps/vscode-extension/media/styles/viewer.css`
- Modify: `apps/vscode-extension/media/styles/bom.css`
- Modify: `apps/vscode-extension/media/viewer/bom.html`
- Modify: `apps/vscode-extension/media/viewer/netlist.html`
- Modify only if tests require it: `apps/vscode-extension/media/viewer/pcb.html`, `apps/vscode-extension/media/viewer/schematic.html`, `apps/vscode-extension/media/viewer/diff.html`

- [ ] **Step 1: Implement minimal fixes**

Add accessible labels to symbol-only controls, add `aria-describedby` reason text for disabled buttons, add focus-visible CSS, add reduced-motion CSS for spinners/typing indicators, and extract a reusable Component Search details HTML builder for test coverage.

```ts
export function buildComponentDetailsHtml(
  result: ComponentSearchResult,
  options: { nonce: string; cspSource: string },
): string {
  return injectWebviewLocalization(
    componentDetailsHtml(result, options),
    options.nonce,
  );
}
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
corepack pnpm --filter kicadstudiokit run test:a11y
corepack pnpm --filter kicadstudiokit exec jest --config jest.config.js --runInBand --coverage=false test/unit/componentSearch.test.ts
```

Expected: PASS with no deprecation warnings introduced by the change.

### Task 3: Documentation

**Files:**

- Modify: `docs/accessibility.md`
- Modify: `docs/contributing.md`

- [ ] **Step 1: Document contributor requirements**

Update docs to require new UI surfaces to be represented in `test:a11y`, to keep focus-visible/reduced-motion/high-contrast behavior in production CSS, and to expose labels/tooltips/reason text for icon, status, and disabled controls.

```md
New webviews, tree views, status bar items, and command flows must update the
accessibility gate before they are release-ready.
```

- [ ] **Step 2: Run docs checks as part of full validation**

Run the repository-required command sequence after the code is green.

### Task 4: Full Validation And PR

**Files:**

- No additional file changes unless validation exposes scoped failures.

- [ ] **Step 1: Run required validation**

Run:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
corepack pnpm run verify:dist
```

Expected: all PASS. Do not run `uv sync && uv run pytest` unless Python/MCP code was touched.

- [ ] **Step 2: Commit, push, PR, Linear, CI**

Run:

```bash
git status --short
git add apps/vscode-extension/test/a11y/accessibilityConformance.test.ts apps/vscode-extension/src apps/vscode-extension/media docs
git commit -m "test: expand accessibility keyboard coverage"
git push -u origin codex/OASLANA-42-accessibility-keyboard-tests
gh pr create --base main --head codex/OASLANA-42-accessibility-keyboard-tests --title "test: expand accessibility keyboard coverage" --body-file /tmp/oaslana-42-pr.md
gh pr checks --watch --fail-fast
```

Expected: PR linked to GitHub issue #43 and Linear OASLANA-42, CI reaches terminal success or a real external blocker is recorded in Linear.
