import assert from "node:assert/strict";
import test from "node:test";

import {
  assertStablePackageVersion,
  buildMcp2026RcRequest,
  validateMcp2026RcDiscover,
  validateMcp2026RcToolsList,
} from "./lib/mcp-2026-rc-artifact-canary.mjs";

const CLIENT_INFO = {
  name: "kicad-studio-canary",
  version: "1.9.7",
};

function discoverResponse(version = "3.29.1") {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: {
      resultType: "complete",
      supportedVersions: ["2026-07-28"],
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
        extensions: {},
      },
      _meta: {
        "io.modelcontextprotocol/serverInfo": {
          name: "kicad-mcp-pro",
          version,
        },
      },
      instructions: "Published artifact canary fixture.",
      ttlMs: 3_600_000,
      cacheScope: "private",
    },
  };
}

function toolsListResponse(version = "3.29.1") {
  return {
    jsonrpc: "2.0",
    id: 2,
    result: {
      resultType: "complete",
      tools: [{ name: "export_gerber" }, { name: "run_drc" }],
      _meta: {
        "io.modelcontextprotocol/serverInfo": {
          name: "kicad-mcp-pro",
          version,
        },
      },
      ttlMs: 300_000,
      cacheScope: "private",
    },
  };
}

test("#492 builds the exact stateless discovery envelope", () => {
  const request = buildMcp2026RcRequest({
    id: 1,
    method: "server/discover",
    clientInfo: CLIENT_INFO,
  });

  assert.deepEqual(request, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "server/discover",
    },
    payload: {
      jsonrpc: "2.0",
      id: 1,
      method: "server/discover",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
        },
      },
    },
  });
  assert.equal("MCP-Session-Id" in request.headers, false);
});

test("#492 adds Mcp-Name for named requests without mutating caller params", () => {
  const params = { name: "run_drc", arguments: { severity: "error" } };
  const request = buildMcp2026RcRequest({
    id: 2,
    method: "tools/call",
    params,
    clientInfo: CLIENT_INFO,
  });

  assert.equal(request.headers["Mcp-Method"], "tools/call");
  assert.equal(request.headers["Mcp-Name"], "run_drc");
  assert.equal("MCP-Session-Id" in request.headers, false);
  assert.deepEqual(request.payload.params, {
    name: "run_drc",
    arguments: { severity: "error" },
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {},
      "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
    },
  });
  assert.deepEqual(params, {
    name: "run_drc",
    arguments: { severity: "error" },
  });
});

test("#492 Base64-encodes Unicode Mcp-Name header values", () => {
  const request = buildMcp2026RcRequest({
    id: 3,
    method: "resources/read",
    params: { uri: "kicad://proje/şema" },
    clientInfo: CLIENT_INFO,
  });

  assert.equal(
    request.headers["Mcp-Name"],
    `=?base64?${Buffer.from("kicad://proje/şema", "utf8").toString("base64")}?=`,
  );
  assert.equal(request.payload.params.uri, "kicad://proje/şema");
});

test("#492 accepts stable PyPI versions and rejects prereleases", () => {
  assert.equal(assertStablePackageVersion("3.29.1"), "3.29.1");
  assert.throws(
    () => assertStablePackageVersion("3.30.0rc1"),
    /stable major\.minor\.patch/,
  );
  assert.throws(
    () => assertStablePackageVersion("latest"),
    /stable major\.minor\.patch/,
  );
});

test("#492 validates published artifact discovery without protocol sessions", () => {
  const summary = validateMcp2026RcDiscover({
    json: discoverResponse(),
    headers: new Headers({ "Content-Type": "application/json" }),
    expectedServerVersion: "3.29.1",
  });

  assert.deepEqual(summary, {
    serverVersion: "3.29.1",
    protocolVersion: "2026-07-28",
    ttlMs: 3_600_000,
    cacheScope: "private",
  });
});

