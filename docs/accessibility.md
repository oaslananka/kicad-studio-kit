# Accessibility Conformance Target

KiCad Studio targets **WCAG 2.1 Level AA** for extension-owned user
interfaces. This is the accessibility baseline for pull requests, release
candidate review, and future accessibility test work.

This target applies to the VS Code extension UI that the repository owns. It
does not make a full conformance claim for third-party or generated engineering
content that the extension displays.

## Scope

In scope:

- Activity Bar icons and labels contributed by the extension.
- Sidebar views, including tree views and webview views.
- Status bar items and command palette entries.
- Custom editor toolbars and extension-owned fallback/error states.
- Walkthrough content.
- Webview-based surfaces, including Settings, AI Chat, BOM, Netlist, Visual
  Diff, DRC Rule Editor, and viewer fallback/error states.
- Diagnostic messages, tooltip text, and status indicators for DRC/ERC, MCP,
  exports, and package/library management.

Documented exceptions:

- KiCanvas-rendered schematic and PCB canvas content is visual EDA content and
  cannot be fully represented as WCAG-conformant web content. The extension
  must provide keyboard-accessible alternatives: source preview, metadata
  panels, CLI SVG fallback status, diagnostics, BOM/netlist views, and commands
  that open the same design in KiCad.
- Generated KiCad CLI reports and third-party package metadata are external
  content. Extension chrome around those reports remains in scope.

## Required Gates

Automated gate:

```bash
corepack pnpm --filter kicadstudiokit run test:a11y
```

The gate renders representative extension-owned webview HTML in Chromium and
runs axe-core with WCAG 2.0 A, WCAG 2.0 AA, WCAG 2.1 A, and WCAG 2.1 AA rule
tags. It also exercises dark, light, and high-contrast theme fixtures,
keyboard tab order, accessible names, disabled-control reason text,
focus-visible CSS, reduced-motion CSS, native tree rows, and status bar item
labels. It is part of the extension `check` and `check:ci` scripts and runs in
the GitHub Actions `vscode-extension` CI job.

Manual release gate:

- Keyboard-only navigation through each sidebar view, custom editor toolbar,
  settings surface, BOM, Netlist, Component Search details, MCP Tools tree, AI
  Chat, Quality Gates, and DRC Rule Editor.
- Focus order follows the visible workflow order and never traps focus.
- Focus indicators remain visible in VS Code Dark, Light, and High Contrast
  themes.
- Text and non-text indicators meet the contrast targets below when rendered
  with VS Code theme variables.
- NVDA on Windows and VoiceOver on macOS can identify labels, roles, values,
  status messages, and actionable controls on representative extension-owned
  surfaces. These screen reader checks are documented release evidence, not a CI
  gate.

## Success Criteria Audit

Status key:

- Automated: covered by `test:a11y`, unit tests, manifest validation, or CI
  checks.
- Manual: release candidate checklist evidence required.
- Not applicable: the criterion does not apply to the current extension-owned
  UI.
- Exception: explicitly out of scope above, with an accessible alternative.

