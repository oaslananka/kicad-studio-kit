# KiCad Studio Kit Agent Instructions

This file is the repository-local contract for coding agents. Follow higher-priority
system and operator instructions first, then these repo rules. Any MCP-capable client or
coding agent that consumes this repository should treat `AGENTS.md` as the canonical
repository instructions.

## Repository Boundaries

- Canonical repo: `oaslananka/kicad-studio-kit`.
- Product surfaces:
  - `apps/vscode-extension`: KiCad Studio VS Code extension.
  - `packages/test-harness`: private shared test utilities.
- The MCP server lives in a separate repository — see
  [oaslananka/kicad-mcp-pro](https://github.com/oaslananka/kicad-mcp-pro).
- Do not introduce another canonical repository or release root.
- Keep issue scope narrow. Do not mix unrelated issues in one branch or PR.

## Required First Reads

Before changing behavior, read the relevant source, tests, docs, manifests, and workflow
files. For repo-wide orientation, start with:

- `README.md`
- `docs/architecture/repo-structure.md`
- `docs/architecture/product-boundaries.md`
- `docs/testing-strategy.md`
- `docs/support-matrix.md`
- `docs/release.md`
- `docs/agents/client-configs.md`
- `docs/architecture/protocol-change-checklist.md`
- MCP server docs (see [oaslananka/kicad-mcp-pro](https://github.com/oaslananka/kicad-mcp-pro))

## Local Commands

Use the repository package managers and lockfiles. From the repo root:

Linux/macOS:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
corepack pnpm run verify:dist
```

Windows PowerShell:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
corepack pnpm run verify:dist
```

Python/MCP server tests run from the
[oaslananka/kicad-mcp-pro](https://github.com/oaslananka/kicad-mcp-pro) repository.

Repo-policy checks that are often relevant:

```bash
corepack pnpm run check:agent-configs
corepack pnpm run check:ci-lanes
corepack pnpm run docs:lint
corepack pnpm run docs:links
```

## MCP Safety Defaults

- MCP operating modes are `readonly`, `write`, `manufacturing`, and `experimental`.
- Default external MCP examples and agent workflows to `KICAD_MCP_OPERATING_MODE=readonly`.
- Prefer focused profiles such as `analysis`, `pcb_only`, `schematic_only`, or
  `manufacturing` instead of `full`.
- Use `KICAD_MCP_OPERATING_MODE=write`, `manufacturing`, or `experimental` only when the
  issue explicitly requires source modification, manufacturing/export handoff, or
  experimental tools, and document the reason in the PR.
- Do not commit machine-specific production paths, fixture paths as defaults, tokens, API
  keys, cookies, or private credentials.
- Do not configure remote MCP endpoints by default. Use loopback examples unless the issue
  explicitly asks for a remote/tunneled deployment and token handling is documented.
- Do not add unsafe webview script, network, or workspace-trust bypasses.
- Client setup examples live in `examples/mcp-clients/`; keep them parseable and
  copy-pastable after replacing `/absolute/path/to/your/kicad-project`.

## GitHub And PR Rules

- Use one branch per issue with a short, descriptive slug.
- Link each PR to the corresponding GitHub issue when one exists.
- The release bot PR is maintained automatically; do not modify or merge it unless the
  explicit task is a release-bot maintenance task.
- Protocol-impacting PRs must complete `.github/PULL_REQUEST_TEMPLATE.md` and the checklist
  in `docs/architecture/protocol-change-checklist.md`.
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

## MCP Client Setup

Checked-in client configuration examples live under `examples/mcp-clients/`. Copy the
example that matches your client, then replace `/absolute/path/to/your/kicad-project` with
the target KiCad project path before placing the config in a real client location. Review
any shared project-scoped MCP config (for example a project `.mcp.json`) before trusting
servers from another branch or contributor.

The recommended local server runs over stdio via `uvx kicad-mcp-pro` with a read-only,
focused profile. See `examples/mcp-clients/generic-stdio.mcp.example.json` for a minimal
configuration:

```json
{
  "mcpServers": {
    "kicad": {
      "type": "stdio",
      "command": "uvx",
      "args": ["kicad-mcp-pro"],
      "env": {
        "KICAD_MCP_PROJECT_DIR": "/absolute/path/to/your/kicad-project",
        "KICAD_MCP_PROFILE": "pcb_only",
        "KICAD_MCP_OPERATING_MODE": "readonly"
      }
    }
  }
}
```

Use broader MCP operating modes only for tasks that explicitly require write,
manufacturing, or experimental tools.
