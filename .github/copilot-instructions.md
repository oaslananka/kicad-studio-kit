# GitHub Copilot Instructions

Follow `AGENTS.md` for repository-wide rules. Copilot is an external coding agent and
MCP-capable client for this repo; do not treat Codex, Claude, Copilot, Gemini, and Cursor
as direct KiCad Studio extension AI providers unless the touched extension code explicitly
does that.

## Project Shape

- `apps/vscode-extension` contains the VS Code extension.
- `packages/mcp-server` contains the Python `kicad-mcp-pro` MCP server.
- `packages/mcp-npm` contains the npm launcher wrapper.
- `packages/test-harness` contains private shared test helpers.

## Coding Rules

- Keep pull requests scoped to one issue.
- Prefer existing helpers, schemas, fixtures, and validation scripts over new parallel
  patterns.
- Update docs when user-visible behavior, commands, settings, or MCP config changes.
- Keep product boundaries from `docs/architecture/product-boundaries.md`: extension source
  must not import MCP server internals, server code must not import extension source, and
  production code must not depend on `packages/test-harness`.
- Protocol-impacting changes must satisfy `.github/PULL_REQUEST_TEMPLATE.md` and
  `docs/architecture/protocol-change-checklist.md`.
- Do not add release, tag, or publish behavior unless the issue is explicitly a release
  task.
- Do not commit secrets, local credential files, or machine-specific production paths.

## Validation

Run the narrowest relevant test first, then the root gates when the change is ready.

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

For MCP server or Python changes, also run the Python validation documented in
`AGENTS.md`.

## MCP Defaults

Use `examples/mcp-clients/` for copyable client setup. Keep examples in
`readonly` operating mode by default and use a focused profile such as `analysis` or
`pcb_only`. Do not configure remote MCP endpoints by default; use loopback examples unless
the issue explicitly requires a remote or tunneled server and token handling is documented.

## PR Checklist

- Link the PR to the Linear issue.
- State the product surfaces changed and the validation commands run.
- Explain why broader MCP modes, protocol changes, or release/export behavior are needed
  when they appear in the diff.
- Watch CI to a terminal state after pushing and fix failures before calling the PR ready.
