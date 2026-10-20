#!/usr/bin/env node

// Published PyPI real-pair proof using the actual staged Studio protocol and transport.
// Source-only; never selects the 2026 production adapter or publishes an extension.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertStablePackageVersion } from "./lib/mcp-2026-rc-artifact-canary.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const execFileAsync = promisify(execFile);
const modernProtocol = "2026-07-28";
const logger = { debug() {}, warn() {} };

function requestedVersion(version) {
  if (typeof version !== "string" || !version) {
    throw new Error(
      "Set KICAD_MCP_PRO_VERSION to an exact stable PyPI version.",
    );
  }
  return assertStablePackageVersion(version);
}

async function compileStudioProtocol(outDir) {
  const compiler = require.resolve("typescript/bin/tsc");
  const files = [
    "mcp/protocol/mcp2025ProtocolAdapter.ts",
    "mcp/protocol/mcp2026ProtocolAdapter.ts",
    "mcp/protocol/protocolAdapterRegistry.ts",
    "mcp/protocol/protocolLifecycle.ts",
    "mcp/transport/httpJsonRpcTransport.ts",
  ].map((name) => "apps/vscode-extension/src/" + name);
  await execFileAsync(
    process.execPath,
    [
      compiler,
      "--target",
      "ES2022",
      "--module",
      "CommonJS",
      "--moduleResolution",
      "Node10",
      "--ignoreDeprecations",
      "6.0",
      "--outDir",
      outDir,
      "--rootDir",
      "apps/vscode-extension/src",
      "--typeRoots",
      "apps/vscode-extension/node_modules/@types",
      "--types",
      "node",
      "--lib",
      "es2022,dom",
      "--skipLibCheck",
      "--esModuleInterop",
      "--strict",
      "--noEmitOnError",
      "true",
      ...files,
    ],
    { cwd: root, timeout: 60_000, maxBuffer: 128 * 1024 },
  );
}

async function freeLoopbackPort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    once(child, "exit").then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

function probeLoopbackListener(port) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(750);
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", reject);
    socket.once("timeout", () =>
      socket.destroy(new Error("loopback startup timeout")),
    );
  });
}

async function awaitServerReady(port, child, remaining = 160) {
  if (remaining === 0) {
    throw new Error("Published server did not become ready on loopback");
  }
  if (
    child.exitCode !== null ||
    child.signalCode !== null ||
    child.pid === undefined
  ) {
    throw new Error("Published server failed startup");
  }
  try {
    await probeLoopbackListener(port);
  } catch {
    await delay(500);
    return awaitServerReady(port, child, remaining - 1);
  }
}

