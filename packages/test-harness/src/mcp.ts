import http, { type IncomingMessage, type ServerResponse } from "node:http";

export interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
  };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export type MockMcpHandler = (
  request: JsonRpcRequest,
  context: MockMcpContext,
) => JsonRpcResponse | Promise<JsonRpcResponse>;

export interface MockMcpContext {
  sessionId: string;
  requests: JsonRpcRequest[];
}

export interface MockStreamableHttpServer extends MockMcpContext {
  url: string;
  close(): Promise<void>;
}

export interface MockStreamableHttpServerOptions {
  sessionId?: string;
  handler?: MockMcpHandler;
}

export async function createMockStreamableHttpServer(
  options: MockStreamableHttpServerOptions = {},
): Promise<MockStreamableHttpServer> {
  const requests: JsonRpcRequest[] = [];
  const context: MockMcpContext = {
    sessionId: options.sessionId ?? "test-session",
    requests,
  };
  const handler = options.handler ?? defaultMcpHandler;
  const server = http.createServer((request, response) => {
    void handleMcpRequest(request, response, context, handler);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock MCP server did not bind to a TCP port.");
  }

  return {
    ...context,
    url: `http://127.0.0.1:${address.port}`,
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

export class MockMcpClient {
  #nextId = 1;

  constructor(private readonly baseUrl: string) {}

  async initialize(): Promise<unknown> {
    return this.call("initialize", {
      clientInfo: { name: "kicad-test-harness", version: "1.0.0" },
    });
  }

  async listTools(): Promise<unknown> {
    return this.call("tools/list");
  }

  async call(method: string, params?: unknown): Promise<unknown> {
    const id = this.#nextId++;
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!response.ok) {
      throw new Error(`MCP mock request failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as JsonRpcResponse;
    if ("error" in body) {
      throw new Error(body.error.message);
    }
    return body.result;
  }
}

async function handleMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: MockMcpContext,
  handler: MockMcpHandler,
): Promise<void> {
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }

  try {
    const body = JSON.parse(await readBody(request)) as JsonRpcRequest;
    context.requests.push(body);
    const rpcResponse = await handler(body, context);
    response.writeHead(200, {
      "content-type": "application/json",
      "MCP-Session-Id": context.sessionId,
    });
    response.end(JSON.stringify(rpcResponse));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: error instanceof Error ? error.message : "Invalid request",
        },
      }),
    );
  }
}

function defaultMcpHandler(request: JsonRpcRequest): JsonRpcResponse {
  if (request.method === "initialize") {
    return success(request, {
      serverInfo: { name: "mock-kicad-mcp", version: "1.0.0" },
      capabilities: { tools: {}, resources: {}, prompts: {} },
    });
  }
  if (request.method === "tools/list") {
    return success(request, { tools: [] });
  }
  return {
    jsonrpc: "2.0",
    id: request.id ?? null,
    error: {
      code: -32601,
      message: `Unhandled mock MCP method: ${request.method}`,
    },
  };
}

function success(request: JsonRpcRequest, result: unknown): JsonRpcSuccess {
  return {
    jsonrpc: "2.0",
    id: request.id ?? null,
    result,
  };
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
