# Testing Strategy

OASLANA-35 / GitHub issue #36 defines the maximum automated test strategy for
KiCad Studio Kit. The goal is to make normal development depend on repeatable
local and CI gates instead of manual VS Code or KiCad inspection after every
change.

This document is the canonical repository-level testing guide. Product-specific
notes can add detail, but they should not weaken these gates.

## Gate Summary

| Gate                 | Trigger                                                              | Purpose                                                                                                | Required command                                      |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Fast PR gate         | Every pull request                                                   | Catch formatting, lint, type, unit, package, metadata, boundary, and compatibility regressions.        | `corepack pnpm run check`                             |
| Bug-fix regression   | Every bug-fix pull request                                           | Prove the repeatable bug fails before the fix, passes after it, and references the issue.              | Relevant test command plus PR checklist evidence      |
| Performance budget   | Product, integration, and shared fixture/schema pull requests        | Report shared baseline drift and fail measured lanes that exceed the regression budget.                | `corepack pnpm run check:performance-budgets`         |
| Product gate         | Product-scoped changes                                               | Prove the touched product still builds, tests, and packages independently.                             | Product commands below                                |
| Accessibility gate   | Extension-owned UI and webview changes                               | Prove WCAG 2.1 AA automated checks remain clean for in-scope extension surfaces.                       | `corepack pnpm --filter kicadstudiokit run test:a11y` |
| Contract gate        | Protocol, compatibility, or cross-product changes                    | Prove extension and MCP assumptions remain aligned.                                                    | `corepack pnpm run check:protocol-schemas` and `corepack pnpm run check:compatibility-contract` |
| Protocol PR gate     | Protocol, compatibility, or cross-product review changes             | Keep protocol-impact PRs visible through the PR template and architecture guidance.                    | `corepack pnpm run check:protocol-pr-template`        |
| GUI smoke policy     | Real KiCad GUI smoke workflow/test wiring changes                    | Keep live-editor IPC smoke coverage wired without adding GUI work to the PR path.                      | `corepack pnpm run check:kicad-gui-smoke`             |
| Fixture gate         | Parser, diagnostics, command-builder, or KiCad file behavior changes | Prove deterministic KiCad corpus behavior stays stable.                                                | `corepack pnpm run test:fixtures`                     |
| VS Code canary       | Scheduled and manual workflow                                        | Check supported VS Code host lanes before runtime/API changes reach users.                             | `.github/workflows/vscode-canary.yml`                 |
| Cross-repo canary    | Push, pull request, and manual workflow                              | Verify this repo consumes published `kicad-mcp` protocol schema and server artifacts.                  | `.github/workflows/cross-repo-compatibility.yml`      |
| Manual smoke         | Release candidate only                                               | Final human inspection where automation is not practical.                                              | PR notes must name the exact manual check             |

## Test Layers

