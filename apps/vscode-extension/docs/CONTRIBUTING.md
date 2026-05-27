# Contributing To KiCad Studio

## Development Setup

1. Install Node.js `24.14.1`, pnpm `11.3.0`, and VS Code 1.120+.
2. Run `pnpm install --frozen-lockfile`.
3. Press `F5` to launch the Extension Development Host.
4. Let the Git hooks handle fast staged checks on commit and run `pnpm run check` before push.
5. Run `pnpm run check:ci` when you want the closest local equivalent of the primary CI package gate.
6. Run `pnpm test` before sending substantial changes when the integration host is available.
7. Run `pnpm run test:e2e` for the desktop smoke suite when a Windows desktop session is available.

## Project Areas

- `src/extension.ts`: activation and command wiring
- `src/cli/`: KiCad CLI integration
- `src/providers/`: viewers and webview helpers
- `src/mcp/`: MCP detection, transport, context bridge, and UI
- `src/ai/`: providers, prompts, and chat panel
- `src/variants/`: KiCad 10 variant sidebar
- `src/drc/`: graphical DRC rules sidebar
- `test/unit/`: Jest-based unit coverage
- `test/e2e/`: Playwright-driven VS Code desktop smoke coverage

## Commit Style

Examples:

- `feat(mcp): add fix queue sidebar`
- `fix(viewer): restore layer visibility on refresh`
- `docs(readme): document organization-first CI flow`
- `test(prompts): cover KiCad 10 grouped DRC summaries`

Allowed prefixes:

- `feat`
- `fix`
- `test`
- `docs`
- `refactor`
- `perf`
- `chore`

## Pull Request Checklist

- `pnpm run lint` passes
- `pnpm run check` passes
- `pnpm run test:e2e` passes for desktop-facing changes when the environment supports it
- relevant docs are updated
- screenshots or reproduction notes are included for UI changes
- new commands/settings are reflected in `package.json`

## CI/CD Expectations

- The `oaslananka` GitHub repository owns the primary automated CI/CD workflows.
- Marketplace publishing is approval-gated through the GitHub `release` environment.
