# KiCad Fixture Corpus Agent Instructions

These instructions apply to `packages/kicad-fixtures/**` and supplement the repository
root `AGENTS.md`.

## Boundary

This package owns the deterministic KiCad fixture and expected-output evidence corpus used
by extension, compatibility and regression tests. It is private test infrastructure, not a
production dependency.

## Manifest and fixture semantics

- `manifest.json` is the stable semantic fixture index. Tests should select fixtures by
  semantic ID/helper rather than hard-code generated file inventories.
- Preserve the intent of regression fixtures: malformed inputs, Unicode paths, spaces,
  multi-root workspaces, KiCad patch regressions, ERC/DRC failures and other named cases
  are evidence, not incidental sample files.
- Do not invent KiCad version support, CLI behavior or expected diagnostics merely to make
  a fixture match a desired outcome.

## Generated state

Do not hand-edit generated fixture files or golden outputs when they are owned by
`scripts/generate-kicad-fixture-corpus.mjs`.

The normal workflow is:

```text
corepack pnpm run fixtures:kicad:generate
corepack pnpm run test:fixtures
```

If a generator change intentionally updates expected output, review the semantic diff and
ensure the manifest/evidence still describes what the fixture proves.

## Dependency boundary

Production extension source must not import this package. The fixture package must not
import product internals from `apps/vscode-extension`. Preserve the root
`check:boundaries` contract rather than adding path-based exceptions.

## Validation

Run the package check plus the repository fixture/boundary gates for corpus changes.
