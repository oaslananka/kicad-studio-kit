# KiCad Studio Kit Agent Instructions

This file is the repository-wide contract for coding agents. Follow higher-priority
system and operator instructions first, then this hierarchy.

## Scope and precedence

- These rules apply to the whole repository.
- A nested `AGENTS.md` may add or narrow rules for its subtree. The closest applicable `AGENTS.md` wins for scoped implementation details.
- Nested instructions must not weaken repository-wide security, compatibility, release,
  evidence, licensing, or product-truth constraints unless the underlying policy is
  intentionally changed in the same pull request.
- Executable policy and checked-in contracts remain authoritative when prose drifts. Fix
  the prose and the enforcing check together instead of bypassing either one.
- `AGENTS.md` is the canonical coding-agent instruction surface. Do not introduce a
  parallel agent instruction hierarchy.

## Nested instruction boundaries

Read the root file plus the closest applicable nested file before editing a path.

| Path | Owned boundary |
| --- | --- |
| `.github/AGENTS.md` | CI, required checks, Actions permissions, release/publish workflows, provenance |
| `scripts/AGENTS.md` | repository policy-as-code, validators, generators, governance checks |
| `apps/vscode-extension/AGENTS.md` | shipped VS Code extension, workspace trust, webviews, package/marketplace contract |
| `apps/vscode-extension/src/cli/AGENTS.md` | KiCad CLI discovery and external-process execution |
| `apps/vscode-extension/src/mcp/AGENTS.md` | extension-side MCP protocol, compatibility, transport and session lifecycle |
| `apps/vscode-extension/src/boardreadyops/AGENTS.md` | external BoardReadyOps contract and manufacturing release gate |
| `packages/test-harness/AGENTS.md` | private, test-only shared utilities |
| `packages/kicad-fixtures/AGENTS.md` | deterministic KiCad fixture and golden-evidence corpus |

Do not add another nested instruction file merely because a directory exists. Add one only
when a distinct authority, trust, compatibility, release, or generated-evidence boundary
needs rules that are materially different from its parent.

## Repository identity and product boundaries

- Canonical repo: `oaslananka/kicad-studio-kit`.
- The only product released from this repository is the KiCad Studio VS Code extension
  under `apps/vscode-extension`.
- `packages/kicad-fixtures` and `packages/test-harness` are private test infrastructure,
  not production or publishing surfaces.
- The KiCad MCP Pro server lives in a separate repository. This repository owns only the
  extension-side MCP integration contract, compatibility metadata, client examples and
  published-artifact canaries.
- BoardReadyOps is also an external product. This repository owns its extension-side
  contract parsing, invocation and release-gate integration, not BoardReadyOps internals.
- Do not reintroduce removed MCP server, launcher or protocol-schema source workspaces.
- Cross-product work must use published contracts, compatibility metadata, fixtures and
  canaries rather than copied or relative implementation imports.
- Do not introduce another canonical repository, mirror authority or release root.

## Product truth and evidence

- KiCad remains the source of truth for KiCad design files.
- Do not present an extension heuristic, readiness score, compatibility guess, screenshot,
  benchmark or external-tool response as stronger evidence than its contract supports.
- A numeric readiness score never overrides a blocking manufacturing or policy finding.
- Do not fabricate KiCad support, MCP capability, BoardReadyOps compatibility, marketplace
  publication, provenance, scanner results, review completion or release evidence.
- Authentic Marketplace product screenshots are evidence-backed extension-host captures;
  do not replace them with synthetic, AI-generated or pixel-drawn UI while presenting them
  as real product evidence.
- Do not weaken coverage, mutation, compatibility, security, policy, packaging or release
  thresholds simply to make a change pass.

## Required first reads

Before changing behavior, read the relevant source, tests, docs, manifests and workflows.
For repo-wide orientation, start with:

- `README.md`
- `docs/architecture/repo-structure.md`
- `docs/architecture/product-boundaries.md`
- `docs/architecture/vscode-hotspots.md`
- `docs/testing-strategy.md`
- `docs/support-matrix.md`
- `docs/release.md`
- `docs/security/threat-model.md`
- `docs/architecture/review-evidence-policy.md`
- `docs/architecture/protocol-change-checklist.md`

For MCP server implementation or protocol-schema source, use the KiCad MCP Pro repository
rather than creating local server code here.

## Local toolchain and commands

Use the checked-in package manager, lockfile and runtime versions.

