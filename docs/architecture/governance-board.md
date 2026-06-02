# Governance Board Model

This repository is managed as a two-product monorepo. GitHub Projects should be used as the execution board for all architecture, testing, compatibility, UI/UX, release, and security work.

## Required project fields

| Field    | Values                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Product  | `vscode-extension`, `mcp-server`, `shared`, `repo`                                                                       |
| Area     | `architecture`, `testing`, `mcp`, `viewer`, `diagnostics`, `release`, `security`, `docs`, `ci`, `ui-ux`, `compatibility` |
| Priority | `P0`, `P1`, `P2`, `P3`                                                                                                   |
| Phase    | `M0 foundation`, `M1 test foundation`, `M2 MCP compatibility`, `M3 premium UI/UX`, `M4 release hardening`                |
| Status   | `Backlog`, `Ready`, `In Progress`, `Review`, `Blocked`, `Done`                                                           |
| Risk     | `low`, `medium`, `high`                                                                                                  |

## Milestone mapping

### M0 — Monorepo Foundation

Foundation work that must land before broad feature fixes.

Issues:

- #49 Restructure monorepo into two independent product workspaces
- #50 Define monorepo ownership boundaries and enforce import/dependency rules
- #51 Update workspace tooling for product-scoped development commands
- #52 Separate release pipelines for the extension and MCP server
- #56 Document monorepo architecture, product boundaries, and integration model
- #63 Track monorepo restructure migration phases
- #68 Add machine-readable compatibility matrix
- #79 Define coding-agent execution policy and issue resolution order

Completion evidence: [M0 completion audit](m0-completion-audit.md).

### M1 — Test Foundation

Testing infrastructure and deterministic fixture coverage.

Issues:

- #36 Build maximum automated test strategy and CI quality gates
- #37 Add KiCad fixture corpus with golden expected outputs
- #38 Add unit test suite for KiCad project discovery, command builders, diagnostics, and state machines
- #39 Add KiCad CLI contract tests across KiCad 8.x, 9.x, and 10.x
- #40 Add VS Code extension integration tests
- #41 Add webview DOM tests
- #42 Add visual regression screenshot tests
- #43 Add accessibility and keyboard-navigation tests
- #44 Add MCP protocol contract tests
- #45 Add real KiCad GUI smoke tests

### M2 — MCP Compatibility

MCP compatibility, transport behavior, live/file-backed capability handling, and real-pair integration.

Issues:

- #34 MCP Streamable HTTP requires session header during ChatGPT connector setup
- #35 MCP PCB read tools report no board open while KiCad PCB Editor has active board
- #57 Add MCP adapter layer inside the KiCad Studio extension
- #58 Add versioned server-info and capabilities contract to KiCad MCP Pro
- #61 Add MCP compatibility dashboard
- #72 Add MCP transport conformance suite
- #73 Add read-only, write, manufacturing, and experimental modes
- #74 Add KiCad MCP Pro doctor command
- #75 Add file-backed fallback strategy for MCP PCB read tools
- #76 Add real-pair E2E compatibility tests

### M3 — Premium UI/UX Reliability

User-facing viewer, diagnostics, sidebar, status, and premium workflow polish.

Issues:

- #17 Viewer renders schematic as tiny low-resolution thumbnail
- #18 Viewer toolbar is visually noisy
- #19 Viewer tools panel should be collapsible and use richer EDA controls
- #20 Sidebar views look like placeholder panels
- #21 Project tree shows duplicate/misaligned file state indicators
- #22 Netlist view reports cannot load netlist while schematic is open
- #23 BOM panel stays in Loading state while showing unusable table
- #24 Quality Gates view shows static PENDING rows
- #25 DRC Rules view should guide users to create/import `.kicad_dru`
- #26 Component Search empty state lacks inline workflow
- #27 MCP Tools connected state lacks health diagnostics
- #28 AI Fix Queue empty state should be actionable
- #29 Status bar has too many unlabeled indicators
- #30 KiCad Studio command picker needs grouped actions
- #33 Diagnostics panel and status bar show stale DRC/ERC errors
- #69 Add centralized extension state stores
- #70 Add diagnostic freshness model
- #71 Add viewer engine abstraction

### M4 — Release, Security, and Lifecycle Hardening

Release safety, supply-chain controls, dependency lifecycle, and user-facing examples.

Issues:

- #46 Add security and Workspace Trust regression tests
- #48 Add package, release, and contribution-manifest validation tests
- #64 Add CODEOWNERS and branch protection policy
- #65 Add supply-chain security pipeline
- #66 Add devcontainer and optional Codespaces prebuild
- #67 Add ADR process
- #80 Add dependency and platform lifecycle policy
- #81 Configure automated dependency update strategy
- #82 Add VS Code scheduled canary CI
- #83 Add KiCad scheduled canary CI
- #84 Add dependency update risk classification
- #85 Add support and deprecation policy
- #86 Add compatibility regression issue template
- #87 Add release compatibility gate
- #88 Add dependency dashboard triage process

## Priority rules

- `P0`: required before broad implementation work or release safety.
- `P1`: high-priority work immediately after foundation.
- `P2`: scheduled product hardening or polish.
- `P3`: non-blocking backlog.

## Board operating rules

1. M0 foundation issues must be Done, or explicitly waived in the PR notes, before broad UI/MCP feature work starts.
2. Mixed-purpose PRs should be rejected or split.
3. Folder moves must not be combined with feature fixes.
4. Protocol changes must update schemas, contract tests, compatibility metadata, and docs.
5. Bug fixes require regression tests unless explicitly documented as not automatable.
6. Release-impacting changes must update release notes or state why no release note is needed.

## Chunked Project v2 sync

Use the repository-local sync tool when assigning many issues to the GitHub
Project v2 board. It uses the existing Project v2 board and fields, adds missing
issue items, and updates selected single-select fields. It does not recreate
labels, milestones, or the project itself. This keeps each run small enough for
hosted connectors and avoids repeating bootstrap work.

Dry-run the next chunk:

```bash
corepack pnpm run governance:sync:dry-run
```

Run a real chunk after `gh auth` has Project scopes:

```bash
node scripts/sync-governance-project-items.mjs \
  --project-number 1 \
  --owner oaslananka \
  --repo kicad-studio-kit \
  --owner-type user \
  --chunk-size 10
```

If the result includes `next_cursor`, continue with:

```bash
node scripts/sync-governance-project-items.mjs \
  --project-number 1 \
  --cursor <next_cursor> \
  --chunk-size 10
```

The JSON result includes `processed_issue_numbers`,
`remaining_issue_numbers`, `next_cursor`, and per-field failures with
`issue_number` and `field`. Re-running a chunk is idempotent because the tool
first looks for an existing Project v2 item for the issue before calling
`addProjectV2ItemById`.
