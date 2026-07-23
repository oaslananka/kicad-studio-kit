# Issue #497 Viewer Controller Boundary Design

## Goal

Reduce change coupling in `providers/viewerHtml.ts` by separating the browser-side viewer controller from the host-side HTML document assembly without changing viewer behavior, CSP semantics, message names, or packaged assets.

## Context

The issue #497 hotspot map ranks `providers/viewerHtml.ts` second after the completed CLI capability phase. The file currently combines host-side payload preparation and HTML assembly with an approximately 1,700-line browser controller embedded in a nonce-bearing inline script. Existing helper modules already own palette selection, payload construction, engine state, layer-panel width, and generic template escaping.

## Approaches Considered

### 1. Extract the inline browser controller into a pure TypeScript string module

Create `providers/viewer/viewerControllerScript.ts` with `createViewerControllerScript(): string`. Keep the script inline in the generated document so CSP, nonce handling, packaging, and runtime loading remain unchanged.

**Advantages:** smallest behavior-neutral diff; no new runtime fetch; no manifest or package asset changes; controller can be syntax-tested independently.

**Disadvantages:** the controller module remains large, although it has one clear responsibility.

### 2. Ship the controller as a separate webview JavaScript asset

Move the controller into `media/kicanvas` and load it through a webview URI.

**Advantages:** browser code becomes a normal JavaScript asset and can eventually be bundled independently.

**Disadvantages:** changes CSP, packaging, asset URI plumbing, source maps, cache behavior, and VSIX contents. This is too broad for a behavior-neutral decomposition PR.

### 3. Split individual controller features into several generated script fragments

Create separate modules for fallback SVG, layer controls, export, state handling, and input shortcuts.

**Advantages:** finer-grained ownership.

**Disadvantages:** introduces ordering and shared-state coupling across script fragments before a stable browser-side module system exists. The change would be difficult to review and risks subtle runtime regressions.

## Decision

Use approach 1. This phase establishes the host/browser responsibility boundary only. Further controller decomposition and typed message-contract extraction require separate issue #497 phases and their own regression gates.

## Architecture

- `providers/viewerHtml.ts` remains the public host-side API. It prepares the payload, CSP, nonce, localized document structure, error page, and VS Code resource URIs.
- `providers/viewer/viewerControllerScript.ts` owns the complete browser controller source and has no `vscode`, filesystem, process, or DOM runtime dependency at module-evaluation time.
- `createKiCanvasViewerHtml()` calls `createViewerControllerScript()` and places the returned source inside the existing nonce-bearing inline `<script>` element.
- The generated HTML must remain byte-equivalent apart from formatting already normalized by `compactHtmlDocument()`.
- Existing webview messages, payload fields, DOM IDs, event handlers, worker source, and fallback behavior remain unchanged.

## Interfaces

```ts
export function createViewerControllerScript(): string;
```

The function returns a complete strict-mode IIFE without surrounding `<script>` tags. It accepts no options because all runtime data continues to come from the `viewer-payload` JSON element and the DOM.

## Error Handling and Security

- CSP directives and nonce placement remain in `viewerHtml.ts`.
- The controller source remains inline and nonce-protected; no additional script origin is introduced.
- Payload escaping continues through `escapeScriptJson()`.
- The controller module contains static checked-in source and does not concatenate caller-controlled values.

## Validation

1. Add a focused unit test that imports `createViewerControllerScript()`, verifies key bootstrap anchors, and parses the returned source with `node:vm.Script`.
2. Keep all existing `viewerHtml.test.ts` assertions passing.
3. Run webview, security, accessibility, and visual regression suites before merge.
4. Run lint, typecheck, production import-cycle validation, build, repeatable VSIX, package validation, and the full repository gate.
5. Confirm production bundle and package-size budgets do not regress.

## Scope Boundaries

This phase does not:

- change viewer behavior or user-facing copy;
- change host/webview message names or payload shapes;
- add an external JavaScript asset;
- decompose individual controller features;
- modify MCP code or protocol behavior;
- combine unrelated hotspot work.
