import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_PERFORMANCE_METRIC_IDS,
  evaluatePerformanceMeasurements,
  loadPerformanceMeasurements,
  loadRepositoryPerformanceCatalog,
  validatePerformanceCatalog,
} from "./check-performance-budgets.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const OASLANA_46_CI_REQUIRED_METRICS = [
  "extension.activation.cold.posix_ms",
  "extension.project_scan.single_ms",
  "extension.project_scan.medium_ms",
  "extension.project_scan.large_ms",
  "extension.viewer.schematic_first_render_ms",
  "extension.viewer.pcb_first_render_ms",
  "extension.viewer.large_pcb_first_render_ms",
  "extension.viewer.reload_ms",
  "extension.bom.large_parse_ms",
  "extension.netlist.large_parse_ms",
  "extension.validation.cancel_ms",
  "extension.export.command_cancel_ms",
];

const SAMPLE_CATALOG = {
  schemaVersion: 1,
  tolerance: {
    warningRatio: 1.1,
    failureRatio: 1.2,
  },
  metrics: Object.fromEntries(
    REQUIRED_PERFORMANCE_METRIC_IDS.map((metricId) => [
      metricId,
      {
        baseline: metricId.endsWith("_mb") ? 100 : 1000,
        unit: metricId.endsWith("_mb") ? "MB" : "ms",
        ciRequired: false,
        summary: `${metricId} fixture budget.`,
        source: "test fixture",
      },
    ]),
  ),
};

Object.assign(SAMPLE_CATALOG.metrics, {
  "mcp.tools_list.response_ms": {
    baseline: 100,
    unit: "ms",
    ciRequired: true,
    summary: "Streamable HTTP tools/list response.",
    source: "packages/mcp-server/tests/unit/test_benchmark_latency.py",
  },
  "extension.project_scan.single_ms": {
    baseline: 300,
    unit: "ms",
    ciRequired: false,
    summary: "Single project scan.",
    source: "OASLANA-46",
  },
});

test("repository performance catalog defines every OASLANA-124 metric", () => {
  const catalog = loadRepositoryPerformanceCatalog(REPO_ROOT);
  const errors = validatePerformanceCatalog(catalog);

  assert.deepEqual(errors, []);
  assert.deepEqual(
    Object.keys(catalog.metrics).sort(),
    [...REQUIRED_PERFORMANCE_METRIC_IDS].sort(),
  );
  assert.equal(catalog.metrics["mcp.tools_list.response_ms"].ciRequired, true);
  assert.equal(
    catalog.metrics["extension.viewer.large_pcb_first_render_ms"].unit,
    "ms",
  );
  assert.equal(catalog.metrics["extension.memory.viewer_open_mb"].unit, "MB");
});

test("repository performance catalog gates OASLANA-46 CI metrics", () => {
  const catalog = loadRepositoryPerformanceCatalog(REPO_ROOT);

  for (const metricId of OASLANA_46_CI_REQUIRED_METRICS) {
    assert.ok(
      REQUIRED_PERFORMANCE_METRIC_IDS.includes(metricId),
      `${metricId} must be part of the required performance catalog`,
    );
    assert.equal(
      catalog.metrics[metricId]?.ciRequired,
      true,
      `${metricId} must be required in CI performance measurements`,
    );
    assert.match(
      catalog.metrics[metricId]?.source ?? "",
      /OASLANA-46|extensionPerformance\.test\.ts/,
      `${metricId} must identify the OASLANA-46 harness source`,
    );
  }
});

test("root check includes performance budget catalog validation", () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts["test:perf"],
    "pnpm --filter kicadstudio run test:perf && uv run --project packages/mcp-server --all-extras pytest packages/mcp-server/tests/unit/test_benchmark_latency.py",
  );
  assert.equal(
    packageJson.scripts["check:performance-budgets"],
    "node scripts/check-performance-budgets.mjs && node --test scripts/check-performance-budgets.test.mjs",
  );
  assert.match(packageJson.scripts.check, /pnpm run check:performance-budgets/);
});

