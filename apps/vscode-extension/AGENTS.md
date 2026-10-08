# VS Code Extension Agent Instructions

These instructions apply to `apps/vscode-extension/**` and supplement the repository
root `AGENTS.md`. More specific rules exist under `src/cli`, `src/mcp` and
`src/boardreadyops`.

## Product boundary

This workspace is the only product released from this repository. Changes can affect
extension-host execution, workspace files, external processes, webviews, credentials,
marketplace packaging and user-visible manufacturing/export workflows.

Workspace trust is a code-level security boundary. UI visibility or disabled menu items do
not replace runtime trust checks.

## Trust and input handling

- Treat KiCad files, workspace paths, settings, provider/MCP responses, imported archives,
  external CLI output and webview-bound data as untrusted until validated.
- State-changing writes, exports, MCP actions, PCM installation and similar privileged
  operations must remain gated by VS Code workspace trust where applicable.
- Preserve canonical/real-path and symlink-aware workspace confinement for guarded paths.
- Credentials belong in VS Code SecretStorage. Do not introduce plaintext runtime fallback
  settings for API keys or tokens.
- Do not expose secrets or private paths through logs, diagnostics, telemetry, webviews,
  release manifests or error messages.

## Webviews and browser content

- Keep CSP restrictive, use nonces for allowed scripts and keep local resource roots
  minimal.
- Escape project-, provider- and external-tool-controlled text before rendering it.
- Do not introduce `eval`, `new Function`, arbitrary remote script execution or other
  dynamic-code shortcuts.
- Webview changes need relevant unit/security/webview tests plus accessibility/visual
  evidence when user-visible layout or interaction changes.

## Architecture

- Production source must not import `@oaslananka/kicad-test-harness`,
  `@oaslananka/kicad-fixtures` or their workspace source paths.
- Keep the production TypeScript graph cycle-free and run
  `corepack pnpm run check:vscode-architecture` when module dependencies change.
- Preserve the responsibility ownership documented in
  `docs/architecture/vscode-hotspots.md`.
- Prefer pure extracted models/builders over coupling deterministic logic back to VS Code,
  filesystem, process, network or UI orchestration.

## Package and contribution contract

Changes to command IDs, settings, views, activation, languages, menus, schemas, keybindings
or localization must keep `package.json`, constants, NLS resources, tests and generated
documentation aligned. Run the extension-manifest/package checks instead of relying on a
manual smoke alone.

## Coverage and mutation

- Do not lower Jest coverage floors, targeted coverage ratchets or mutation thresholds to
  land unrelated work.
- Do not shrink mutation scope, mutant counts or survivor policy without reviewed evidence.
- Add focused tests for new error, empty, trust-denied and degraded paths in high-risk
  orchestration code.

## Marketplace evidence

Marketplace screenshots are authentic extension-host evidence. Preserve the controlled
capture provenance, fixture, source fingerprint and package validation contract. Do not
present synthetic or AI-generated UI as a real product capture.

## Validation

Start with the narrowest relevant command, then use the product gate:

```text
corepack pnpm --filter kicadstudiokit run lint
corepack pnpm --filter kicadstudiokit run typecheck
corepack pnpm --filter kicadstudiokit run test
corepack pnpm --filter kicadstudiokit run check
corepack pnpm run check:vscode-architecture
corepack pnpm run verify:dist
```

Use the dedicated security, accessibility, visual, real-pair, fixture, coverage and mutation
lanes when the touched boundary requires them.