Linux/macOS and Windows PowerShell:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
corepack pnpm run verify:dist
```

Useful repository-policy checks:

```text
corepack pnpm run check:agent-configs
corepack pnpm run check:boundaries
corepack pnpm run check:vscode-architecture
corepack pnpm run check:ci-lanes
corepack pnpm run check:compatibility-contract
corepack pnpm run check:review-evidence
corepack pnpm run docs:lint
corepack pnpm run docs:links
```

`corepack pnpm run check` is the complete repository quality gate and can be expensive.
Run the narrowest relevant check first, then the broader gate required by the touched
boundary.

## Architecture and dependency discipline

- Production source under `apps/vscode-extension/src` must not import
  `@oaslananka/kicad-test-harness`, `@oaslananka/kicad-fixtures` or their workspace
  source paths.
- Shared packages under `packages/*` must not import product internals from
  `apps/vscode-extension`.
- Keep the VS Code production TypeScript import graph cycle-free. Run
  `corepack pnpm run check:vscode-architecture` when production architecture changes.
- Preserve the responsibility boundaries documented in
  `docs/architecture/vscode-hotspots.md`; do not collapse pure models back into
  process-, filesystem-, VS Code- or network-facing orchestration without an explicit
  architecture reason and regression evidence.
- Prefer existing schemas, helpers, fixtures and validators over parallel mechanisms.

## Security and trust

- Treat workspace content, configured paths, KiCad files, MCP responses, external-tool
  output, provider data and webview-rendered content as untrusted until validated.
- Workspace trust must be enforced in code before state-changing writes, exports, MCP
  actions, PCM operations or other privileged behavior. Menu visibility is not a security
  control.
- Preserve canonical-path and symlink-aware confinement where an operation is restricted
  to the workspace.
- Secrets belong in VS Code SecretStorage or protected GitHub environments, never plaintext
  settings, logs, fixtures or committed configuration.
- Do not add unsafe webview script behavior, broad local-resource access, dynamic code
  execution or CSP/nonce bypasses.
- Do not configure remote MCP endpoints by default. Loopback/local examples remain the
  default unless a task explicitly requires remote or tunneled transport and its token,
  trust and threat model are documented.

## MCP safety defaults

- MCP operating modes are `readonly`, `write`, `manufacturing` and `experimental`.
- Default examples and agent workflows to `KICAD_MCP_OPERATING_MODE=readonly`.
- Prefer focused profiles such as `analysis`, `pcb_only` or `schematic_only` instead
  of broad capability sets.
- Use `KICAD_MCP_OPERATING_MODE=write`, `manufacturing` or `experimental` only when
  the issue explicitly requires that authority and document why.
- Protocol-impacting changes must follow
  `docs/architecture/protocol-change-checklist.md` and preserve cross-repository
  compatibility evidence.

## Generated and governed state

- Do not hand-edit generated documentation, fixture goldens, generated release surfaces,
  capture manifests or derived assets when the repository provides an owning generator.
- Change the owning source/generator, regenerate deliberately and run the matching drift
  check.
- Do not update a baseline, allowlist, exclusion, survivor list or evidence manifest merely
  to hide a regression. Explain and test intentional policy changes.

## GitHub, review and release rules

- Keep each branch and PR single-purpose. Do not mix unrelated cleanup.
- Link the issue when one exists and state the affected product/trust boundaries.
- Every bot and agent finding must be triaged according to
  `docs/architecture/review-evidence-policy.md`; an unavailable reviewer is not a
  completed review.
- Protocol-impacting PRs must complete the protocol section in
  `.github/PULL_REQUEST_TEMPLATE.md`.
- The release bot PR is automation-owned; do not modify or merge it unless the explicit
  task is release-bot maintenance.
- Do not tag, publish, dispatch release workflows, rotate marketplace credentials or
  change protected-environment authority unless the task explicitly requires it.
- User-facing behavior changes require docs and, where applicable, changelog/release-note
  consideration.
- Security-sensitive changes require focused regression evidence and human review.

## Secrets

Never read, print, summarize, commit or paste secret-bearing files such as `.env`,
credential JSON, private keys, token stores, cookies or local authentication state.

## Definition of done

Before calling a change ready:

1. The diff is limited to the intended issue/boundary.
2. Relevant nested `AGENTS.md` instructions were followed.
3. Focused tests cover behavior or policy changes; bug fixes include regression evidence
   when practical.
4. Relevant lint, typecheck, architecture, compatibility, security, packaging and policy
   checks pass without weakened gates.
5. Generated artifacts are refreshed only through their owning workflow.
6. Docs and compatibility/release notes are updated when the public contract changed.
7. Bot/reviewer findings are triaged and no actionable thread remains unresolved.
8. No publish or release action was performed unless explicitly requested.
