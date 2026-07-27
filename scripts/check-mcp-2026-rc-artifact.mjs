#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertStablePackageVersion,
  buildMcp2026RcRequest,
  validateMcp2026RcDiscover,
  validateMcp2026RcToolsList,
} from "./lib/mcp-2026-rc-artifact-canary.mjs";

const STARTUP_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 20_000;
const LOG_LIMIT = 40_000;
const CLIENT_INFO = {
  name: "kicad-studio-artifact-canary",
  version: "1.9.7",
};

function parseVersion(argv) {
  const index = argv.indexOf("--version");
  if (index < 0 || !argv[index + 1]) {
    throw new Error(
      "Usage: check-mcp-2026-rc-artifact.mjs --version <major.minor.patch>",
    );
  }
  return assertStablePackageVersion(argv[index + 1]);
}

async function allocatePort() {
  const server = createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not allocate an ephemeral loopback port");
  }
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function startPublishedArtifact(version, port) {
  const uv = process.env.UV || "uv";
  const child = spawn(
    uv,
    [
      "run",
      "--quiet",
      "--with",
      `kicad-mcp-pro==${version}`,
      "--no-project",
      "kicad-mcp-pro",
    ],
    {
      env: {
        ...process.env,
        KICAD_MCP_PROTOCOL_LANE: "2026-07-28-rc",
        KICAD_MCP_TRANSPORT: "streamable-http",
        KICAD_MCP_STATEFUL_HTTP: "0",
        KICAD_MCP_LEGACY_SSE: "0",
        KICAD_MCP_HOST: "127.0.0.1",
        KICAD_MCP_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let logs = "";
  const appendLog = (chunk) => {
    logs = `${logs}${chunk.toString("utf8")}`.slice(-LOG_LIMIT);
  };
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);

  return { child, readLogs: () => logs };
}

async function waitForReady(child, endpoint, readLogs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(
        `Published kicad-mcp-pro exited before readiness (code ${child.exitCode}).\n${readLogs()}`,
      );
    }
    try {
      await fetch(endpoint, {
        headers: { Accept: "application/json, text/event-stream" },
        signal: AbortSignal.timeout(1_000),
      });
      return;
    } catch {
      await delay(500);
    }
  }
  throw new Error(
    `Published kicad-mcp-pro did not become ready within ${STARTUP_TIMEOUT_MS} ms.\n${readLogs()}`,
  );
}

async function postJson(endpoint, request) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Published artifact returned non-JSON HTTP ${response.status}: ${text.slice(0, 500)}`,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new Error(
      `Published artifact returned HTTP ${response.status}: ${JSON.stringify(json)}`,
    );
  }
  return { json, headers: response.headers };
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(5_000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

async function main() {
  const version = parseVersion(process.argv.slice(2));
  const port = await allocatePort();
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  const { child, readLogs } = startPublishedArtifact(version, port);

  try {
    await Promise.race([
      waitForReady(child, endpoint, readLogs),
      once(child, "error").then(([error]) => {
        throw error;
      }),
    ]);

    const discoverRequest = buildMcp2026RcRequest({
      id: 1,
      method: "server/discover",
      clientInfo: CLIENT_INFO,
    });
    const discoverResponse = await postJson(endpoint, discoverRequest);
    const discover = validateMcp2026RcDiscover({
      ...discoverResponse,
      expectedServerVersion: version,
    });

    const toolsRequest = buildMcp2026RcRequest({
      id: 2,
      method: "tools/list",
      clientInfo: CLIENT_INFO,
    });
    const toolsResponse = await postJson(endpoint, toolsRequest);
    const tools = validateMcp2026RcToolsList({
      ...toolsResponse,
      expectedServerVersion: version,
    });

    console.log(
      `Published MCP 2026 RC artifact canary passed: kicad-mcp-pro ${version}, ` +
        `${discover.protocolVersion}, ${tools.toolCount} tools, stateless private-cache responses.`,
    );
  } catch (error) {
    const logs = readLogs();
    if (logs) {
      console.error("--- published artifact log tail ---");
      console.error(logs);
    }
    throw error;
  } finally {
    await stopChild(child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
