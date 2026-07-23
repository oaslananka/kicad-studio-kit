import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildRetiredDependencyEvidenceReport,
  loadRetiredDependencyPolicy,
  validateRetiredDependencyPolicy,
} from "./lib/retired-dependency-evidence.mjs";

const RETIRED_PATH = "packages/mcp-server/uv.lock";

function currentPolicy() {
  return loadRetiredDependencyPolicy();
}

test("#526 current retired dependency policy is complete", () => {
  assert.deepEqual(validateRetiredDependencyPolicy(), []);
});

test("#526 a retired manifest cannot return to the repository tree", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "kicad-retired-manifest-"));
  try {
    mkdirSync(path.join(root, "packages/mcp-server"), { recursive: true });
    writeFileSync(path.join(root, RETIRED_PATH), "version = 1\n");
    const errors = validateRetiredDependencyPolicy(root, currentPolicy());
    assert.ok(errors.some((error) => error.includes(RETIRED_PATH)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#526 an empty native dependency-graph residue is explicitly reconciled", () => {
  const report = buildRetiredDependencyEvidenceReport({
    policy: currentPolicy(),
    presentPaths: [],
    graphManifests: [{ filename: RETIRED_PATH, dependenciesCount: 0 }],
    openAlerts: [],
    generatedAt: "2026-07-23T00:00:00.000Z",
  });
  assert.equal(report.status, "current");
  assert.equal(report.exitCode, 0);
  assert.equal(report.manifests[0].graphStatus, "empty-residue");
});

test("#526 the observed native Python graph residue is frozen", () => {
  const report = buildRetiredDependencyEvidenceReport({
    policy: currentPolicy(),
    presentPaths: [],
    graphManifests: [{ filename: RETIRED_PATH, dependenciesCount: 183 }],
    openAlerts: [],
  });
  assert.equal(report.status, "current");
  assert.equal(report.exitCode, 0);
  assert.equal(report.manifests[0].graphStatus, "frozen-residue");
});

test("#526 a retired graph manifest with dependencies fails closed", () => {
  const report = buildRetiredDependencyEvidenceReport({
    policy: currentPolicy(),
    presentPaths: [],
    graphManifests: [{ filename: RETIRED_PATH, dependenciesCount: 1 }],
    openAlerts: [],
  });
  assert.equal(report.status, "drift");
  assert.equal(report.exitCode, 1);
  assert.match(report.manifests[0].differences.join("\n"), /dependencies/u);
});

test("#526 an open alert for an absent retired manifest fails closed", () => {
  const report = buildRetiredDependencyEvidenceReport({
    policy: currentPolicy(),
    presentPaths: [],
    graphManifests: [{ filename: RETIRED_PATH, dependenciesCount: 0 }],
    openAlerts: [{ number: 61, manifestPath: RETIRED_PATH }],
  });
  assert.equal(report.status, "drift");
  assert.equal(report.exitCode, 1);
  assert.equal(report.manifests[0].openAlertCount, 1);
});

test("#526 no graph residue and no open alert is current", () => {
  const report = buildRetiredDependencyEvidenceReport({
    policy: currentPolicy(),
    presentPaths: [],
    graphManifests: [],
    openAlerts: [],
  });
  assert.equal(report.status, "current");
  assert.equal(report.manifests[0].graphStatus, "absent");
});
