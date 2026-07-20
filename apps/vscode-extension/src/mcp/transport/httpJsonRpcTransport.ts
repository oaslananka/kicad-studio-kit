export interface JsonRpcResponse<T> {
  result?: T | undefined;
  error?:
    | {
        message?: string | undefined;
        data?: unknown;
      }
    | undefined;
}

export interface HttpJsonRpcRequest {
  baseEndpoint: string;
  id: number;
  method: string;
  params: Record<string, unknown>;
  headers: Record<string, string>;
  allowLegacySse: boolean;
  timeoutMs: number;
}

export interface HttpJsonRpcResult<T> {
  json: JsonRpcResponse<T>;
  headers: Headers;
}

export interface McpRpcTransport {
  execute<T>(request: HttpJsonRpcRequest): Promise<HttpJsonRpcResult<T>>;
}

interface TransportLogger {
  debug(message: string): void;
  warn(message: string): void;
}

interface TransportTrafficLogger {
  recordRequest(
    method: string,
    payload: string,
    headers: Record<string, string>
  ): void;
  recordResponse(method: string, payload: unknown): void;
  recordError(method: string, message: string): void;
}

type FetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type SleepFunction = (milliseconds: number) => Promise<void>;

export interface HttpJsonRpcTransportOptions {
  fetchFn?: FetchFunction | undefined;
  sleepFn?: SleepFunction | undefined;
  logger: TransportLogger;
  trafficLogger?: TransportTrafficLogger | undefined;
  maxRetries?: number | undefined;
  retryBaseDelayMs?: number | undefined;
}

export class McpHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'McpHttpError';
  }
}

export class McpRequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`MCP request timed out after ${timeoutMs}ms.`);
    this.name = 'McpRequestTimeoutError';
  }
}

export class HttpJsonRpcTransport implements McpRpcTransport {
  private readonly fetchFn: FetchFunction;
  private readonly sleepFn: SleepFunction;
  private readonly logger: TransportLogger;
  private readonly trafficLogger: TransportTrafficLogger | undefined;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(options: HttpJsonRpcTransportOptions) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.sleepFn = options.sleepFn ?? sleep;
    this.logger = options.logger;
    this.trafficLogger = options.trafficLogger;
    this.maxRetries = Math.max(1, options.maxRetries ?? 3);
    this.retryBaseDelayMs = Math.max(1, options.retryBaseDelayMs ?? 200);
  }

  async execute<T>(request: HttpJsonRpcRequest): Promise<HttpJsonRpcResult<T>> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      try {
        return await this.executeOnce<T>(request);
      } catch (error) {
        lastError = error;
        this.trafficLogger?.recordError(
          request.method,
          error instanceof Error ? error.message : String(error)
        );

        if (attempt === this.maxRetries - 1 || !isTransientMcpError(error)) {
          throw error;
        }

        const delayMs = this.retryBaseDelayMs * 2 ** attempt;
        this.logger.debug(
          `MCP ${request.method} failed transiently; retrying in ${delayMs}ms.`
        );
        await this.sleepFn(delayMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async executeOnce<T>(
    request: HttpJsonRpcRequest
  ): Promise<HttpJsonRpcResult<T>> {
    const baseEndpoint = request.baseEndpoint.replace(/\/$/u, '');
    const primaryEndpoint = `${baseEndpoint}/mcp`;
    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      method: request.method,
      params: request.params
    });
    this.trafficLogger?.recordRequest(
      request.method,
      requestBody,
      request.headers
    );

    const primaryResponse = await fetchWithTimeout(
      this.fetchFn,
      primaryEndpoint,
      {
        method: 'POST',
        headers: request.headers,
        body: requestBody
      },
      request.timeoutMs
    );

    let result: HttpJsonRpcResult<T>;
    if (primaryResponse.status === 404 || primaryResponse.status === 405) {
      if (!request.allowLegacySse) {
        throw new Error(
          `The configured MCP server at ${primaryEndpoint} does not expose Streamable HTTP. Upgrade kicad-mcp-pro or explicitly enable the legacy SSE fallback.`
        );
      }

      this.logger.warn(
        'Falling back to legacy MCP /sse transport because the legacy fallback is enabled.'
      );
      result = await readRpcResponse<T>(
        await fetchWithTimeout(
          this.fetchFn,
          `${baseEndpoint}/sse`,
          {
            method: 'POST',
            headers: request.headers,
            body: requestBody
          },
          request.timeoutMs
        )
      );
    } else {
      result = await readRpcResponse<T>(primaryResponse);
    }

    this.trafficLogger?.recordResponse(request.method, result.json);
    return result;
  }
}

async function fetchWithTimeout(
  fetchFn: FetchFunction,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new McpRequestTimeoutError(timeoutMs));
  }, timeoutMs);

  try {
    return await fetchFn(input, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new McpRequestTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readRpcResponse<T>(
  response: Response
): Promise<HttpJsonRpcResult<T>> {
  if (!response.ok) {
    throw new McpHttpError(response.status);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const json = contentType.includes('text/event-stream')
    ? parseSseJsonRpc<T>(await response.text())
    : ((await response.json()) as JsonRpcResponse<T>);

  return {
    json,
    headers: response.headers
  };
}

function parseSseJsonRpc<T>(payload: string): JsonRpcResponse<T> {
  const events = payload
    .split(/\r?\n\r?\n/u)
    .map((chunk) =>
      chunk
        .split(/\r?\n/u)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim())
        .join('')
    )
    .filter(Boolean);

  const lastEvent = events.at(-1);
  if (!lastEvent) {
    throw new Error('The MCP server returned an empty SSE payload.');
  }

  return JSON.parse(lastEvent) as JsonRpcResponse<T>;
}

function isTransientMcpError(error: unknown): boolean {
  if (error instanceof McpRequestTimeoutError) {
    return true;
  }
  if (error instanceof McpHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return (
    error instanceof TypeError ||
    /(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|fetch)/iu.test(String(error))
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
