#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = dirname(SCRIPT_ROOT);
const DEFAULT_CATALOG_PATH = resolve(
  DEFAULT_REPO_ROOT,
  "performance",
  "baselines.json",
);

export const REQUIRED_PERFORMANCE_METRIC_IDS = Object.freeze([
  "extension.activation.cold.windows_ms",
  "extension.activation.cold.posix_ms",
  "extension.activation.warm_ms",
  "extension.project_scan.single_ms",
  "extension.project_scan.medium_ms",
  "extension.project_scan.large_ms",
  "extension.viewer.schematic_first_render_ms",
  "extension.viewer.pcb_first_render_ms",
  "extension.viewer.large_pcb_first_render_ms",
  "extension.viewer.reload_ms",
  "extension.validation.drc.clean_ms",
  "extension.validation.drc.medium_ms",
  "extension.validation.erc.clean_ms",
  "extension.validation.cancel_ms",
  "extension.bom.large_parse_ms",
  "extension.netlist.large_parse_ms",
  "extension.export.command_cancel_ms",

  "extension.memory.idle_mb",
  "extension.memory.viewer_open_mb",
]);

const SUPPORTED_UNITS = new Set(["ms", "MB"]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function formatMeasurement(value, unit) {
  return `${value.toFixed(2)} ${unit}`;
}

function multiplyThreshold(baseline, ratio) {
  return Number((baseline * ratio).toFixed(6));
}

export function loadRepositoryPerformanceCatalog(repoRoot = DEFAULT_REPO_ROOT) {
  return readJson(resolve(repoRoot, "performance", "baselines.json"));
}

export function loadPerformanceMeasurements(measurementPaths) {
  const paths = Array.isArray(measurementPaths)
    ? measurementPaths
    : [measurementPaths];
  if (paths.length === 0) {
    throw new Error("At least one performance measurement file is required.");
  }

  const merged = {
    schemaVersion: 1,
    sources: [],
    measurements: [],
  };

  for (const measurementPath of paths) {
    const measurements = readJson(measurementPath);
    if (!isRecord(measurements)) {
      throw new Error(
        `Performance measurements must be a JSON object: ${measurementPath}`,
      );
    }
    if (measurements.schemaVersion !== 1) {
      throw new Error(
        `Performance measurements schemaVersion must be 1: ${measurementPath}`,
      );
    }
    if (!Array.isArray(measurements.measurements)) {
      throw new Error(
        `Performance measurements must include a measurements array: ${measurementPath}`,
      );
    }

    merged.sources.push(
      typeof measurements.source === "string" && measurements.source.trim()
        ? measurements.source
        : measurementPath,
    );
    merged.measurements.push(...measurements.measurements);
  }

  return merged;
}

export function validatePerformanceCatalog(catalog) {
  const errors = [];

  if (!isRecord(catalog)) {
    return ["Performance catalog must be a JSON object."];
  }
  if (catalog.schemaVersion !== 1) {
    errors.push("Performance catalog schemaVersion must be 1.");
  }
  if (!isRecord(catalog.tolerance)) {
    errors.push("Performance catalog tolerance must be an object.");
  } else {
    if (!isPositiveNumber(catalog.tolerance.warningRatio)) {
      errors.push(
        "Performance catalog warningRatio must be a positive number.",
      );
    }
    if (!isPositiveNumber(catalog.tolerance.failureRatio)) {
      errors.push(
        "Performance catalog failureRatio must be a positive number.",
      );
    }
    if (
      isPositiveNumber(catalog.tolerance.warningRatio) &&
      isPositiveNumber(catalog.tolerance.failureRatio) &&
      catalog.tolerance.warningRatio >= catalog.tolerance.failureRatio
    ) {
      errors.push(
        "Performance catalog warningRatio must be lower than failureRatio.",
      );
    }
  }
  if (!isRecord(catalog.metrics)) {
    errors.push("Performance catalog metrics must be an object.");
    return errors;
  }

  for (const metricId of REQUIRED_PERFORMANCE_METRIC_IDS) {
    if (!isRecord(catalog.metrics[metricId])) {
      errors.push(`Performance catalog is missing metric ${metricId}.`);
    }
  }

  for (const [metricId, metric] of Object.entries(catalog.metrics)) {
    if (!isRecord(metric)) {
      errors.push(`Performance metric ${metricId} must be an object.`);
      continue;
    }
    if (!REQUIRED_PERFORMANCE_METRIC_IDS.includes(metricId)) {
      errors.push(`Performance catalog has unknown metric ${metricId}.`);
    }
    if (!isPositiveNumber(metric.baseline)) {
      errors.push(
        `Performance metric ${metricId} baseline must be a positive number.`,
      );
    }
    if (!SUPPORTED_UNITS.has(metric.unit)) {
      errors.push(`Performance metric ${metricId} unit must be ms or MB.`);
    }
    if (typeof metric.ciRequired !== "boolean") {
      errors.push(`Performance metric ${metricId} ciRequired must be boolean.`);
    }
    if (typeof metric.summary !== "string" || metric.summary.trim() === "") {
      errors.push(`Performance metric ${metricId} summary must be non-empty.`);
    }
    if (typeof metric.source !== "string" || metric.source.trim() === "") {
      errors.push(`Performance metric ${metricId} source must be non-empty.`);
    }
  }

  return errors;
}

export function evaluatePerformanceMeasurements(catalog, measurements) {
  const errors = validatePerformanceCatalog(catalog);
  const metrics = [];
  const summary = {
    pass: 0,
    warn: 0,
    fail: 0,
  };

  if (!isRecord(measurements)) {
    return {
      errors: [...errors, "Performance measurements must be a JSON object."],
      metrics,
      summary,
    };
  }
  if (measurements.schemaVersion !== 1) {
    errors.push("Performance measurements schemaVersion must be 1.");
  }
  if (!Array.isArray(measurements.measurements)) {
    errors.push("Performance measurements must include a measurements array.");
    return { errors, metrics, summary };
  }

  const measurementsByMetric = new Map();
  for (const measurement of measurements.measurements) {
    if (!isRecord(measurement) || typeof measurement.metric !== "string") {
      errors.push("Every performance measurement must name a metric.");
      continue;
    }
    if (measurementsByMetric.has(measurement.metric)) {
      errors.push(`Duplicate performance measurement: ${measurement.metric}.`);
      continue;
    }
    measurementsByMetric.set(measurement.metric, measurement);
  }

  for (const [metricId, measurement] of measurementsByMetric) {
    const metric = catalog.metrics?.[metricId];
    if (!isRecord(metric)) {
      errors.push(`Unknown performance measurement metric: ${metricId}.`);
      continue;
    }
    if (measurement.unit !== metric.unit) {
      errors.push(
        `${metricId} must use ${metric.unit}, received ${measurement.unit}.`,
      );
      continue;
    }
    if (!isPositiveNumber(measurement.value)) {
      errors.push(`${metricId} must report a positive numeric value.`);
      continue;
    }

    const warningLimit = multiplyThreshold(
      metric.baseline,
      catalog.tolerance.warningRatio,
    );
    const failureLimit = multiplyThreshold(
      metric.baseline,
      catalog.tolerance.failureRatio,
    );
    let status = "pass";
    if (measurement.value > failureLimit) {
      status = "fail";
      errors.push(
        `${metricId} exceeded performance budget: ${formatMeasurement(
          measurement.value,
          metric.unit,
        )} > ${formatMeasurement(failureLimit, metric.unit)}.`,
      );
    } else if (measurement.value > warningLimit) {
      status = "warn";
    }
    summary[status] += 1;
    metrics.push({
      metric: metricId,
      status,
      value: measurement.value,
      baseline: metric.baseline,
      unit: metric.unit,
      statistic: measurement.statistic,
      samples: measurement.samples,
      warningLimit,
      failureLimit,
    });
  }

  for (const [metricId, metric] of Object.entries(catalog.metrics ?? {})) {
    if (metric.ciRequired && !measurementsByMetric.has(metricId)) {
      errors.push(`Missing CI-required performance measurement: ${metricId}.`);
    }
  }

  return { errors, metrics, summary };
}

function parseArgs(argv) {
  const options = {
    catalog: DEFAULT_CATALOG_PATH,
    measurements: [],
    output: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--catalog" && value) {
      options.catalog = resolve(value);
      index += 1;
    } else if (arg === "--measurements" && value) {
      options.measurements.push(resolve(value));
      index += 1;
    } else if (arg === "--output" && value) {
      options.output = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return options;
}

function writeReport(outputPath, report) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = readJson(options.catalog);
  if (options.measurements.length === 0) {
    const errors = validatePerformanceCatalog(catalog);
    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
    console.log(`Performance catalog is valid: ${options.catalog}`);
    return;
  }

  const report = evaluatePerformanceMeasurements(
    catalog,
    loadPerformanceMeasurements(options.measurements),
  );
  if (options.output) {
    writeReport(options.output, report);
  }
  console.log(
    `Performance budget results: ${report.summary.pass} pass, ${report.summary.warn} warning, ${report.summary.fail} failure.`,
  );
  if (report.errors.length > 0) {
    throw new Error(report.errors.join("\n"));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
