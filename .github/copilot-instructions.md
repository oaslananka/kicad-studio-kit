# GitHub Copilot Instructions

Follow `AGENTS.md` for repository-wide rules.

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
- Do not add release, tag, or publish behavior unless the issue is explicitly a release
  task.
- Do not commit secrets, local credential files, or machine-specific production paths.

## Validation

Run the narrowest relevant test first, then the root gates when the change is ready:

```bash
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
`readonly` operating mode by default and use a focused profile such as `analysis`.
