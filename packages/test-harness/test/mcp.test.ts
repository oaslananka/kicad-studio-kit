import assert from "node:assert/strict";
import test from "node:test";

import { createMockStreamableHttpServer, MockMcpClient } from "../src/index";

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
