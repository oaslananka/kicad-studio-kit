import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import test from "node:test";

import {
  createMockStreamableHttpServer,
  type JsonRpcResponse,
  MockMcpClient,
} from "../src/index";

test("serves a mock Streamable HTTP MCP initialize and tools/list flow", async () => {
  const server = await createMockStreamableHttpServer({
    sessionId: "oaslana-54-session",
  });

  try {
    const client = new MockMcpClient(server.url);
    const initialize = await client.initialize();
    const tools = await client.listTools();

    assert.deepEqual(initialize, {
      serverInfo: { name: "mock-kicad-mcp", version: "1.0.0" },
      capabilities: { tools: {}, resources: {}, prompts: {} },
    });
    assert.deepEqual(tools, { tools: [] });
    assert.deepEqual(
      server.requests.map((request) => request.method),
      ["initialize", "tools/list"],
    );
  } finally {
    await server.close();
  }
});

test("persists Streamable HTTP session id after initialization", async () => {
  const server = await createMockStreamableHttpServer({
    sessionId: "oaslana-54-session",
  });

  try {
    const client = new MockMcpClient(server.url);

    await client.initialize();
    await client.listTools();

    assert.equal(server.requestHeaders[0]?.["mcp-session-id"], undefined);
    assert.equal(
      server.requestHeaders[1]?.["mcp-session-id"],
      "oaslana-54-session",
    );
  } finally {
    await server.close();
  }
});

test("reports parse errors separately from handler failures", async () => {
  const parseServer = await createMockStreamableHttpServer();

  try {
    const parseResponse = await fetch(parseServer.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const parseBody = (await parseResponse.json()) as JsonRpcResponse;

    assert.equal(parseResponse.status, 400);
    assert.equal("error" in parseBody && parseBody.error.code, -32700);
  } finally {
    await parseServer.close();
  }

  const handlerServer = await createMockStreamableHttpServer({
    handler() {
      throw new Error("handler exploded");
    },
  });

  try {
    const handlerResponse = await fetch(handlerServer.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 42, method: "explode" }),
    });
    const handlerBody = (await handlerResponse.json()) as JsonRpcResponse;

    assert.equal(handlerResponse.status, 500);
    assert.equal("error" in handlerBody && handlerBody.id, 42);
    assert.equal("error" in handlerBody && handlerBody.error.code, -32603);
    assert.equal(
      "error" in handlerBody && handlerBody.error.message,
      "handler exploded",
    );
  } finally {
    await handlerServer.close();
  }
});

test("reports invalid JSON responses with response context", async () => {
  const { server, url } = await listen(
    http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("not-json");
    }),
  );

  try {
    const client = new MockMcpClient(url);

    await assert.rejects(
      () => client.initialize(),
      /MCP mock returned invalid JSON: not-json/u,
    );
  } finally {
    await close(server);
  }
});

test("times out stalled mock MCP responses", async () => {
  const { server, url } = await listen(
    http.createServer((_request, _response) => {
      // Leave the response open so the client timeout is the only exit path.
    }),
  );

  try {
    const client = new MockMcpClient(url, { timeoutMs: 20 });

    await assert.rejects(
      () => client.initialize(),
      /MCP mock request timed out after 20ms/u,
    );
  } finally {
    await close(server);
  }
});

function listen(server: Server): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
