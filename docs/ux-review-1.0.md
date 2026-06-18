# UI/UX Review for GA (1.x)

A per-surface review of the KiCad Studio extension UI against the GA bar in
[GA Readiness](/ga-readiness). The product was already strong going in; this
records the state of each surface, what changed this review cycle, and what is
deferred (and why).

Status key: ✅ meets the bar · 🟡 met with a deferred follow-up · ⏭️ deferred to
an environment this review could not exercise.

## Cross-cutting foundations

| Concern | State | Evidence |
| --- | --- | --- |
| Theming | ✅ | All colors derive from `--vscode-*` tokens with fallbacks (`media/styles/{bom,viewer}.css`). The two literal hex values are *fallbacks* for `--vscode-testing-iconPassed` / `--vscode-editorWarning-foreground`, not hardcoded colors. |
| Reduced motion | ✅ | Both stylesheets carry `@media (prefers-reduced-motion: reduce)` (universal transition/animation/scroll reset + spinner stop). |
| High contrast | ✅ | Both stylesheets carry `@media (forced-colors: active)` focus outlines using `CanvasText`. |
| Focus visibility | ✅ | `:focus-visible` styling present; tab order and accessible names asserted by the axe suite. |
| Keyboard operability | ✅ | `table-wrapper[tabindex=0]` reference pattern in BOM; axe suite checks deterministic tab traversal and no focus traps. |
| Status semantics | ✅ | `role="status"`/`role="alert"` + `aria-live` on loading/empty/error regions. |
| Localization | ✅ | en/tr parity (397/397) with a guardrail that fails on new untranslated strings (`check:nls-parity`). |
| Command surface | ✅ | Palette gating, inline title icons, and an editor context menu landed this cycle (menu hygiene). |

## Per-surface review

| Surface | Empty | Loading | Error | Notes |
| --- | --- | --- | --- | --- |
| BOM webview | ✅ `#bom-empty` | ✅ `#loading-row` | ✅ | Reference implementation for the others. |
| Netlist webview | ✅ summary "No schematic opened." / "0 net entries" | ✅ provider-driven `status` ("Loading netlist…") | ✅ `#error-card` (`role="alert"`) | States are driven by the provider `status` payload rather than webview-local elements; all three are visual-snapshot locked (`netlist-loading/success/error`). |
| Visual Diff webview | ✅ | ✅ | ✅ | Empty/error handling present in `diff.js`. |
| Viewer (KiCanvas PCB/Schematic) | n/a (canvas) | ✅ | ✅ | Canvas content has documented keyboard-accessible alternatives per [Accessibility](/accessibility); loading + error states snapshot-locked. |
| Quality Gate view | ✅ | ✅ | ✅ | Project-gated (`kicadstudio.hasProject`); axe-covered. |
| Validation / DRC views | ✅ | ✅ | ✅ | `viewsWelcome` empty states for tree views; DRC Rule Editor axe-covered. |
| Sidebar tree views (11) | ✅ | — | ✅ | `viewsWelcome` provides first-run/empty guidance per view. |

## Changed this review cycle

- **Menu & command-surface hygiene** — palette gating, inline `view/title` icons, editor context menu; removed an always-false `when` clause that hid library commands.
- **i18n guardrail** — `check:nls-parity` now fails on newly-untranslated user-facing strings.
- **Versioning story** — reframed the beta program as an ongoing preview channel for the stable 1.x line.
- **Accessibility evidence** — recorded the automated axe baseline in [Accessibility](/accessibility#conformance-evidence).

## Deferred (environment-bound)

- ⏭️ **Visual-snapshot refresh.** The webview baselines (`test/visual/__screenshots__`) are platform-specific; regenerating them off the Linux CI runner would produce mismatching images. Any pixel-affecting UI change must regenerate on the CI platform.
- ⏭️ **Manual screen-reader pass.** NVDA (Windows) / VoiceOver (macOS) verification is a documented release gate that needs a screen reader and a human; it is not a CI gate.

## Conclusion

Every in-scope surface meets the GA bar for states, theming, motion, contrast,
keyboard operability, and localization. The two deferred items are release-time
verification steps that require a specific environment, not outstanding defects.
