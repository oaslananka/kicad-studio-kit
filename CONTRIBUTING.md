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

For MCP server work:

```bash
uv sync --all-extras --frozen --project packages/mcp-server
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
- `packages/mcp-server/` for KiCad MCP Pro server and MCP Registry metadata.
- `packages/mcp-npm/` for npm launcher work.
- `packages/protocol-schemas/` for protocol schemas and compatibility review.
- `examples/` for user-facing KiCad examples.

Branch protection policy is documented in
[docs/architecture/branch-protection.md](docs/architecture/branch-protection.md)
and encoded for import in [`.github/rulesets/main.json`](.github/rulesets/main.json).

## Regression coverage

Bug fixes require automated regression coverage when practical. Use unit tests, integration tests, fixture checks, contract tests, or visual/a11y checks depending on the changed surface. If automation is not practical, state the reason and include the manual verification command or artifact in the PR notes.
