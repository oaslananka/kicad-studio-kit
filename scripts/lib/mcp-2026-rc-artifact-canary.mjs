const PROTOCOL_VERSION = "2026-07-28";
const SERVER_NAME = "kicad-mcp-pro";
const NAMED_METHOD_FIELDS = new Map([
  ["tools/call", "name"],
  ["prompts/get", "name"],
  ["resources/read", "uri"],
]);

function fail(message) {
  throw new Error(`MCP 2026 RC artifact canary: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function encodeMcpName(value) {
  if (/^[\x20-\x7E]+$/u.test(value)) {
    return value;
  }
  return `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function assertNoSessionHeader(headers) {
  if (headers.get("MCP-Session-Id")) {
    fail("stateless responses must not return MCP-Session-Id");
  }
}

function readServerInfo(result, expectedServerVersion) {
  const meta = assertObject(result._meta, "result._meta");
  const serverInfo = assertObject(
    meta["io.modelcontextprotocol/serverInfo"],
    "result._meta io.modelcontextprotocol/serverInfo",
  );
  if (serverInfo.name !== SERVER_NAME) {
    fail(`server name must be ${SERVER_NAME}`);
  }
  if (serverInfo.version !== expectedServerVersion) {
    fail(`server version must be ${expectedServerVersion}`);
  }
  return serverInfo;
}

function readCompleteResult(json, headers, expectedServerVersion) {
  assertNoSessionHeader(headers);
  const envelope = assertObject(json, "JSON-RPC response");
  if (envelope.jsonrpc !== "2.0") {
    fail("jsonrpc must be 2.0");
  }
  if (envelope.error) {
    fail(`response returned JSON-RPC error: ${JSON.stringify(envelope.error)}`);
  }
  const result = assertObject(envelope.result, "result");
  if (result.resultType !== "complete") {
    fail("resultType must be complete");
  }
  if (!Number.isInteger(result.ttlMs) || result.ttlMs <= 0) {
    fail("ttlMs must be a positive integer");
  }
  if (result.cacheScope !== "private") {
    fail("cacheScope must be private");
  }
  const serverInfo = readServerInfo(result, expectedServerVersion);
  return { result, serverInfo };
}

export function assertStablePackageVersion(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/u.test(version)) {
    fail("package version must be a stable major.minor.patch version");
  }
  return version;
}

export function buildMcp2026RcRequest({ id, method, params = {}, clientInfo }) {
  if (!Number.isInteger(id) || id < 1) {
    fail("request id must be a positive integer");
  }
  if (typeof method !== "string" || !method) {
    fail("request method must be a non-empty string");
  }
  assertObject(params, "request params");
  assertObject(clientInfo, "clientInfo");

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL_VERSION,
    "Mcp-Method": method,
  };
  const namedField = NAMED_METHOD_FIELDS.get(method);
  if (namedField) {
    const name = params[namedField];
    if (typeof name !== "string" || !name) {
      fail(`${method} requires params.${namedField}`);
    }
    headers["Mcp-Name"] = encodeMcpName(name);
  }

  return {
    headers,
    payload: {
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...structuredClone(params),
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": structuredClone(clientInfo),
        },
      },
    },
  };
}

export function validateMcp2026RcDiscover({
  json,
  headers,
  expectedServerVersion,
}) {
  assertStablePackageVersion(expectedServerVersion);
  const { result, serverInfo } = readCompleteResult(
    json,
    headers,
    expectedServerVersion,
  );
  if (
    !Array.isArray(result.supportedVersions) ||
    !result.supportedVersions.includes(PROTOCOL_VERSION)
  ) {
    fail(`supportedVersions must include ${PROTOCOL_VERSION}`);
  }
  return {
    serverVersion: serverInfo.version,
    protocolVersion: PROTOCOL_VERSION,
    ttlMs: result.ttlMs,
    cacheScope: result.cacheScope,
  };
}

export function validateMcp2026RcToolsList({
  json,
  headers,
  expectedServerVersion,
}) {
  assertStablePackageVersion(expectedServerVersion);
  const { result, serverInfo } = readCompleteResult(
    json,
    headers,
    expectedServerVersion,
  );
  if (!Array.isArray(result.tools) || result.tools.length === 0) {
    fail("tools must be a non-empty array");
  }
  const names = result.tools.map((tool) => {
    const item = assertObject(tool, "tool");
    if (typeof item.name !== "string" || !item.name) {
      fail("every tool must have a non-empty name");
    }
    return item.name;
  });
  const sortedNames = [...names].sort((left, right) =>
    left.localeCompare(right),
  );
  if (names.some((name, index) => name !== sortedNames[index])) {
    fail("tool names must be deterministic and sorted");
  }
  return {
    serverVersion: serverInfo.version,
    toolCount: result.tools.length,
    ttlMs: result.ttlMs,
    cacheScope: result.cacheScope,
  };
}