test("performance measurement loader merges extension and MCP artifacts", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "kicadstudio-perf-"));
  try {
    const extensionPath = path.join(tempDir, "extension.json");
    const mcpPath = path.join(tempDir, "mcp.json");
    writeFileSync(
      extensionPath,
      JSON.stringify({
        schemaVersion: 1,
        source: "apps/vscode-extension/test/performance/extensionPerformance.test.ts",
        measurements: [
          {
            metric: "extension.project_scan.single_ms",
            value: 42,
            unit: "ms",
            statistic: "p95",
            samples: 5,
          },
        ],
      }),
    );
    writeFileSync(
      mcpPath,
      JSON.stringify({
        schemaVersion: 1,
        source: "packages/mcp-server/tests/unit/test_benchmark_latency.py",
        measurements: [
          {
            metric: "mcp.tools_list.response_ms",
            value: 12,
            unit: "ms",
            statistic: "p95",
            samples: 5,
          },
        ],
      }),
    );

    const merged = loadPerformanceMeasurements([extensionPath, mcpPath]);

    assert.equal(merged.schemaVersion, 1);
    assert.deepEqual(merged.sources, [
      "apps/vscode-extension/test/performance/extensionPerformance.test.ts",
      "packages/mcp-server/tests/unit/test_benchmark_latency.py",
    ]);
    assert.deepEqual(
      merged.measurements.map((measurement) => measurement.metric),
      ["extension.project_scan.single_ms", "mcp.tools_list.response_ms"],
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CI and nightly workflows persist OASLANA-46 performance artifacts", () => {
  const ci = readFileSync(
    path.join(REPO_ROOT, ".github", "workflows", "ci.yml"),
    "utf8",
  );
  const nightly = readFileSync(
    path.join(
      REPO_ROOT,
      ".github",
      "workflows",
      "nightly-quality-gates.yml",
    ),
    "utf8",
  );

  assert.match(ci, /Measure extension performance budgets/);
  assert.match(
    ci,
    /KICAD_EXTENSION_PERFORMANCE_MEASUREMENTS_JSON:\s+performance-results\/extension-performance\.json/,
  );
  assert.match(ci, /--measurements performance-results\/extension-performance\.json/);
  assert.match(ci, /--measurements performance-results\/mcp-tools-list\.json/);
  assert.match(ci, /performance-results\/budget-report\.json/);
  assert.match(nightly, /corepack pnpm run test:perf/);
});

test("budget evaluation warns at 10 percent drift and fails above 20 percent", () => {
  const result = evaluatePerformanceMeasurements(SAMPLE_CATALOG, {
    schemaVersion: 1,
    measurements: [
      {
        metric: "mcp.tools_list.response_ms",
        value: 111,
        unit: "ms",
        statistic: "p95",
        samples: 5,
      },
    ],
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.warn, 1);
  assert.equal(result.summary.fail, 0);
  assert.equal(result.metrics[0].status, "warn");
  assert.equal(result.metrics[0].warningLimit, 110);
  assert.equal(result.metrics[0].failureLimit, 120);

  const failure = evaluatePerformanceMeasurements(SAMPLE_CATALOG, {
    schemaVersion: 1,
    measurements: [
      {
        metric: "mcp.tools_list.response_ms",
        value: 121,
        unit: "ms",
        statistic: "p95",
        samples: 5,
      },
    ],
  });

  assert.equal(failure.summary.fail, 1);
  assert.match(failure.errors.join("\n"), /mcp\.tools_list\.response_ms/);
  assert.match(failure.errors.join("\n"), /121\.00 ms > 120\.00 ms/);
});

test("budget evaluation requires CI measurements and rejects unit drift", () => {
  const missing = evaluatePerformanceMeasurements(SAMPLE_CATALOG, {
    schemaVersion: 1,
    measurements: [],
  });

  assert.match(
    missing.errors.join("\n"),
    /Missing CI-required performance measurement: mcp\.tools_list\.response_ms/,
  );

  const mismatched = evaluatePerformanceMeasurements(SAMPLE_CATALOG, {
    schemaVersion: 1,
    measurements: [
      {
        metric: "mcp.tools_list.response_ms",
        value: 50,
        unit: "MB",
        statistic: "p95",
        samples: 5,
      },
    ],
  });

  assert.match(
    mismatched.errors.join("\n"),
    /mcp\.tools_list\.response_ms must use ms, received MB/,
  );
});
