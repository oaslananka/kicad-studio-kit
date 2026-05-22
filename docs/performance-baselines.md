# Performance Baselines

OASLANA-124 defines one performance budget catalog for KiCad Studio Kit:
[`performance/baselines.json`](../performance/baselines.json). Benchmark
producers emit measurement JSON against that catalog, then
`scripts/check-performance-budgets.mjs` reports drift and rejects performance
regressions before they merge.

## Budget Policy

The catalog uses one tolerance policy for every metric:

| Measurement result          | Checker behavior                                      |
| --------------------------- | ----------------------------------------------------- |
| At or below 110% baseline   | Pass.                                                 |
| Above 110% baseline         | Report a drift warning in the budget result artifact. |
| Above 120% baseline         | Fail the budget check.                                |

Measured data must name a catalog metric, keep its unit, and carry a positive
value. CI-required metrics fail closed when a producer does not emit them.

## Reference Environment

PR enforcement uses the GitHub-hosted `ubuntu-24.04` x64 runner from
`.github/workflows/ci.yml` as the reference machine. That lane reads the
repository-pinned Node version from `.node-version` and the MCP Python toolchain
selection from `packages/mcp-server/uv.toml`.

The catalog still records platform-specific activation budgets for Windows and
macOS/Linux because those budgets are product requirements. Cross-platform
benchmark producers added by OASLANA-46 should capture their runner identity in
their artifacts before they set another metric to `ciRequired`.

The current catalog covers these surfaces:

| Surface        | Metrics                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| Activation     | Cold Windows, cold POSIX, and warm extension activation                                  |
| Project scan   | Single-project, medium workspace, and large workspace scan                               |
| Viewer         | Schematic first render, PCB first render, large PCB first render, and reload              |
| Validation     | Clean DRC, medium DRC, clean ERC, and cancellation response                              |
| MCP            | `tools/list`, medium-board `pcb_get_board_summary`, and session establishment            |
| Memory         | Idle extension memory and memory with a viewer open                                      |

`mcp.tools_list.response_ms` is the first CI-required producer. OASLANA-46 can
add extension host, viewer, validation, memory, and fixture-backed MCP
producers without changing the budget schema.

## Local Checks

Validate catalog shape and checker behavior with:

```bash
corepack pnpm run check:performance-budgets
```

Create the same MCP measurement emitted by CI and evaluate its budget with:

```bash
KICAD_PERFORMANCE_MEASUREMENTS_JSON=performance-results/mcp-tools-list.json \
  uv run --project packages/mcp-server --all-extras \
  pytest packages/mcp-server/tests/unit/test_benchmark_latency.py
node scripts/check-performance-budgets.mjs \
  --measurements performance-results/mcp-tools-list.json \
  --output performance-results/budget-report.json
```

The benchmark producer writes sample values so reviewers can distinguish one
outlier from a repeatable shift. The budget report stores the measured value,
baseline, statistic, warning limit, failure limit, and pass/warn/fail status for
each measured metric.

## CI Evidence

`.github/workflows/ci.yml` runs the `performance-budgets` job on every pull
request and on pushes to `main`. Its reference environment is the GitHub-hosted
`ubuntu-24.04` runner listed in the catalog.

The job uploads `performance-budget-artifacts` for 14 days:

| Artifact path                                 | Contents                                              |
| --------------------------------------------- | ----------------------------------------------------- |
| `performance-results/mcp-tools-list.json`     | Raw MCP samples and the p95 measurement.              |
| `performance-results/budget-report.json`      | Budget thresholds and checker result for each metric. |

Keep reports from the relevant PR when investigating drift. Trend dashboards
can consume the same JSON without coupling the producer to a hosted service.

## Baseline Changes

Update a baseline only with measurement evidence from the same surface and
state why the new budget is intentional in the PR. Prefer implementation fixes
when a code change crosses the 20 percent failure budget.

When a new producer becomes PR-required:

1. Add or update its metric in `performance/baselines.json`.
2. Emit the schema version, metric ID, unit, statistic, samples, and value from
   the producer.
3. Set `ciRequired` only after the PR workflow actually emits the measurement.
4. Keep the workflow artifact path stable so comparisons remain scriptable.
