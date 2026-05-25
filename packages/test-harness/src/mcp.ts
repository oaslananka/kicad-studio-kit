import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

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
  requestHeaders: IncomingHttpHeaders[];
}

export interface MockStreamableHttpServer extends MockMcpContext {
  url: string;
  close(): Promise<void>;
}

export interface MockStreamableHttpServerOptions {
  sessionId?: string;
  handler?: MockMcpHandler;
}

export interface MockMcpClientOptions {
  timeoutMs?: number;
}

const DEFAULT_MCP_CLIENT_TIMEOUT_MS = 5_000;

export async function createMockStreamableHttpServer(
  options: MockStreamableHttpServerOptions = {},
): Promise<MockStreamableHttpServer> {
  const requests: JsonRpcRequest[] = [];
  const requestHeaders: IncomingHttpHeaders[] = [];
  const context: MockMcpContext = {
    sessionId: options.sessionId ?? "test-session",
    requests,
    requestHeaders,
  };
  const handler = options.handler ?? defaultMcpHandler;
  const server = http.createServer((request, response) => {
    void handleMcpRequest(request, response, context, handler);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeHttpServer(server);
    throw new Error("Mock MCP server did not bind to a TCP port.");
  }

  return {
    ...context,
    url: `http://127.0.0.1:${address.port}`,
    close() {
      return closeHttpServer(server);
    },
  };
}

export class MockMcpClient {
  #nextId = 1;
  #sessionId: string | undefined;
  readonly #timeoutMs: number;

  constructor(
    private readonly baseUrl: string,
    options: MockMcpClientOptions = {},
  ) {
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_MCP_CLIENT_TIMEOUT_MS;
  }

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
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.#sessionId) {
      headers["MCP-Session-Id"] = this.#sessionId;
    }

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error(
          `MCP mock request timed out after ${this.#timeoutMs}ms`,
        );
      }
      throw error;
    }

    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) {
      this.#sessionId = sessionId;
    }

    const text = await response.text();
    if (!response.ok) {
      const failure = tryParseJsonRpcResponse(text);
      if (failure && "error" in failure) {
        throw new Error(failure.error.message);
      }
      throw new Error(
        `MCP mock request failed: HTTP ${response.status}${formatResponseContext(text)}`,
      );
    }
    const body = parseJsonRpcResponse(text);
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

  let body: JsonRpcRequest;
  try {
    body = JSON.parse(await readBody(request)) as JsonRpcRequest;
  } catch (error) {
    writeJsonRpcError(
      response,
      400,
      null,
      -32700,
      error instanceof Error ? error.message : "Invalid request",
    );
    return;
  }

  context.requests.push(body);
  context.requestHeaders.push(request.headers);

  try {
    const rpcResponse = await handler(body, context);
    response.writeHead(200, {
      "content-type": "application/json",
      "MCP-Session-Id": context.sessionId,
    });
    response.end(JSON.stringify(rpcResponse));
  } catch (error) {
    writeJsonRpcError(
      response,
      500,
      body.id ?? null,
      -32603,
      error instanceof Error ? error.message : "Internal MCP mock error",
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

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function writeJsonRpcError(
  response: ServerResponse,
  statusCode: number,
  id: string | number | null,
  code: number,
  message: string,
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
      },
    }),
  );
}

function parseJsonRpcResponse(text: string): JsonRpcResponse {
  try {
    const body = JSON.parse(text) as unknown;
    if (isJsonRpcResponse(body)) {
      return body;
    }
  } catch {
    throw new Error(
      `MCP mock returned invalid JSON${formatResponseContext(text)}`,
    );
  }
  throw new Error(
    `MCP mock returned invalid JSON-RPC response${formatResponseContext(text)}`,
  );
}

function tryParseJsonRpcResponse(text: string): JsonRpcResponse | undefined {
  try {
    const body = JSON.parse(text) as unknown;
    return isJsonRpcResponse(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!isRecord(value) || value["jsonrpc"] !== "2.0" || !("id" in value)) {
    return false;
  }
  if ("result" in value) {
    return true;
  }
  const error = value["error"];
  return (
    isRecord(error) &&
    typeof error["code"] === "number" &&
    typeof error["message"] === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function formatResponseContext(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return ": empty response";
  }
  const excerpt =
    trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
  return `: ${excerpt}`;
}