async function runPair({ version, modern, modules, strictRc = false }) {
  const port = await freeLoopbackPort();
  const endpoint = "http://127.0.0.1:" + port;
  const child = spawn(
    process.env.UV || "uv",
    [
      "run",
      "--quiet",
      "--with",
      "kicad-mcp-pro==" + version,
      "--no-project",
      "kicad-mcp-pro",
    ],
    {
      env: {
        ...process.env,
        KICAD_MCP_OPERATING_MODE: "readonly",
        // SDK v2 advertises final 2026 even on the public default lane.
        // Separately retain the stricter legacy RC-selector regression case.
        KICAD_MCP_PROTOCOL_LANE: strictRc ? "2026-07-28-rc" : "stable",
        KICAD_MCP_TRANSPORT: "streamable-http",
        KICAD_MCP_STATEFUL_HTTP: modern ? "0" : "1",
        KICAD_MCP_LEGACY_SSE: "0",
        KICAD_MCP_HOST: "127.0.0.1",
        KICAD_MCP_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.on("error", () => {}); // Readiness loop reports a failed spawn.
  for (const stream of [child.stdout, child.stderr]) stream.resume();

  try {
    await awaitServerReady(port, child);

    const adapter = modern
      ? new modules.Mcp2026ProtocolAdapter()
      : modules.resolveMcpProtocolAdapter("2025-11-25");
    const savedSessions = [];
    const outgoing = [];
    let discovered;
    const lifecycle = new modules.McpProtocolLifecycle({
      adapter,
      clientInfo: { name: "kicad-studio", version: "1.16.0" },
      sessionStore: {
        read: () => (modern ? "forged-legacy-session" : undefined),
        write: async (sessionId) => {
          savedSessions.push(sessionId);
        },
      },
      transport: new modules.HttpJsonRpcTransport({
        logger,
        maxRetries: 1,
        trafficLogger: {
          recordRequest: (_method, _payload, headers) => {
            outgoing.push(new Headers(headers));
          },
          recordResponse() {},
          recordError() {},
        },
      }),
    });
    const runtime = {
      baseEndpoint: endpoint,
      allowLegacySse: false,
      timeoutMs: 20_000,
      hasDiscoveryState: false,
    };
    await lifecycle.ensureReady(runtime, {
      onDiscovery: (result) => {
        discovered = result;
      },
    });
    const list = await lifecycle.execute("tools/list", {}, runtime);
    assert.equal(list.json.error, undefined, "tools/list RPC must succeed");
    assert.ok(Array.isArray(list.json.result?.tools));
    assert.ok(list.json.result.tools.length > 0);
    assert.ok(
      list.json.result.tools.some((tool) => tool.name === "kicad_get_version"),
      "read-only kicad_get_version tool must be available",
    );
    const call = await lifecycle.execute(
      "tools/call",
      { name: "kicad_get_version", arguments: {} },
      runtime,
    );
    assert.equal(
      call.json.error,
      undefined,
      "read-only tools/call RPC must succeed",
    );
    assert.notEqual(call.json.result?.isError, true, "read-only tool failed");

    // A real published peer must reject an unknown tool instead of reporting
    // success. This complements synthetic malformed-response adapter tests.
    const unknownTool = "kicad_studio_nonexistent_tool_acceptance";
    const unavailable = await lifecycle.execute(
      "tools/call",
      { name: unknownTool, arguments: {} },
      runtime,
    );
    assert.ok(
      unavailable.json.error !== undefined ||
        unavailable.json.result?.isError === true,
      "published server must not report success for an unknown tool",
    );

    if (modern) {
      assert.equal(
        outgoing.at(-1)?.get("Mcp-Name"),
        unknownTool,
        "2026 routing header must name the rejected tool",
      );
    }

    if (modern) {
      // Exercise the published peer over the wire, not just Studio's header
      // builder: inconsistent or missing routing metadata must fail closed.
      const params = adapter.prepareRequestParams(
        { name: unknownTool, arguments: {} },
        { name: "kicad-studio", version: "1.16.0" },
      );
      const requestBody = JSON.stringify({
        jsonrpc: "2.0",
        id: "studio-wire-header-negative",
        method: "tools/call",
        params,
      });
      for (const { label, mutate } of [
        {
          label: "inconsistent Mcp-Name",
          mutate: (headers) => {
            headers["Mcp-Name"] = "kicad_get_version";
          },
        },
        {
          label: "missing Mcp-Name",
          mutate: (headers) => {
            delete headers["Mcp-Name"];
          },
        },
      ]) {
        const headers = adapter.createRequestHeaders({
          method: "tools/call",
          params,
        });
        mutate(headers);
        const response = await fetch(endpoint + "/mcp", {
          method: "POST",
          headers,
          body: requestBody,
          signal: AbortSignal.timeout(20_000),
        });
        const body = await response.text();
        assert.equal(response.status, 400, label + ": " + body.slice(0, 300));
        const result = JSON.parse(body);
        assert.equal(
          result.error?.code,
          -32020,
          label +
            " must report HeaderMismatch; wire body=" +
            body.slice(0, 500),
        );
      }
    }

    if (modern) {
      assert.ok(discovered?.supportedVersions?.includes(modernProtocol));
      assert.equal(list.json.result.resultType, "complete");
      assert.equal(call.json.result.resultType, "complete");
      assert.deepEqual(
        savedSessions,
        [],
        "modern adapter must not persist legacy sessions",
      );
      assert.ok(outgoing.every((headers) => !headers.has("MCP-Session-Id")));
      assert.ok(
        outgoing.every(
          (headers) => headers.get("MCP-Protocol-Version") === modernProtocol,
        ),
      );
      assert.equal(outgoing.at(-2)?.get("Mcp-Name"), "kicad_get_version");
    } else {
      assert.equal(discovered?.protocolVersion, "2025-11-25");
      assert.ok(
        savedSessions.length > 0,
        "legacy session metadata was not persisted",
      );
      assert.equal(outgoing[0]?.get("MCP-Protocol-Version"), "2025-11-25");
      assert.ok(
        outgoing.slice(1).some((headers) => headers.has("MCP-Session-Id")),
      );
      assert.equal(list.json.result.resultType, undefined);
    }
    console.log(
      "Studio real-pair " +
        (modern
          ? strictRc
            ? "2026 strict-canary stateless"
            : "2026 public-default stateless"
          : "2025 session") +
        " PASS: published kicad-mcp-pro " +
        version +
        "; " +
        list.json.result.tools.length +
        " tools; read-only tools/call successful; unknown tool rejected.",
    );
  } finally {
    await stopServer(child);
  }
}

async function main() {
  const version = requestedVersion(process.env.KICAD_MCP_PRO_VERSION);
  const scratch = await mkdtemp(
    path.join(tmpdir(), "kicad-studio-mcp-real-pair-"),
  );
  try {
    await compileStudioProtocol(scratch);
    // Only fixed in-repo TypeScript modules are compiled into this directory.
    const loadCompiled = async (name) => {
      const moduleUrl = pathToFileURL(path.join(scratch, "mcp", name + ".js"));
      const loaded = await import(moduleUrl.href);
      return loaded.default ?? loaded;
    };
    const modules = {
      ...(await loadCompiled("protocol/mcp2025ProtocolAdapter")),
      ...(await loadCompiled("protocol/mcp2026ProtocolAdapter")),
      ...(await loadCompiled("protocol/protocolAdapterRegistry")),
      ...(await loadCompiled("protocol/protocolLifecycle")),
      ...(await loadCompiled("transport/httpJsonRpcTransport")),
    };
    assert.equal(
      modules.resolveMcpProtocolAdapter(modernProtocol).lifecycle,
      "stateless-discovery",
    );
    assert.equal(
      modules.resolveMcpProtocolAdapter("2025-11-25").lifecycle,
      "initialize-session",
    );
    assert.throws(
      () => modules.resolveMcpProtocolAdapter("2026-07-28-draft"),
      modules.UnsupportedMcpProtocolVersionError,
    );
    assert.throws(
      () =>
        new modules.Mcp2026ProtocolAdapter().validateResponseResult({
          resultType: "input_required",
        }),
      modules.Mcp2026UnsupportedResultError,
      "unsupported MRTR must fail closed",
    );
    // Final GA on the published server's ordinary/default SDK v2 route is
    // a distinct acceptance condition from the historical opt-in RC lane.
    await runPair({ version, modern: true, modules });
    await runPair({ version, modern: true, strictRc: true, modules });
    await runPair({ version, modern: false, modules });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

test("pinned published version rejects malformed or prerelease values", () => {
  assert.equal(requestedVersion("4.1.0"), "4.1.0");
  for (const value of [
    undefined,
    "",
    "4.1.0rc1",
    "latest",
    "4.1.0 --unexpected",
  ]) {
    assert.throws(
      () => requestedVersion(value),
      /KICAD_MCP_PRO_VERSION|stable major\.minor\.patch/u,
    );
  }
});

test(
  "published MCP Studio 2026 default GA, strict canary and 2025 session real pair",
  { timeout: 300_000 },
  main,
);