| Criterion                                       | Level | Status             | KiCad Studio requirement                                                                                                                                                                                      |
| ----------------------------------------------- | ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 Non-text Content                          | A     | Automated + Manual | Product icons, status icons, tree icons, spinner states, and toolbar controls must have text, labels, tooltips, or adjacent names. KiCanvas canvas content is an exception with metadata/source alternatives. |
| 1.2.1 Audio-only and Video-only                 | A     | Not applicable     | The extension ships no audio-only or video-only content.                                                                                                                                                      |
| 1.2.2 Captions                                  | A     | Not applicable     | No prerecorded audio/video is shipped.                                                                                                                                                                        |
| 1.2.3 Audio Description or Media Alternative    | A     | Not applicable     | No prerecorded synchronized media is shipped.                                                                                                                                                                 |
| 1.2.4 Captions (Live)                           | AA    | Not applicable     | No live audio/video is shipped.                                                                                                                                                                               |
| 1.2.5 Audio Description (Prerecorded)           | AA    | Not applicable     | No prerecorded synchronized media is shipped.                                                                                                                                                                 |
| 1.3.1 Info and Relationships                    | A     | Automated + Manual | Forms use labels, tables use headers, tree views expose names/descriptions through VS Code APIs, and webviews preserve semantic headings/regions where practical.                                             |
| 1.3.2 Meaningful Sequence                       | A     | Manual             | DOM order and tab order must follow the visible workflow sequence in webviews and custom editors.                                                                                                             |
| 1.3.3 Sensory Characteristics                   | A     | Manual             | Instructions cannot rely only on shape, position, color, or icon appearance.                                                                                                                                  |
| 1.3.4 Orientation                               | AA    | Manual             | Webviews must reflow in both portrait and landscape editor layouts; no surface may require a fixed orientation.                                                                                               |
| 1.3.5 Identify Input Purpose                    | AA    | Automated + Manual | Settings and form-like webviews use labels, names, autocomplete only where it is meaningful, and no credential fields are exposed as plain settings.                                                          |
| 1.4.1 Use of Color                              | A     | Manual             | DRC/ERC/MCP/library states must pair color with text, icon, tooltip, or count text.                                                                                                                           |
| 1.4.2 Audio Control                             | A     | Not applicable     | The extension does not autoplay audio.                                                                                                                                                                        |
| 1.4.3 Contrast (Minimum)                        | AA    | Automated + Manual | Text must meet 4.5:1 contrast. Large text must meet 3:1. VS Code theme tokens are preferred over fixed colors.                                                                                                |
| 1.4.4 Resize Text                               | AA    | Manual             | Extension-owned webviews must remain usable at 200 percent zoom without losing content or controls.                                                                                                           |
| 1.4.5 Images of Text                            | AA    | Manual             | Do not use images of text for extension-owned labels or instructions. Marketplace screenshots are documentation assets, not UI controls.                                                                      |
| 1.4.10 Reflow                                   | AA    | Manual             | Webviews must avoid two-dimensional scrolling for ordinary controls at narrow editor widths, except EDA canvas and table data where horizontal inspection is intrinsic.                                       |
| 1.4.11 Non-text Contrast                        | AA    | Automated + Manual | Focus borders, input borders, status indicators, and interactive component boundaries must meet 3:1 against adjacent colors.                                                                                  |
| 1.4.12 Text Spacing                             | AA    | Manual             | Text spacing changes must not clip or overlap labels, buttons, tables, cards, or status messages.                                                                                                             |
| 1.4.13 Content on Hover or Focus                | AA    | Manual             | Tooltips/popovers must be dismissible, hoverable where applicable, and not obscure their trigger unless unavoidable in VS Code native UI.                                                                     |
| 2.1.1 Keyboard                                  | A     | Automated + Manual | All extension commands and in-scope webview actions must be reachable and operable by keyboard. Representative webviews are checked for deterministic tab traversal.                                          |
| 2.1.2 No Keyboard Trap                          | A     | Automated + Manual | No webview, custom editor, or tree view may trap keyboard focus. Representative tab-order tests catch focus loops in webview chrome.                                                                          |
| 2.1.4 Character Key Shortcuts                   | A     | Manual             | Single-character shortcuts must be avoidable, remappable, or active only while focus is in the relevant control.                                                                                              |
| 2.2.1 Timing Adjustable                         | A     | Manual             | Long-running operations use progress/status and cancellation where possible; no essential UI expires without user control.                                                                                    |
| 2.2.2 Pause, Stop, Hide                         | A     | Automated + Manual | Spinners, animations, and live updates must be tied to active work, stop when work completes, and include `prefers-reduced-motion` CSS when animation is present.                                             |
| 2.3.1 Three Flashes or Below Threshold          | A     | Manual             | No extension-owned animation may flash more than three times per second.                                                                                                                                      |
| 2.4.1 Bypass Blocks                             | A     | Manual             | Webviews with repeated chrome should keep primary controls early in the tab order; native VS Code navigation handles workbench-level bypass.                                                                  |
| 2.4.2 Page Titled                               | A     | Automated          | Webview documents must include a meaningful title.                                                                                                                                                            |
| 2.4.3 Focus Order                               | A     | Automated + Manual | Focus order must follow logical task order in settings, chat, BOM, netlist, DRC editing, Component Search details, and viewer toolbars.                                                                       |
| 2.4.4 Link Purpose (In Context)                 | A     | Automated + Manual | Links and buttons must identify their purpose through visible text, `aria-label`, title, or surrounding context.                                                                                              |
| 2.4.5 Multiple Ways                             | AA    | Not applicable     | The extension is not a website with multiple pages; commands are available through VS Code navigation surfaces.                                                                                               |
| 2.4.6 Headings and Labels                       | AA    | Automated + Manual | Section headings and form labels must describe their topic or purpose.                                                                                                                                        |
| 2.4.7 Focus Visible                             | AA    | Automated + Manual | Keyboard focus must be visible in native VS Code controls and extension-owned webviews. Webview CSS must include `:focus-visible` styling for interactive controls.                                           |
| 2.5.1 Pointer Gestures                          | A     | Manual             | Pointer gestures in viewer fallbacks must have keyboard or button alternatives where the function is extension-owned.                                                                                         |
| 2.5.2 Pointer Cancellation                      | A     | Manual             | Click/drag actions should complete on release and avoid destructive down-event behavior.                                                                                                                      |
| 2.5.3 Label in Name                             | A     | Automated + Manual | Accessible names for buttons and inputs must include their visible label text.                                                                                                                                |
| 2.5.4 Motion Actuation                          | A     | Not applicable     | The extension does not use device-motion input.                                                                                                                                                               |
| 3.1.1 Language of Page                          | A     | Automated          | Webviews must set `html lang` from the active webview locale where available.                                                                                                                                 |
| 3.1.2 Language of Parts                         | AA    | Manual             | Inline foreign-language text in localized webviews must be marked or avoided unless it is a product name, code, or command.                                                                                   |
| 3.2.1 On Focus                                  | A     | Manual             | Focusing a control must not unexpectedly change context, submit forms, or trigger destructive work.                                                                                                           |
| 3.2.2 On Input                                  | A     | Manual             | Input changes must not unexpectedly change context without a clear user action or preview semantics.                                                                                                          |
| 3.2.3 Consistent Navigation                     | AA    | Manual             | Repeated controls in webviews and tree views must keep stable ordering and names across states.                                                                                                               |
| 3.2.4 Consistent Identification                 | AA    | Automated + Manual | Commands and controls with the same function must use consistent names across command palette, menus, tooltips, and webviews.                                                                                 |
| 3.3.1 Error Identification                      | A     | Automated + Manual | Validation, connection, parsing, and export errors must be identified in text and exposed through status/alert semantics where webviews are involved.                                                         |
| 3.3.2 Labels or Instructions                    | A     | Automated + Manual | Form fields must have labels or instructions before user input is required.                                                                                                                                   |
| 3.3.3 Error Suggestion                          | AA    | Manual             | Recoverable errors should include next actions, such as configuring KiCad CLI, setting a key, retrying MCP, or opening a report.                                                                              |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA    | Not applicable     | The extension does not perform legal, financial, or irreversible user-data submissions. Destructive local commands still require clear labeling.                                                              |
| 4.1.1 Parsing                                   | A     | Automated          | Extension-owned HTML must remain valid enough for accessibility tooling. WCAG 2.1 includes this criterion; WCAG 2.2 obsoletes it, but this project still targets 2.1.                                         |
| 4.1.2 Name, Role, Value                         | A     | Automated + Manual | Custom controls must expose accessible names, roles, values, and state. Prefer native controls.                                                                                                               |
| 4.1.3 Status Messages                           | AA    | Automated + Manual | Async results, loading states, errors, and completion notices must use status/alert semantics or native VS Code status APIs.                                                                                  |

