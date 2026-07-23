import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildRetiredDependencyEvidenceReport,
  buildUnavailableRetiredDependencyEvidenceReport,
  loadRetiredDependencyPolicy,
  validateRetiredDependencyPolicy,
} from "./lib/retired-dependency-evidence.mjs";

import {
  buildGraphNodeRequest,
  classifyGraphResponse,
  graphManifestFromPayload,
  parseNextLinkHeader,
} from "./check-retired-dependency-evidence.mjs";

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

test("#526 GraphQL retry classification distinguishes transient and terminal responses", () => {
  assert.deepEqual(
    classifyGraphResponse(
      { ok: false, status: 502, statusText: "Bad Gateway" },
      "upstream unavailable",
    ),
    { payload: null, failure: "HTTP 502 Bad Gateway", retryable: true },
  );
  const timedOut = classifyGraphResponse(
    { ok: true, status: 200, statusText: "OK" },
    JSON.stringify({ errors: [{ message: "Query timedout" }] }),
  );
  assert.equal(timedOut.payload, null);
  assert.equal(timedOut.retryable, true);
  assert.match(timedOut.failure, /timedout/u);
  const terminalPayload = { errors: [{ message: "Field denied" }] };
  const terminal = classifyGraphResponse(
    { ok: true, status: 200, statusText: "OK" },
    JSON.stringify(terminalPayload),
  );
  assert.deepEqual(terminal.payload, terminalPayload);
  assert.equal(terminal.retryable, false);
});

test("#526 Link pagination parser avoids ambiguous regular-expression matching", () => {
  const header =
    '<https://api.github.com/example?page=2>; rel="next", <https://api.github.com/example?page=4>; rel="last"';
  assert.equal(
    parseNextLinkHeader(header),
    "https://api.github.com/example?page=2",
  );
  assert.equal(parseNextLinkHeader("<unterminated; rel=next"), null);
  assert.equal(parseNextLinkHeader("x".repeat(10000)), null);
});

test("#526 exact graph-node request avoids the unstable manifest connection", () => {
  const manifest = currentPolicy().manifests[0];
  const request = buildGraphNodeRequest(manifest.graphNodeId);
  assert.deepEqual(request.variables, { id: manifest.graphNodeId });
  assert.match(request.query, /node\(id: \$id\)/u);
  assert.doesNotMatch(request.query, /dependencyGraphManifests/u);
});

test("#526 exact graph-node payload must retain the expected manifest path", () => {
  const manifest = currentPolicy().manifests[0];
  assert.deepEqual(
    graphManifestFromPayload(
      {
        data: {
          node: {
            id: manifest.graphNodeId,
            filename: RETIRED_PATH,
            dependenciesCount: 183,
          },
        },
      },
      manifest,
    ),
    { filename: RETIRED_PATH, dependenciesCount: 183 },
  );
  assert.equal(
    graphManifestFromPayload({ data: { node: null } }, manifest),
    null,
  );
  assert.throws(
    () =>
      graphManifestFromPayload(
        {
          data: {
            node: {
              id: manifest.graphNodeId,
              filename: "unexpected/uv.lock",
              dependenciesCount: 183,
            },
          },
        },
        manifest,
      ),
    /path mismatch/u,
  );
});

test("#526 unavailable API evidence fails closed and remains artifact-safe", () => {
  const report = buildUnavailableRetiredDependencyEvidenceReport({
    policy: currentPolicy(),
    presentPaths: [],
    reason: "dependency graph manifests: HTTP 502 Bad Gateway",
    generatedAt: "2026-07-23T00:00:00.000Z",
  });
  assert.equal(report.status, "unavailable");
  assert.equal(report.exitCode, 1);
  assert.equal(report.manifests[0].graphStatus, "unavailable");
  assert.equal(report.manifests[0].graphDependencyCount, null);
  assert.equal(report.manifests[0].openAlertCount, null);
  assert.match(report.manifests[0].differences.join("\n"), /HTTP 502/u);
});
