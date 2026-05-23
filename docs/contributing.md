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
```

Product-scoped checks:

```bash
corepack pnpm run check:kicad-studio
corepack pnpm run check:kicad-mcp-pro
corepack pnpm run check:mcp-npm
corepack pnpm run test:contract
```

## Issue Order

Work follows the governance phases documented in
[governance board model](architecture/governance-board.md).

## Ownership

Ownership and branch protection are documented in
[branch protection](architecture/branch-protection.md) and the repository
`CODEOWNERS` file.

## Regression Coverage

Bug fixes should include automated regression coverage when practical. Use unit tests,
integration tests, fixture checks, contract tests, or visual/accessibility checks based on the
changed surface.

Runtime support changes must follow the [support matrix](support-matrix.md).
