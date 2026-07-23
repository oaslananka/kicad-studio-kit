# Issue #531 Bundle Chunk Optimization Design

## Status

Approved for implementation on 2026-07-23. This design is intentionally limited
to measured optional bundle weight and documentation search indexing. It does not
include command-surface or source-boundary refactors tracked by #497 and #498.

## Goals

- Reduce spreadsheet-export code shipped in the lazy ExcelJS chunk without
  changing XLSX output behavior.
- Keep spreadsheet code out of the activation chunk.
- Remove the unexplained VitePress oversized-chunk warning while preserving
  useful local documentation search.
- Add fail-closed checks for the selected extension and documentation bundle
  boundaries.
- Preserve deterministic VSIX packaging, Codecov Bundle Analysis, and all
  existing performance budgets.

## Measured baseline

Measurements were collected from the pinned validation host at main commit
`4f56104a6e1a37ab08ba2ad4a9beedbabeb5cb2b`.

| Surface                      |       Raw |      Gzip |    Brotli | Notes                    |
| ---------------------------- | --------: | --------: | --------: | ------------------------ |
| `dist/extension.js`          | 742,876 B | 203,688 B | 164,362 B | Initial activation chunk |
| `dist/exceljs.js`            | 825,685 B | 221,095 B | 185,948 B | Lazy spreadsheet chunk   |
| `media/kicanvas/kicanvas.js` | 471,937 B | 111,397 B |  92,468 B | Existing viewer asset    |
| VitePress local-search index | 833,243 B | 186,660 B | 142,746 B | Lazy search-only chunk   |
| VitePress framework chunk    | 110,329 B |  43,633 B |  39,265 B | Initial shared framework |

The production Webpack build completed in 74.24 seconds. The VitePress build
completed in 55.49 seconds and emitted one warning for the 833,243-byte local
search index. The extension performance suite passed 5/5 tests in 20.10 seconds;
the activation-manifest measurement completed in 37 ms.

Webpack module evidence showed that the root `exceljs` entry also included
streaming workbook readers/writers, `ModelContainer`, enums, and their dependency
chains even though KiCad Studio only constructs an in-memory `Workbook` and
writes XLSX files.

## Options considered

### 1. Retain the current bundles and only raise warning limits

This has the lowest implementation cost but does not remove unused ExcelJS code
or reduce documentation search payload. Rejected because it does not meet the
measured optimization goal.

### 2. Externalize ExcelJS and replace VitePress local search

Externalizing ExcelJS would complicate VSIX packaging and runtime dependency
resolution. Replacing local search with a new service or plugin would add a new
operational or dependency surface. Rejected as disproportionate for a P2 bundle
optimization.

### 3. Narrow the existing lazy boundaries and enforce measured limits

Use ExcelJS's Node-only `lib/doc/workbook.js` entry behind the existing dynamic
import. Keep VitePress local search, but exclude repository-internal Superpowers
plans/specifications and code blocks from its index. Give the remaining lazy
search chunk a measured 625 kB limit while keeping the normal 500 kB limit for
all other documentation JavaScript chunks. Selected because it provides the
largest measured reduction with minimal runtime change.

## Extension architecture

`BomExporter.exportXlsx()` remains the only consumer of spreadsheet code. Its
memoized loader dynamically imports `exceljs/lib/doc/workbook.js` with the
existing `exceljs` chunk name. An ambient declaration exposes only the
`Workbook` constructor type from ExcelJS's public declaration file.

A production experiment produced these results:

| Surface                 |  Baseline | Narrow entry |                Change |
| ----------------------- | --------: | -----------: | --------------------: |
| Lazy ExcelJS chunk      | 825,685 B |    461,338 B |                -44.1% |
| Initial extension chunk | 742,876 B |    742,067 B | effectively unchanged |

The XLSX behavior contract is validated by creating a workbook through
`BomExporter`, reopening it with the public ExcelJS API, and checking headers and
row values. A source-policy test prevents the broad root import from returning.

## Documentation search architecture

VitePress 1.6.4's local search index is already dynamically imported when search
is opened, so it must remain a lazy chunk. A small repository helper renders
search content with these rules:

1. Honor existing `search: false` frontmatter.
2. Exclude `docs/superpowers/**` because these implementation plans and specs are
   not linked from the public navigation and should not dominate user search.
3. Remove rendered `<pre>...</pre>` code blocks from the search text while
   preserving headings and explanatory prose.

The measured result is approximately 601,126 B raw, 135,232 B gzip, and 106,229 B
Brotli. It reduces the raw index by 27.5% and gzip payload by 27.2%. The chunk is
still larger than Vite's generic 500 kB warning because it contains the complete
searchable product, architecture, release, and compatibility documentation.

The Vite warning threshold is therefore set to 625 kB and backed by a dedicated
checker:

- local-search index: maximum 625,000 bytes;
- every other documentation JavaScript chunk: maximum 500,000 bytes;
- a missing local-search chunk is a failure;
- failures list the asset and measured size.

This converts the generic warning into a repository-owned, measured policy rather
than hiding it.

## Error handling and compatibility

- The dynamic ExcelJS import remains memoized and propagates load or write errors
  to the existing command error handling.
- The search renderer returns the original remaining HTML when it encounters a
  malformed or unterminated `<pre>` block, avoiding accidental content loss.
- No new runtime dependency is introduced.
- The extension remains a CommonJS2 Node target and VS Code Web remains disabled.
- All chunk names and package contents remain deterministic.

## Validation

Implementation is complete only when all of the following pass:

- focused ExcelJS export behavior and import-policy tests;
- documentation search-renderer and bundle-policy tests;
- production extension build and bundle-size check;
- VitePress build with no oversized-chunk warning;
- extension performance suite without regression;
- repeatable VSIX check and package validation;
- full pinned validation-host repository gate;
- final PR bot, agent, scanner, review, inline-comment, and review-thread triage.

## Final implementation evidence

The selected design produced the following final artifacts on the pinned
validation host:

- `dist/extension.js`: 742,064 bytes raw, 203,353 bytes gzip;
- `dist/exceljs.js`: 461,338 bytes raw, 117,896 bytes gzip;
- `kicadstudiokit-1.9.5.vsix`: 1,724,081 bytes, reported by `vsce` as 1.64 MB;
- VitePress local-search index: 603,787 bytes raw, 135,850 bytes gzip;
- VitePress framework chunk: 110,329 bytes raw.

The production extension build completed in approximately 55 seconds, compared
with the 74-second measurement baseline. The documentation bundle completed in
45.13 seconds without the former oversized-chunk warning. The repository-owned
documentation checker validated 295 JavaScript assets.

## Rollback

Revert the implementation commit. Do not externalize ExcelJS, disable local
search, or widen generic limits as a rollback shortcut. If the deep ExcelJS entry
changes upstream, restore the public root entry temporarily and open a focused
follow-up with a new measured baseline.

The final repeatability check produced 101 normalized VSIX entries with SHA-256
`6819dc6368f438d5f0fefadae0de372f699a8c3b4d677a4321983cae925aab72`.