test("#492 rejects discovery protocol, identity, cache, and session drift", () => {
  const wrongProtocol = discoverResponse();
  wrongProtocol.result.supportedVersions = ["2025-11-25"];
  assert.throws(
    () =>
      validateMcp2026RcDiscover({
        json: wrongProtocol,
        headers: new Headers(),
        expectedServerVersion: "3.29.1",
      }),
    /supportedVersions must include 2026-07-28/,
  );

  const wrongServer = discoverResponse("3.29.0");
  assert.throws(
    () =>
      validateMcp2026RcDiscover({
        json: wrongServer,
        headers: new Headers(),
        expectedServerVersion: "3.29.1",
      }),
    /server version must be 3.29.1/,
  );

  const wrongCache = discoverResponse();
  wrongCache.result.cacheScope = "public";
  assert.throws(
    () =>
      validateMcp2026RcDiscover({
        json: wrongCache,
        headers: new Headers(),
        expectedServerVersion: "3.29.1",
      }),
    /cacheScope must be private/,
  );

  assert.throws(
    () =>
      validateMcp2026RcDiscover({
        json: discoverResponse(),
        headers: new Headers({ "MCP-Session-Id": "forbidden" }),
        expectedServerVersion: "3.29.1",
      }),
    /must not return MCP-Session-Id/,
  );
});

test("#492 validates deterministic tools-list metadata from the published artifact", () => {
  const summary = validateMcp2026RcToolsList({
    json: toolsListResponse(),
    headers: new Headers({ "Content-Type": "application/json" }),
    expectedServerVersion: "3.29.1",
  });

  assert.deepEqual(summary, {
    serverVersion: "3.29.1",
    toolCount: 2,
    ttlMs: 300_000,
    cacheScope: "private",
  });
});

test("#492 rejects empty, unordered, or session-bearing tools-list responses", () => {
  const empty = toolsListResponse();
  empty.result.tools = [];
  assert.throws(
    () =>
      validateMcp2026RcToolsList({
        json: empty,
        headers: new Headers(),
        expectedServerVersion: "3.29.1",
      }),
    /tools must be a non-empty array/,
  );

  const unordered = toolsListResponse();
  unordered.result.tools = [{ name: "run_drc" }, { name: "export_gerber" }];
  assert.throws(
    () =>
      validateMcp2026RcToolsList({
        json: unordered,
        headers: new Headers(),
        expectedServerVersion: "3.29.1",
      }),
    /tool names must be deterministic and sorted/,
  );

  assert.throws(
    () =>
      validateMcp2026RcToolsList({
        json: toolsListResponse(),
        headers: new Headers({ "MCP-Session-Id": "forbidden" }),
        expectedServerVersion: "3.29.1",
      }),
    /must not return MCP-Session-Id/,
  );
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

test("#492 root scripts expose the published RC artifact canary", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
  );
  const cliPath = resolve(
    REPO_ROOT,
    "scripts",
    "check-mcp-2026-rc-artifact.mjs",
  );

  assert.equal(existsSync(cliPath), true);
  assert.equal(
    packageJson.scripts["test:mcp-2026-rc-artifact"],
    "node --test scripts/mcp-2026-rc-artifact-canary.test.mjs",
  );
  assert.equal(
    packageJson.scripts["check:mcp-2026-rc-artifact"],
    "pnpm run test:mcp-2026-rc-artifact && node scripts/check-mcp-2026-rc-artifact.mjs",
  );
  assert.match(
    packageJson.scripts.check,
    /pnpm run test:mcp-2026-rc-artifact/u,
  );
});

test("#492 cross-repo workflow canaries the exact resolved PyPI artifact", () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, ".github/workflows/cross-repo-compatibility.yml"),
    "utf8",
  );

  assert.match(workflow, /name: Canary published MCP 2026 RC artifact/u);
  assert.match(
    workflow,
    /KICAD_MCP_PRO_VERSION: \$\{\{ steps\.pypi-check\.outputs\.pypi_version \}\}/u,
  );
  assert.match(
    workflow,
    /corepack pnpm run check:mcp-2026-rc-artifact -- --version "\$KICAD_MCP_PRO_VERSION"/u,
  );
});