## Conformance Evidence

Automated baseline (updated 2026-06-18):

- `test:a11y` runs **76 axe-core assertions** and passes with zero violations.
- Coverage spans every extension-owned webview surface — Settings, AI Chat, BOM,
  Netlist, Visual Diff, DRC Rule Editor, Quality Gate, Component Search details,
  MCP Tools, the viewer fallback/error chrome, and the status bar — across the
  dark, light, and high-contrast theme fixtures, with WCAG 2.0/2.1 A and AA rule
  tags enabled.
- The suite runs headless in Chromium and is wired into the extension `check`
  and `check:ci` scripts and the `vscode-extension` CI job, so the baseline
  cannot silently regress.

Manual release evidence (keyboard-only navigation and the NVDA/VoiceOver pass
described under the manual release gate) is recorded per release candidate and
is not a CI gate.

## Tooling Policy

- `axe-core` is the automated accessibility engine for extension-owned HTML UI.
- The CI rule set is limited to WCAG 2.0/2.1 A and AA tags. AAA and WCAG 2.2
  rules can be tracked as non-blocking follow-up work.
- Automated axe coverage does not replace keyboard-only and screen-reader
  release checks. Some WCAG criteria require human judgement, and visual EDA
  canvas content needs documented alternatives rather than a false claim of full
  web-content conformance.
- New webview surfaces must be added to
  `apps/vscode-extension/test/a11y/accessibilityConformance.test.ts` before they
  are considered release-ready.

## Contributor Requirements

New extension UI is not release-ready until the accessibility gate represents
the changed surface. The requirement applies to webviews, custom editor chrome,
tree views, status bar items, command flows, and generated HTML templates.

- Add or update `apps/vscode-extension/test/a11y/accessibilityConformance.test.ts`
  for every new or materially changed webview, toolbar, side panel, tree view,
  status item, dialog-like flow, search box, or overlay.
- Keep keyboard tab order deterministic. Focus must follow the visible workflow
  order and must not loop inside a webview.
- Give every icon-only, status-like, and symbolic action a stable accessible
  name through visible text, `aria-label`, title, tooltip, or the native VS Code
  API label/tooltip fields.
- Disabled buttons should expose why the action is unavailable through
  `aria-describedby`, title text, or adjacent reason text when the reason is
  knowable.
- Production CSS for interactive webviews must include `:focus-visible` styling
  and keep that indicator visible in VS Code Dark, Light, and High Contrast
  themes.
- Production CSS with animation or transition effects must include a
  `prefers-reduced-motion: reduce` rule that removes unnecessary motion without
  hiding status text.
- Prefer VS Code theme variables for foreground, background, border, and focus
  colors. Avoid fixed colors that only work in one theme.
- Keep visually hidden helper text available to assistive technology using the
  local `.sr-only` pattern; do not hide required accessible names with
  `display: none`.

## Source Verification

Primary sources checked for this policy:

- W3C WCAG 2.1 Recommendation: https://www.w3.org/TR/WCAG21/
- VS Code Webviews UX guidance and UX overview from the official VS Code API
  docs, checked during implementation and rechecked on 2026-05-24.
- Deque axe-core README and API documentation: https://github.com/dequelabs/axe-core
- Playwright media emulation documentation for color scheme, forced colors, and
  reduced motion, checked on 2026-05-24:
  https://playwright.dev/docs/api/class-page#page-emulate-media