| Layer                                 | Scope                                                                                                                                                                                                      | Owner path                                                         | Runner or API                                                  | Gate                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------- |
| Static checks                         | Format, lint, typecheck, metadata, product boundaries, version consistency, compatibility matrix, governance self-test.                                                                                    | Root, `apps/vscode-extension`, `packages/test-harness`             | pnpm, TypeScript, Ruff, mypy, repository scripts               | Fast PR gate                                      |
| Shared test harness                   | Fixture paths, temporary workspaces, golden comparisons, KiCad CLI wrappers, MCP mocks, webview mocks, log redaction, and cross-platform paths.                                                            | `packages/test-harness`                                            | TypeScript and Node test runner                                | Fast PR gate, shared package gate                 |
| Extension unit tests                  | Project discovery, command builders, diagnostics, state machines, MCP client behavior, webview HTML helpers, parsers.                                                                                      | `apps/vscode-extension/test/unit/`                                 | Jest                                                           | Fast PR gate                                      |
| Extension integration tests           | Activation, commands, context keys, diagnostics, project tree, status bar, custom editors, real-server flows.                                                                                              | `apps/vscode-extension/test/integration/`                          | `@vscode/test-electron` and VS Code Extension Development Host | Product gate, nightly gate when enabled           |
| Extension webview and E2E tests       | Viewer state machine, fit and zoom behavior, layer panel, toolbar, loading, error, empty states.                                                                                                           | `apps/vscode-extension/test/e2e/`                                  | Playwright                                                     | Product gate or nightly gate based on environment |
| Visual regression                     | Schematic and PCB viewer surfaces, sidebars, themes, viewport sizes, DPI, BOM/netlist states, and diagnostic sidebars.                                                                                     | `apps/vscode-extension/test/visual/` snapshot suites               | Playwright `toHaveScreenshot`                                  | Windows PR lane for committed goldens             |
| Accessibility and keyboard navigation | WCAG 2.1 AA target, webview axe-core checks, Activity Bar views, custom editors, tree views, status actions, command flows.                                                                                | [`docs/accessibility.md`](accessibility.md), extension a11y tests  | axe-core, Chromium, VS Code test host, manual screen readers   | Product gate and release candidate gate           |
| MCP unit tests                        | Pure Python helpers, tool metadata, routers, server startup, semantic gates, release guards.                                                                                                               | `oaslananka/kicad-mcp/tests/unit/`                                 | pytest                                                         | Fast PR gate                                      |
| MCP integration tests                 | File-backed KiCad behavior, export/manufacturing tools, project quality gates, simulation and routing tools.                                                                                               | `oaslananka/kicad-mcp/tests/integration/`                          | pytest plus optional `kicad-cli`                               | `oaslananka/kicad-mcp` CI                         |
| MCP E2E tests                         | Server startup, stdio, journal/rollback, release-gate workflows.                                                                                                                                           | `oaslananka/kicad-mcp/tests/e2e/`                                  | pytest                                                         | `oaslananka/kicad-mcp` CI                         |
| Performance budgets                   | Shared activation, scan, viewer, validation, and memory baselines plus PR budget reports.                                                                                                                  | `performance/baselines.json`, `performance-results/`               | Node checker, benchmark producers, GitHub workflow artifacts   | Fast PR gate                                      |
| KiCad CLI contract tests              | KiCad 10 primary behavior plus deprecated best-effort 9.x and 8.x compatibility where supported.                                                                                                           | Shared fixtures and MCP integration tests                          | `kicad-cli`                                                    | `oaslananka/kicad-mcp` CI                         |
| MCP transport contract tests          | Streamable HTTP initialize flow, initialized notification, session handling, mount paths, stateless behavior, legacy SSE opt-in, `MCP-Protocol-Version`, tool discovery, tool calls, errors, and timeouts. | MCP transport conformance suite in `oaslananka/kicad-mcp`          | pytest/http client                                             | `oaslananka/kicad-mcp` CI                         |
| Real-pair tests                       | Built VS Code extension connected to built MCP server against fixture workspaces.                                                                                                                          | Future shared harness                                              | VS Code test host plus local MCP server                        | Nightly gate                                      |
| Real KiCad GUI IPC smoke              | KiCad application IPC behavior that cannot be proven by file-backed CLI tests.                                                                                                                             | `oaslananka/kicad-mcp/tests/gui/`                                  | KiCad GUI, Xvfb, fixture workspace, MCP server tools           | `oaslananka/kicad-mcp` scheduled/manual CI        |
| Release candidate manual smoke        | Marketplace/package artifact sanity only.                                                                                                                                                                  | PR/release notes                                                   | Human confirmation                                             | Release candidate only                            |

## Fast PR Gates

Fast gates must be deterministic and must not depend on a manually opened KiCad
or VS Code desktop session.

