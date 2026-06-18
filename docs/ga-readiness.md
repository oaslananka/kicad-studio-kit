# GA Readiness Criteria

This document defines the **release-readiness gate** for KiCad Studio: the
concrete, checkable criteria that must hold before a build is promoted from the
preview (beta) channel to the **stable `1.x` channel** on the VS Code
Marketplace and Open VSX.

KiCad Studio already ships a stable `1.x` line (see [Versions](/support-matrix)),
so "GA" here is not a one-time `1.0.0` event — it is the standing quality bar
applied to every stable promotion. The preview channel described in the
[Beta Program](/beta-program) feeds this gate.

## How to use this gate

1. Each criterion below is either **met** or **not met** — no partial credit.
2. A stable promotion proceeds only when every criterion is met, or a maintainer
   records an explicit, time-boxed waiver in the release issue.
3. The gate is re-evaluated for every stable release, not just the first.

## Exit criteria

### 1. Zero open release-blockers

- No open GitHub issue carries the `release-blocker` label.
- The VS Code canary lanes (`minimum`, `stable`, `insiders`) are green; the
  `minimum` lane tracks the `engines.vscode` floor in
  [the support matrix](/support-matrix).

### 2. CI is green and non-flaky

- All required CI lanes pass on `main` across Windows, macOS, and Linux.
- No required lane has been re-run to recover from a flake in the **7 days**
  before promotion. A flake that recurs resets the clock and is tracked as its
  own issue until made deterministic.

### 3. Accessibility (WCAG 2.1 AA) verified

- `pnpm test:a11y` passes and covers every webview surface.
- A manual screen-reader pass (NVDA or VoiceOver) on the BOM, viewer, and
  quality-gate views found no unresolved label, role, or heading-order defects.
- Conformance evidence is recorded in [Accessibility](/accessibility).

### 4. Performance budgets met

- Extension activation time, viewer first-render on a large board, BOM render on
  a large netlist, and memory are within the budgets in
  [Performance Baselines](/performance-baselines).
- `pnpm test:perf` passes and fails closed on regression.

### 5. Internationalization complete

- `pnpm run check:nls-parity` passes: en/tr key parity holds and no new
  user-facing string is left untranslated.
- The supported GA locale set (English + Turkish) is documented and current.

### 6. Security and privacy posture

- CodeQL, Scorecard, secret scanning, and dependency review are green.
- Telemetry and crash reporting remain **opt-in and disabled by default**, with
  redaction verified per [Telemetry](/telemetry).
- No high or critical advisory is unresolved without a documented waiver.

### 7. Dependency lifecycle clean

- No security update is pending past its policy window in
  [Dependency Lifecycle](/dependency-lifecycle).
- Planned major upgrades are either landed or explicitly deferred with a reason.

### 8. Tester feedback triaged

- Every actionable preview report from the current cycle is triaged into a
  tracked issue with the `source:beta` label.
- At least two 2-week preview cycles completed since the previous stable release,
  per the [Beta Program](/beta-program) readiness checklist.

### 9. Documentation current

- User-facing docs (non-generated) reflect the shipping behavior.
- The changelog calls out preview-driven fixes under the relevant product
  section.
- The marketplace listing, README, and version surfaces tell one coherent story.

## Sign-off

A stable promotion is signed off in the release issue with:

- a link to the green CI run on the release commit,
- the checked criteria above (with any waiver and its expiry), and
- the preview-cycle summary that fed the release.
