# KiCad Fixture Corpus

OASLANA-53 / GitHub issue #54 defines the canonical deterministic KiCad
fixture package for parser, diagnostics, project tree, BOM, netlist, board
state, MCP, and visual regression tests.

The corpus lives under:

```text
packages/kicad-fixtures/
  manifest.json
  fixtures/
  expected/
```

Fixtures are addressed by semantic ID through `manifest.json`; tests should not
hard-code generated file lists. Each fixture contains a `.kicad_pro` file and
the relevant schematic, PCB, or DRU files for the scenario. Each fixture also
has a matching `expected/<fixture-id>/` directory with these golden outputs:

```text
project-tree.snapshot.json
diagnostics.snapshot.json
status.snapshot.json
erc-report.json
drc-report.json
bom.csv
netlist.net
board-stats.txt
```

## Regeneration

Regenerate the corpus explicitly:

```bash
corepack pnpm run fixtures:kicad:generate
```

The generator is deterministic and is the only supported way to update fixture
files. It rewrites `packages/kicad-fixtures/fixtures/`,
`packages/kicad-fixtures/expected/`, and
`packages/kicad-fixtures/manifest.json` from the fixture definitions in
`scripts/generate-kicad-fixture-corpus.mjs`.

## Validation

Validate that all generated files are current:

```bash
corepack pnpm run test:fixtures
```

The root repository check also runs this gate:

```bash
corepack pnpm run check
```

Real KiCad CLI contract lanes consume the same corpus and write their runtime
artifacts outside the package:

```bash
corepack pnpm run test:kicad-cli-contract
```

The contract command requires a real `kicad-cli` on `PATH` or one of
`KICAD_CANARY_KICAD_CLI`, `KICAD_MCP_KICAD_CLI`, or `KICAD_CLI_PATH`. When the
CLI is missing, the harness writes `summary.json` and `failing-fixtures.txt`
with a structured environment failure instead of crashing before artifacts are
created.

## Fixture Coverage

The corpus includes these required semantic fixtures:

- `clean-led-kicad10`
- `stale-diagnostics-kicad10`
- `erc-power-pin-error`
- `drc-courtyard-error`
- `unconnected-pcb`
- `missing-netlist`
- `empty-board`
- `no-dru-file`
- `multi-sheet-schematic`
- `large-board`
- `malformed-sch`
- `malformed-pcb`
- `paths-with-spaces`
- `unicode-path-çöğü`

`paths-with-spaces` uses file names containing spaces. `unicode-path-çöğü`
uses a non-ASCII directory and file name so Windows path handling and URI
conversion tests can cover both edge cases.

## Source Verification

No new external dependency, GitHub Action, runtime, or package manager is
introduced by this package. The generator uses the repository's existing Node.js
24 runtime and stable built-in `node:fs` / `node:path` APIs. Fixture file shape
is based on existing repository KiCad test fixtures and is intentionally small
so it stays reviewable and stable in git.
