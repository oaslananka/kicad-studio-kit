# Contributing

Use the canonical repository at https://github.com/oaslananka/kicad-studio-kit.

Before opening a pull request, run:

```bash
corepack pnpm run check:forbidden-refs
corepack pnpm run check:boundaries
corepack pnpm run check:version
corepack pnpm run check:compatibility
corepack pnpm run check:runtime-policy
corepack pnpm run check:dev-doctor
corepack pnpm run check:devcontainer
```

For local setup diagnostics, run:

```bash
corepack pnpm run dev:doctor
corepack pnpm run dev:doctor -- --json
```

For extension-only work:

```bash
corepack pnpm run check:kicad-studio
corepack pnpm run test:kicad-studio
corepack pnpm run build:kicad-studio
corepack pnpm run package:kicad-studio
```

For MCP server work (source at [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)):

```bash
corepack pnpm run check:kicad-mcp-pro
corepack pnpm run test:kicad-mcp-pro
corepack pnpm run build:kicad-mcp-pro
corepack pnpm run package:kicad-mcp-pro
```

For protocol or integration work:

```bash
corepack pnpm run test:contract
corepack pnpm run test:fixtures
```

Protocol-impacting pull requests must complete the protocol section in
`.github/PULL_REQUEST_TEMPLATE.md`. This applies to MCP tool names, tool
schemas, capability metadata, transport behavior, server-info payloads,
compatibility metadata, and extension MCP adapter behavior. Mark the section not
applicable with a reason when none of those surfaces are touched. The checklist
policy is documented in
[docs/architecture/protocol-change-checklist.md](docs/architecture/protocol-change-checklist.md).

Report KiCad, VS Code, MCP protocol, dependency, or release-tool compatibility failures with the compatibility regression issue form. Include old and new versions, the failing command or workflow, and any canary run link.

Runtime support changes must also follow [docs/support-matrix.md](docs/support-matrix.md).
Changing `engines.vscode`, Python `requires-python`, or the primary KiCad support line requires
the matching `compatibility.yaml` update, this support matrix update, and product changelog context
when a lower runtime boundary is introduced.

## Developer Certificate of Origin

By contributing a non-trivial change, you certify the [Developer Certificate of
Origin 1.1](https://developercertificate.org/). Add a `Signed-off-by` trailer
to every commit:

```bash
git commit -s
```

The sign-off means that you wrote the contribution or otherwise have the right
to submit it under this project's license. Pull requests with non-trivial code,
test, documentation, CI, or release-process changes must include signed-off
commits or document why the DCO requirement is not applicable.

## Architecture Decision Records

Architecture, product, protocol, release, and security decisions that affect
the monorepo structure, integration surface, or compatibility policy must be
documented as Architecture Decision Records (ADRs).

An ADR is **required** for:

- Monorepo structure changes (adding, removing, or merging workspaces).
- MCP protocol or schema breaking changes.
- KiCad version support policy changes.
- Release model changes.
- Product dependency boundary changes.
- Bundling or distribution changes.
- Security or supply-chain policy changes.

An ADR is **not required** for routine dependency updates, bug fixes,
cosmetic changes, CI/tooling changes, or test-only changes.

See [docs/adr/README.md](docs/adr/README.md) for the full process, template,
and index of existing ADRs.

## Dev Container

The repository includes a VS Code Dev Containers and GitHub Codespaces setup in
[docs/devcontainer.md](docs/devcontainer.md). Inside the container,
`corepack pnpm run dev-doctor -- --require-devcontainer` confirms the
devcontainer marker and required tools.

## Issue order

Work should follow the governance phases in [docs/architecture/governance-board.md](docs/architecture/governance-board.md):

1. Monorepo foundation and product boundaries.
2. Shared tests, fixtures, schemas, and contract infrastructure.
3. MCP compatibility foundation.
4. UI/UX and known product bugs.
5. Release, dependency, and supply-chain hardening.

Keep PRs single-purpose. Do not mix folder moves, CI rewrites, UI bug fixes, and release changes in one branch.

## Ownership

CODEOWNERS review should match the changed paths:

- `.github/` for CI, release, labels, and governance.
- `docs/architecture/` for architecture and release model.
- `apps/vscode-extension/` for KiCad Studio extension work.
- `packages/mcp-server/` (removed — see [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)) for KiCad MCP Pro server and MCP Registry metadata (canonical source at [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)).
- `packages/test-harness/` for shared test-only fixtures, mocks, golden
  assertions, temporary workspaces, and MCP/webview helpers.
- `examples/` for user-facing KiCad examples.

Branch protection policy is documented in
[docs/architecture/branch-protection.md](docs/architecture/branch-protection.md)
and encoded for import in [`.github/rulesets/main.json`](.github/rulesets/main.json).

## Dynamic analysis

Before a proposed production release, run the dynamic analysis gate for runtime
and UI-facing behavior:

```bash
corepack pnpm --filter kicadstudiokit run test:dynamic-analysis
```

This gate exercises runtime assertions through the extension security suite,
webview DOM tests, and accessibility checks. The CI extension matrix also runs
integration and package validation flows before release.

## Regression coverage

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
