# How-to: Run Local Quality Gates

Use this guide when preparing a pull request.

## Fast documentation-only checks

```bash
corepack pnpm run docs:lint
corepack pnpm run docs:links
corepack pnpm run check:repo-governance
```

## Extension change checks

```bash
corepack pnpm --filter kicadstudiokit run format:check
corepack pnpm --filter kicadstudiokit run lint
corepack pnpm --filter kicadstudiokit run typecheck
corepack pnpm --filter kicadstudiokit run test:unit
corepack pnpm --filter kicadstudiokit run test:security
corepack pnpm --filter kicadstudiokit run test:a11y
corepack pnpm --filter kicadstudiokit run build
corepack pnpm --filter kicadstudiokit run package
corepack pnpm --filter kicadstudiokit run package:validate
```

## Repository-level checks

```bash
corepack pnpm run check:version
corepack pnpm run check:supply-chain
corepack pnpm run check:best-practices
corepack pnpm run check:ci-lanes
corepack pnpm run check:testing-strategy
corepack pnpm run check:docs-site
```

## Display-bound tests on Linux

Visual, e2e, and VS Code host integration tests require a display. CI uses Xvfb. Locally, run them inside a desktop session or through `xvfb-run` when available.

## PR evidence

Paste the exact commands and results into the pull request template. For docs-only PRs, mark runtime gates as not applicable with a short reason.
