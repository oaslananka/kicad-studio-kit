# KiCad Studio Kit Agent Instructions

This file is the repository-local contract for coding agents. Follow higher-priority
system and operator instructions first, then these repo rules.

## Repository Boundaries

- Canonical repo: `oaslananka/kicad-studio-kit`.
- Product surfaces:
  - `apps/vscode-extension`: KiCad Studio VS Code extension.
  - `packages/mcp-server`: `kicad-mcp-pro` Python MCP server.
  - `packages/mcp-npm`: npm launcher wrapper.
  - `packages/test-harness`: private shared test utilities.
- Do not introduce another canonical repository or release root.
- Keep issue scope narrow. Do not mix unrelated Linear/GitHub issues in one branch or PR.

## Required First Reads

Before changing behavior, read the relevant source, tests, docs, manifests, and workflow
files. For repo-wide orientation, start with:

- `README.md`
- `docs/architecture/repo-structure.md`
- `docs/architecture/product-boundaries.md`
- `docs/testing-strategy.md`
- `packages/mcp-server/docs/client-configuration.md`
- `docs/agents/client-configs.md`
- `docs/agents/codex-support.md`

## Local Commands

Use the repository package managers and lockfiles. From the repo root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
corepack pnpm run verify:dist
```

When Python or MCP server code changes, also run:

```bash
uv sync --all-extras --frozen --project packages/mcp-server
uv run --project packages/mcp-server --all-extras pytest
```

Repo-policy checks that are often relevant:

```bash
corepack pnpm run check:agent-configs
corepack pnpm run check:ci-lanes
corepack pnpm run docs:lint
corepack pnpm run docs:links
```

## MCP Safety Defaults

- Default external MCP examples to `KICAD_MCP_OPERATING_MODE=readonly`.
- Prefer focused profiles such as `analysis`, `pcb_only`, `schematic_only`, or
  `manufacturing` instead of `full`.
- Use `write`, `manufacturing`, or `experimental` only when the task explicitly needs that
  tool surface and the PR documents the reason.
- Do not commit machine-specific production paths, fixture paths as defaults, tokens, API
  keys, cookies, or private credentials.
- Client setup examples live in `examples/mcp-clients/`; keep them parseable and
  copy-pastable after replacing `/absolute/path/to/your/kicad-project`.

## GitHub And PR Rules

- Branch format for Linear work: `codex/OASLANA-<id>-<slug>`.
- Link PRs to the corresponding Linear issue and GitHub issue when one exists.
- PR #16 is the release bot PR; do not modify or merge it unless the explicit task is a
  release-bot maintenance task.
- Do not tag, publish, or run release workflows unless the task is explicitly a release.
- After pushing a PR branch, watch required checks to a terminal state and fix failures.

## Documentation Rules

- User-facing behavior changes need docs updates.
- Generated docs under `docs/extension/*.md` are refreshed with
  `corepack pnpm run docs:generate`; do not hand-edit generated content.
- New Markdown files under `docs/` must have exactly one H1 and valid internal links.

## Secrets

Never read, print, summarize, commit, or paste secret-bearing files such as `.env`,
credential JSON, private keys, token stores, cookies, or local auth state.
