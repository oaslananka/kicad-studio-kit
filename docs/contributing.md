# Contributing

Source of truth: `CONTRIBUTING.md`

## Local Validation

Run the root checks before opening a pull request:

```bash
corepack pnpm run check:forbidden-refs
corepack pnpm run check:boundaries
corepack pnpm run check:version
corepack pnpm run check:compatibility
corepack pnpm run check:runtime-policy
corepack pnpm run check:dev-doctor
corepack pnpm run check:devcontainer
```

For local setup diagnostics:

```bash
corepack pnpm run dev:doctor
corepack pnpm run dev:doctor -- --json
```

Product-scoped checks:

```bash
corepack pnpm run check:kicad-studio
corepack pnpm run check:kicad-mcp-pro
corepack pnpm run check:mcp-npm
corepack pnpm run test:contract
```

## Protocol Changes

Protocol-impacting pull requests must complete the protocol section in
`.github/PULL_REQUEST_TEMPLATE.md`. This applies to MCP tool names, tool
schemas, capability metadata, transport behavior, server-info payloads,
compatibility metadata, and extension MCP adapter behavior. Mark the section not
applicable with a reason when none of those surfaces are touched.

Checklist policy: [protocol change checklist](architecture/protocol-change-checklist.md).

## Issue Order

Work follows the governance phases documented in
[governance board model](architecture/governance-board.md).

## Ownership

Ownership and branch protection are documented in
[branch protection](architecture/branch-protection.md) and the repository
`CODEOWNERS` file.

## Regression Coverage

Bug-fix pull requests must include automated regression coverage before the
related issue is closed, when practical. The regression evidence should include:

- A test that fails against the pre-fix behavior and passes after the fix.
- A reference to the related issue ID in the test name or test metadata.
- A fixture, golden output, contract case, visual snapshot, or accessibility
  check when that is the right way to reproduce the bug.
- The exact local or CI command that proves the regression now passes.

Apply this policy to repeatable bugs in diagnostics freshness, viewer rendering
and fit-to-screen behavior, MCP transport/session handling, project tree rows,
BOM or netlist loading states, status bar freshness, KiCad CLI compatibility,
and live GUI context.

Exceptions must be explicit in the PR description and explain why the bug is
not practical to automate. A maintainer must approve the exception before the
issue is closed. Manual screenshots alone are not sufficient to close
repeatable bugs.

## Accessibility Coverage

New or changed KiCad Studio UI must keep the accessibility gate current before a
pull request is ready for review:

```bash
corepack pnpm --filter kicadstudiokit run test:a11y
```

Update `apps/vscode-extension/test/a11y/accessibilityConformance.test.ts` when a
change adds or materially changes a webview, custom editor toolbar, side panel,
BOM/Netlist/Component Search surface, MCP Tools tree, Quality Gates tree, AI Fix
Queue tree, status bar item, dialog-like flow, search box, or overlay.

Contributor requirements:

- Keep keyboard order deterministic and free of focus traps.
- Provide accessible names for icon-only, symbolic, status, and toolbar actions.
- Give disabled buttons reason text with `aria-describedby`, title text, or
  adjacent assistive text when the reason is knowable.
- Use VS Code theme tokens and verify dark, light, and high-contrast behavior.
- Include `:focus-visible` styling for production webview controls.
- Include `prefers-reduced-motion: reduce` CSS when a surface uses animation or
  transitions.

See [accessibility conformance target](accessibility.md) for the full policy.

Runtime support changes must follow the [support matrix](support-matrix.md).

## Dev Container

Use the [dev container](devcontainer.md) for reproducible VS Code Dev Containers
or GitHub Codespaces setup. Inside the container,
`corepack pnpm run dev-doctor -- --require-devcontainer` confirms the
devcontainer marker and required tools.