Run the complete repository gate before opening or updating a PR that touches
root tooling, CI, shared compatibility, release policy, or docs:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run check
```

Extension-only changes use:

```bash
corepack pnpm run check:kicad-studio
corepack pnpm run test:kicad-studio
corepack pnpm --filter kicadstudiokit run test:a11y
corepack pnpm --filter kicadstudiokit run test:visual
corepack pnpm run build:kicad-studio
corepack pnpm run package:kicad-studio
```

## Visual Regression Snapshots

The extension visual gate lives in
`apps/vscode-extension/test/visual/` and uses
`apps/vscode-extension/playwright.visual.config.ts`. It covers VS Code Dark,
VS Code Light, and High Contrast themes across 1280x720, 1920x1080,
2560x1440, and 3840x2160 viewports at `deviceScaleFactor: 1` and `2`.

The committed golden set covers clean schematic, clean PCB, large schematic,
large PCB, empty project, DRC errors, ERC errors, BOM loading/success/error,
and Netlist loading/success/error fixtures. Snapshot names include the fixture
and directly preserve coverage for issues #17, #18, and #19.

Run the gate locally with:

```bash
corepack pnpm --filter kicadstudiokit run test:visual
```

```powershell
corepack pnpm --filter kicadstudiokit run test:visual
```

The diff budget is explicit: `maxDiffPixelRatio: 0.002` with Playwright
pixelmatch `threshold: 0.2`, `scale: css`, disabled animations, hidden carets,
and reduced-motion media. Golden changes must be reviewed in PRs like source
changes: the PR should explain why the UI changed, include the command above,
and avoid updating snapshots together with unrelated code.

CI visual snapshots run on the Windows extension lane with the runner Chrome
channel selected through `KICADSTUDIO_PLAYWRIGHT_CHANNEL=chrome`; local runs keep
using Playwright's bundled Chromium unless that environment variable is set.

MCP server changes are developed in the [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) repository.

Shared test harness changes use:

```bash
corepack pnpm --dir packages/test-harness run check
corepack pnpm run check:boundaries
```

Protocol, compatibility, or cross-product changes use:

```bash
corepack pnpm run check:protocol-schemas
corepack pnpm run check:compatibility-contract
corepack pnpm run test:fixtures
```

## Bug-Fix Regression Requirement

OASLANA-61 / GitHub issue #62 makes regression coverage part of the issue
closing bar. Bug-fix pull requests must include automated regression coverage
when practical, and the evidence must be visible in the PR template before the
bug issue is closed.

Required evidence:

- A test that fails against the pre-fix behavior and passes after the fix.
- A reference to the related issue ID in the test name, test metadata, fixture
  metadata, snapshot name, or contract case.
- A fixture, golden output, visual snapshot, accessibility check, or protocol
  contract when that is the right way to reproduce the bug.
- The exact local or CI command that ran the regression.

Exceptions must explain why automation is not practical and must be approved by
a maintainer before closing the issue. Manual screenshots alone are not
sufficient for repeatable bugs; screenshots can support a visual report, but the
closing evidence should be a DOM, visual-regression, accessibility, fixture, or
integration test when the bug can be reproduced.

## Path-Filtered CI Lanes

The fast CI workflow starts with `.github/workflows/ci.yml` job `ci-lanes`.
That job runs `node scripts/check-ci-lanes.mjs`, writes lane decisions to
`GITHUB_OUTPUT`, and writes a skip/run table to `GITHUB_STEP_SUMMARY`.

| Lane                | Trigger paths                                                                           | CI behavior                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Metadata and policy | Every run                                                                               | Runs repository policy, ownership, version, compatibility, release-please, and governance checks. |
| VS Code extension   | `apps/vscode-extension/**`, legacy `apps/kicad-studio/**`, or root toolchain/CI changes | Runs extension format, lint, typecheck, unit/a11y tests, build, package, and package validation.  |
| MCP server          | `oaslananka/kicad-mcp` (source in separate repository)                                  | MCP tests run in the [kicad-mcp](https://github.com/oaslananka/kicad-mcp) repository.             |

| Shared packages | `packages/kicad-fixtures/**`, `packages/test-harness/**`, or fixture corpus paths | Runs fixture validation, compatibility matrix checks, and protocol schema validation. |
| Integration contracts | Protocol schemas, extension MCP adapter paths, MCP runtime/capability paths, release/compatibility metadata, or workflow changes | Runs cross-product contract validation and selected real-pair compatibility tests. |
| Performance budgets | Extension, shared fixture/schema, or root toolchain/CI changes | Measures extension benchmark outputs and checks shared performance budgets. |

Manual and scheduled dispatches run every lane. If the event payload cannot
provide a safe diff range, the detector falls back to running every lane rather
than accidentally skipping validation. The lane summary must show each skipped
lane and the reason it was skipped so reviewers can see when a product job was
intentionally avoided.

Validate the lane detector locally with:

```bash
corepack pnpm run check:ci-lanes
```

## Performance Budgets

`performance/baselines.json` is the shared performance budget catalog for
activation, project scan, viewer, validation, and memory regressions. The
policy and benchmark-producer contract live in
[`docs/performance-baselines.md`](performance-baselines.md).

Every full local pre-flight runs the performance catalog check through the root
gate. CI runs the `performance-budgets` job when changed paths can affect
extension, shared fixture/schema, or root toolchain behavior, and records
benchmark measurements plus the budget report as workflow artifacts. A measured
metric warns after 10 percent drift and fails after 20 percent drift. Use the
dedicated budget check while changing baseline metadata:

```bash
corepack pnpm run check:performance-budgets
```

## Scheduled Compatibility Gates

This repository currently keeps two scheduled or manually dispatched
compatibility workflows:

- `.github/workflows/vscode-canary.yml` checks supported VS Code host lanes.
- `.github/workflows/cross-repo-compatibility.yml` verifies published
  `@oaslananka/kicad-protocol-schemas` and `kicad-mcp-pro` artifacts without
  relying on local MCP source code.

Real KiCad CLI, GUI IPC, and MCP transport canaries run from
[oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp), where the MCP
server source now lives. This repository keeps `check:kicad-gui-smoke` as a
policy check for extension wiring, not as a local GUI smoke runner.

Future local gates should land in focused PRs only when the owning workflow is
present in this repository:

| Future gate                | Tracking issue | Required behavior                                                                                                                                                            |
| -------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared fixture corpus      | OASLANA-53     | Maintain `packages/kicad-fixtures/` with semantic fixture IDs and golden expected outputs.                                                                                   |
| Unit test expansion        | OASLANA-37     | Cover project discovery, command builders, diagnostics, state machines, and MCP client behavior.                                                                             |
| MCP protocol contracts     | OASLANA-43     | Cover Streamable HTTP, session headers, stateless mode, tool discovery, errors, timeouts, and ChatGPT connector compatibility.                                               |
| MCP transport conformance  | OASLANA-71     | Cover initialized notifications, tools/list and tools/call ordering, mount path routing, legacy SSE opt-in, VS Code MCP compatibility, and generic MCP client compatibility. |
| KiCad GUI IPC smoke        | OASLANA-44     | Cover live PCB context, GUI-closed fallback diagnostics, multi-window behavior, and project switch isolation.                                                                |
| MCP adapter layer tests    | OASLANA-56     | Verify extension UI and commands use the adapter boundary instead of direct MCP calls.                                                                                       |
| Server-info contract tests | OASLANA-57     | Verify advertised server-info, capability metadata, and compatibility ranges.                                                                                                |
| Real-pair E2E              | OASLANA-75     | Build both products, start the server, launch the extension host, connect them, and validate capability handshakes.                                                          |
| VS Code canary             | OASLANA-81     | Run current stable, insiders, and minimum supported VS Code versions.                                                                                                        |
| KiCad canary               | OASLANA-82     | Run primary, deprecated, and prerelease KiCad CLI lanes from `oaslananka/kicad-mcp` where practical.                                                                         |

## KiCad Canary

Real KiCad CLI canary coverage now runs from
[oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp). This repository
keeps KiCad compatibility metadata, fixture packages, and extension behavior in
sync through `check:compatibility-contract`, `check:fixtures`, and the
cross-repo compatibility workflow.

The migration checklist and IPC parity matrix live in
[`docs/compatibility/kicad-10-to-11-migration.md`](compatibility/kicad-10-to-11-migration.md).

## VS Code Canary

`.github/workflows/vscode-canary.yml` launches a focused extension host smoke
suite every week and on manual dispatch against the VS Code lanes from
`compatibility.yaml`: current stable, the minimum `engines.vscode` host, and
insiders. The smoke suite covers activation, commands, context-gated views,
custom editor/webview bootstrap, diagnostics lifecycle access, and project/MCP
view registration. Unit smokes keep the mock MCP Tools and provider paths in
the same lane. The stable and minimum lanes fail the workflow; the insiders
lane keeps reporting prerelease breakage without blocking stable support.

Each lane uploads the Extension Development Host logs and available test
artifacts. A failing lane opens or updates a compatibility issue. Stable-lane
failures add the `release-blocker` label because the release gate lists VS Code
stable compatibility as required.

## KiCad GUI Smoke

Real KiCad GUI IPC smoke coverage now runs from
[oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp). This repository
keeps `check:kicad-gui-smoke` as a lightweight policy check for extension-side
GUI smoke wiring and documentation.

## Regression Coverage Map

Every bug fix should add an automated regression when practical. If automation
is not practical, the PR must explain why and include the manual smoke command
or artifact.

| Issue       | Risk covered                                                                                | Required test layer                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| OASLANA-35  | Missing repository-level testing strategy and quality gates.                                | `docs/testing-strategy.md` plus `corepack pnpm run check:testing-strategy`                                    |
| OASLANA-36  | KiCad file parser or quality-gate regressions that lack deterministic fixtures.             | Shared KiCad fixture corpus and golden expected outputs                                                       |
| OASLANA-37  | Extension helpers regressing without unit coverage.                                         | Jest unit suites under `apps/vscode-extension/test/unit/`                                                     |
| OASLANA-43  | MCP transport/session compatibility regressions.                                            | MCP contract tests for Streamable HTTP and `MCP-Protocol-Version` behavior                                    |
| OASLANA-71  | MCP transport conformance regressions for standalone and extension clients.                 | Transport contract suite in `oaslananka/kicad-mcp` for lifecycle, session, mount path, legacy SSE, and tool-call behavior |
| OASLANA-44  | Live KiCad PCB context regressing while file-backed CLI checks still pass.                  | Scheduled GUI smoke suite for live context, fallback diagnostics, and project switching                       |
| OASLANA-56  | Extension code bypassing the MCP adapter boundary.                                          | Adapter unit tests plus integration tests for UI and command calls                                            |
| OASLANA-57  | MCP server-info or capability metadata drift.                                               | Server-info and compatibility contract tests                                                                  |
| OASLANA-75  | Extension and MCP server passing independently but failing as a pair.                       | Real-pair E2E tests                                                                                           |
| OASLANA-76  | Protocol-impact pull requests missing schema, adapter, contract, or compatibility evidence. | PR template protocol checklist plus `corepack pnpm run check:protocol-pr-template`                            |
| OASLANA-16  | Schematic viewer rendering as a tiny low-resolution thumbnail.                              | Playwright viewer fit tests plus visual regression snapshots                                                  |
| OASLANA-20  | Project tree duplicate rows or unclear file state indicators.                               | Extension integration tests for project tree model and labels                                                 |
| OASLANA-68  | Stale state across project, diagnostics, viewer, MCP, and export surfaces.                  | State-store unit tests plus integration checks for derived UI state                                           |
| OASLANA-63  | Ownership or branch protection drift.                                                       | CODEOWNERS/policy validation and PR checklist checks                                                          |
| OASLANA-64  | Supply-chain regressions in both products and artifacts.                                    | Security workflow, package validation, audit, and provenance checks                                           |
| OASLANA-81  | VS Code runtime/API compatibility regressions.                                              | Scheduled VS Code stable/insiders/minimum canary lane                                                         |
| OASLANA-82  | KiCad CLI/file-format compatibility regressions.                                            | KiCad canary lane in `oaslananka/kicad-mcp`                                                                   |
| OASLANA-124 | Performance regressions without shared limits or PR evidence.                               | Shared baselines, CI budget report artifacts, and drift thresholds                                            |
| OASLANA-125 | Accessibility claims without an explicit WCAG target or automated evidence.                 | WCAG 2.1 AA policy plus `corepack pnpm --filter kicadstudiokit run test:a11y`                                 |

### Known Repeatable Bug Areas

Use this table when closing existing bug issues so the regression lands in the
right layer instead of relying on manual screenshots or ad-hoc verification.

| Area                           | Tracking issues                    | Required regression task                                                                                 |
| ------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Diagnostics stale state        | OASLANA-68, OASLANA-69             | State-store unit tests plus integration checks for Problems, validation views, and derived freshness UI. |
| Viewer rendering and fit bugs  | OASLANA-16, OASLANA-70             | DOM/E2E fit tests and visual snapshots for schematic/PCB viewer surfaces.                                |
| MCP transport/session bugs     | OASLANA-34, OASLANA-43, OASLANA-71 | Transport contract cases for initialize flow, sessions, mount paths, and protocol headers.               |
| Project tree duplication       | OASLANA-20                         | Extension model/integration tests for tree rows, labels, and file-state indicators.                      |
| BOM and netlist loading states | OASLANA-22, OASLANA-23             | Extension unit or integration tests for loading, empty, error, and parsed-data states.                   |
| Status bar freshness bugs      | OASLANA-29, OASLANA-69             | State-store and extension integration tests for stale/current/error status item transitions.             |
| KiCad CLI compatibility bugs   | OASLANA-30, OASLANA-38, OASLANA-82 | KiCad CLI contract/canary cases backed by fixture reports and compatibility metadata.                    |
| Live GUI context bugs          | OASLANA-35, OASLANA-44             | Scheduled GUI smoke or targeted integration tests for live PCB context and file-backed fallback state.   |

## Local Commands

Use the narrowest command first while developing, then run the broader gate
before pushing.

| Change type                    | Narrow command                                                        | Broad command                                  |
| ------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------- |
| Root docs or governance        | `corepack pnpm run check:testing-strategy`                            | `corepack pnpm run check`                      |
| Performance baselines          | `corepack pnpm run check:performance-budgets`                         | CI `performance-budgets` artifact lane         |
| Extension unit behavior        | `corepack pnpm --filter kicadstudiokit run test:unit -- <test file>`  | `corepack pnpm run check:kicad-studio`         |
| Extension accessibility        | `corepack pnpm --filter kicadstudiokit run test:a11y`                 | `corepack pnpm run check:kicad-studio`         |
| Extension integration behavior | `corepack pnpm --filter kicadstudiokit run test:integration`          | `corepack pnpm run check:kicad-studio`         |
| Extension webview/E2E behavior | `corepack pnpm --filter kicadstudiokit run test:e2e`                  | `corepack pnpm run check:kicad-studio`         |
| Extension visual snapshots     | `corepack pnpm --filter kicadstudiokit run test:visual`               | Windows PR lane for committed goldens          |
| MCP unit behavior              | See [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)   | Run from the `oaslananka/kicad-mcp` repository |
| MCP full behavior              | See [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)   | Run from the `oaslananka/kicad-mcp` repository |
| Protocol or compatibility      | `corepack pnpm run check:protocol-schemas`                            | `corepack pnpm run check`                      |
| Protocol PR checklist          | `corepack pnpm run check:protocol-pr-template`                        | `corepack pnpm run check`                      |
| KiCad GUI smoke wiring         | `corepack pnpm run check:kicad-gui-smoke`                             | `corepack pnpm run check`                      |
| Real KiCad GUI smoke           | See [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)   | Run from the `oaslananka/kicad-mcp` repository |
| Fixtures                       | `corepack pnpm run test:fixtures`                                     | `corepack pnpm run check`                      |

## KiCad Fixture Corpus

The canonical fixture package for OASLANA-53 lives at
`packages/kicad-fixtures/` and is documented in
[`docs/kicad-fixture-corpus.md`](kicad-fixture-corpus.md).

Use semantic fixture IDs from `manifest.json` rather than hard-coded directory
walks in tests. Regenerate fixtures only through the explicit generator:

```bash
corepack pnpm run fixtures:kicad:generate
```

The fixture gate is deterministic and does not invoke KiCad, VS Code, or MCP
servers implicitly:

```bash
corepack pnpm run test:fixtures
```

## CI Ownership

CI ownership follows product boundaries:

- `.github/workflows/ci.yml` owns path-filtered fast PR lanes for metadata,
  extension, shared packages, integration contracts, extension performance
  budgets, and forbidden reference checks.
- `.github/workflows/security.yml`, `.github/workflows/gitleaks.yml`, and
  `.github/workflows/codeql.yml` own security and static analysis lanes.
- `.github/workflows/vscode-canary.yml` owns scheduled/manual VS Code
  compatibility lanes sourced from `compatibility.yaml`.
- `.github/workflows/cross-repo-compatibility.yml` owns published
  `kicad-mcp` artifact compatibility checks for this repo.
- `oaslananka/kicad-mcp` owns real KiCad CLI, GUI IPC, and MCP transport
  canaries.
- Product-specific validation remains inside each product package so the root
  workflow can compose it without direct source imports between products.

## Source Verification

This strategy was checked against current primary sources:

- VS Code extension testing docs for Extension Development Host and
  `@vscode/test-electron`.
- VS Code webview UX guidance for constrained webview usage and native UI
  preference.
- W3C WCAG 2.1 Recommendation for Level AA success criteria and conformance
  model.
- Deque axe-core documentation for WCAG 2.1 A/AA rule tags and browser-based
  accessibility automation.
- Playwright visual comparison docs for `toHaveScreenshot`, snapshot naming,
  and snapshot update flow.
- KiCad 10 command-line documentation for `kicad-cli` driven ERC, DRC, export,
  and version checks.
- KiCad PCB Editor documentation for action-plugin/GUI scripting boundaries and
  KiCad IPC API developer documentation for live-editor automation scope.
- KiCad Windows Downloads for supported Windows versions and current stable
  10.0.3 installer availability.
- Chocolatey KiCad package metadata for the pinned Windows CI install command
  and checksum-backed official KiCad installer URL.
- GitHub Actions artifact documentation and `actions/upload-artifact` metadata
  for scheduled failure log and screenshot uploads.
- GitHub Actions workflow syntax docs for `pull_request` path filtering,
  two-dot/three-dot diff behavior, job outputs through `GITHUB_OUTPUT`, job
  conditionals through `needs.<job>.outputs`, and `GITHUB_STEP_SUMMARY`.
- Model Context Protocol 2025-06-18 transport docs for Streamable HTTP,
  session handling, and `MCP-Protocol-Version`.
- GitHub Actions workflow syntax docs for scheduled and manually dispatched
  non-release quality gates.
