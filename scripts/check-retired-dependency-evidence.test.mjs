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
  buildRepositoryGraphManifestsRequest,
  fetchGraphManifests,
  isDeletedGraphNodeError,
  parseRepositoryGraphManifestsPage,
  classifyGraphResponse,
  graphManifestFromPayload,
  normalizeOpenAlerts,
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

test("#526 open-alert pagination trusts each alert state over a stale query filter", () => {
  assert.deepEqual(
    normalizeOpenAlerts([
      {
        number: 76,
        state: "dismissed",
        dependency: { manifest_path: RETIRED_PATH },
      },
      {
        number: 77,
        state: "open",
        dependency: { manifest_path: RETIRED_PATH },
      },
    ]),
    [{ number: 77, manifestPath: RETIRED_PATH }],
  );
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

test("#526 missing historical graph-node IDs require a live repository listing", () => {
  const manifest = currentPolicy().manifests[0];
  assert.equal(
    isDeletedGraphNodeError(
      new Error(
        `dependency graph manifest: Could not resolve to a node with the global id of '${manifest.graphNodeId}'.`,
      ),
      manifest.graphNodeId,
    ),
    true,
  );
  assert.equal(
    isDeletedGraphNodeError(
      new Error("HTTP 403 Forbidden"),
      manifest.graphNodeId,
    ),
    false,
  );
  const request = buildRepositoryGraphManifestsRequest(
    currentPolicy().repository,
    "page-1",
  );
  assert.deepEqual(request.variables, {
    owner: "oaslananka",
    name: "kicad-studio-kit",
    after: "page-1",
  });
  assert.match(request.query, /dependencyGraphManifests/u);
});

test("#526 complete graph listing can prove the retired node is absent", () => {
  const manifest = currentPolicy().manifests[0];
  const parsed = parseRepositoryGraphManifestsPage(
    {
      data: {
        repository: {
          dependencyGraphManifests: {
            nodes: [
              {
                id: "DGM_other",
                filename: "pnpm-lock.yaml",
                dependenciesCount: 4,
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
    manifest,
  );
  assert.deepEqual(parsed, { manifests: [], nextCursor: null });
});

test("#526 incomplete graph listings fail closed", () => {
  const manifest = currentPolicy().manifests[0];
  const page = (nodes, pageInfo) => ({
    data: { repository: { dependencyGraphManifests: { nodes, pageInfo } } },
  });
  assert.throws(
    () =>
      parseRepositoryGraphManifestsPage(
        page([], { hasNextPage: true, endCursor: null }),
        manifest,
      ),
    /pagination cursor/u,
  );
  assert.throws(
    () => parseRepositoryGraphManifestsPage(page([], null), manifest),
    /missing or malformed/u,
  );
  assert.throws(
    () =>
      parseRepositoryGraphManifestsPage(
        { errors: [{ message: "Access denied" }] },
        manifest,
      ),
    /Access denied/u,
  );
});

test("#526 reappearing or malformed retired graph metadata fails closed", () => {
  const manifest = currentPolicy().manifests[0];
  const page = (id, count) => ({
    data: {
      repository: {
        dependencyGraphManifests: {
          nodes: [{ id, filename: manifest.path, dependenciesCount: count }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  });
  assert.throws(
    () =>
      parseRepositoryGraphManifestsPage(page("DGM_replaced", 183), manifest),
    /unexpected node identity/u,
  );
  assert.throws(
    () =>
      parseRepositoryGraphManifestsPage(
        page(manifest.graphNodeId, null),
        manifest,
      ),
    /invalid metadata/u,
  );
  assert.deepEqual(
    parseRepositoryGraphManifestsPage(page(manifest.graphNodeId, 183), manifest)
      .manifests,
    [{ filename: manifest.path, dependenciesCount: 183 }],
  );
});

test("#526 deleted node fallback checks all live manifests without suppressing API errors", async () => {
  const manifest = currentPolicy().manifests[0];
  const originalFetch = globalThis.fetch;
  const queries = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    queries.push(request.query);
    if (request.query.includes("node(id:")) {
      return new Response(
        JSON.stringify({
          errors: [
            {
              message: `Could not resolve to a node with the global id of '${manifest.graphNodeId}'.`,
            },
          ],
        }),
      );
    }
    return new Response(
      JSON.stringify({
        data: {
          repository: {
            dependencyGraphManifests: {
              nodes: [
                {
                  id: "DGM_other",
                  filename: "pnpm-lock.yaml",
                  dependenciesCount: 1,
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      }),
    );
  };
  try {
    assert.deepEqual(
      await fetchGraphManifests("test-token", currentPolicy()),
      [],
    );
    assert.equal(queries.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("#526 unrelated GitHub GraphQL errors do not trigger the deleted-node fallback", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ errors: [{ message: "Not authorized" }] }),
    );
  };
  try {
    await assert.rejects(
      fetchGraphManifests("test-token", currentPolicy()),
      /Not authorized/u,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
