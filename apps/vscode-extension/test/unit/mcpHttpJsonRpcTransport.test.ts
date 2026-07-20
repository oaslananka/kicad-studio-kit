import {
  HttpJsonRpcTransport,
  McpHttpError,
  McpRequestTimeoutError
} from '../../src/mcp/transport/httpJsonRpcTransport';

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {})
    }
  });
}

function sseResponse(payload: string): Response {
  return new Response(payload, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  });
}

function createLogger() {
  return {
    debug: jest.fn(),
    warn: jest.fn()
  };
}

function createTrafficLogger() {
  return {
    recordRequest: jest.fn(),
    recordResponse: jest.fn(),
    recordError: jest.fn()
  };
}

describe('HTTP JSON-RPC transport boundary (#492)', () => {
  it('posts a JSON-RPC envelope to the primary MCP endpoint (#492)', async () => {
    const fetchFn = jest.fn(async (_input, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        jsonrpc: '2.0',
        id: 17,
        method: 'tools/list',
        params: {}
      });
      return jsonResponse(
        { result: { tools: [] } },
        { headers: { 'MCP-Session-Id': 'session-17' } }
      );
    });
    const trafficLogger = createTrafficLogger();
    const transport = new HttpJsonRpcTransport({
      fetchFn,
      logger: createLogger(),
      trafficLogger,
      maxRetries: 1
    });

    const result = await transport.execute<{ tools: unknown[] }>({
      baseEndpoint: 'http://127.0.0.1:27185',
      id: 17,
      method: 'tools/list',
      params: {},
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-11-25'
      },
      allowLegacySse: false,
      timeoutMs: 1000
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:27185/mcp',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'MCP-Protocol-Version': '2025-11-25'
        }),
        signal: expect.any(AbortSignal)
      })
    );
    expect(result.json).toEqual({ result: { tools: [] } });
    expect(result.headers.get('MCP-Session-Id')).toBe('session-17');
    expect(trafficLogger.recordRequest).toHaveBeenCalledWith(
      'tools/list',
      expect.any(String),
      expect.objectContaining({
        'MCP-Protocol-Version': '2025-11-25'
      })
    );
    expect(trafficLogger.recordResponse).toHaveBeenCalledWith('tools/list', {
      result: { tools: [] }
    });
  });

  it('parses the last JSON-RPC event from text/event-stream (#492)', async () => {
    const transport = new HttpJsonRpcTransport({
      fetchFn: jest.fn(async () =>
        sseResponse(
          [
            'event: message',
            'data: {"result":{"sequence":1}}',
            '',
            'event: message',
            'data: {"result":{"sequence":2}}',
            ''
          ].join('\n')
        )
      ),
      logger: createLogger(),
      maxRetries: 1
    });

    await expect(
      transport.execute<{ sequence: number }>({
        baseEndpoint: 'http://127.0.0.1:27185',
        id: 1,
        method: 'tools/call',
        params: {},
        headers: {},
        allowLegacySse: false,
        timeoutMs: 1000
      })
    ).resolves.toMatchObject({ json: { result: { sequence: 2 } } });
  });

  it('uses legacy SSE fallback only when opted in after 404 or 405 (#492)', async () => {
    const disabledFetch = jest.fn(async () =>
      jsonResponse({}, { status: 404 })
    );
    const disabled = new HttpJsonRpcTransport({
      fetchFn: disabledFetch,
      logger: createLogger(),
      maxRetries: 1
    });

    await expect(
      disabled.execute({
        baseEndpoint: 'http://127.0.0.1:27185',
        id: 1,
        method: 'initialize',
        params: {},
        headers: {},
        allowLegacySse: false,
        timeoutMs: 1000
      })
    ).rejects.toThrow('does not expose Streamable HTTP');
    expect(disabledFetch).toHaveBeenCalledTimes(1);

    const enabledFetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 405 }))
      .mockResolvedValueOnce(
        sseResponse('data: {"result":{"legacy":true}}\n\n')
      );
    const logger = createLogger();
    const enabled = new HttpJsonRpcTransport({
      fetchFn: enabledFetch,
      logger,
      maxRetries: 1
    });

    await expect(
      enabled.execute<{ legacy: boolean }>({
        baseEndpoint: 'http://127.0.0.1:27185',
        id: 2,
        method: 'initialize',
        params: {},
        headers: {},
        allowLegacySse: true,
        timeoutMs: 1000
      })
    ).resolves.toMatchObject({ json: { result: { legacy: true } } });
    expect(enabledFetch.mock.calls[1]?.[0]).toBe('http://127.0.0.1:27185/sse');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('legacy MCP /sse transport')
    );
  });

  it('aborts timed-out requests with an actionable transport error (#492)', async () => {
    const fetchFn = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason);
          });
        })
    );
    const transport = new HttpJsonRpcTransport({
      fetchFn,
      logger: createLogger(),
      maxRetries: 1
    });

    await expect(
      transport.execute({
        baseEndpoint: 'http://127.0.0.1:27185',
        id: 1,
        method: 'tools/list',
        params: {},
        headers: {},
        allowLegacySse: false,
        timeoutMs: 1
      })
    ).rejects.toBeInstanceOf(McpRequestTimeoutError);
  });

  it('retries transient failures with exponential backoff and traffic evidence (#492)', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('network reset'))
      .mockResolvedValueOnce(jsonResponse({ result: { ok: true } }));
    const sleepFn = jest.fn(async () => undefined);
    const logger = createLogger();
    const trafficLogger = createTrafficLogger();
    const transport = new HttpJsonRpcTransport({
      fetchFn,
      sleepFn,
      logger,
      trafficLogger,
      maxRetries: 3,
      retryBaseDelayMs: 10
    });

    await expect(
      transport.execute<{ ok: boolean }>({
        baseEndpoint: 'http://127.0.0.1:27185',
        id: 3,
        method: 'tools/call',
        params: { name: 'project_ping' },
        headers: {},
        allowLegacySse: false,
        timeoutMs: 1000
      })
    ).resolves.toMatchObject({ json: { result: { ok: true } } });

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenNthCalledWith(1, 10);
    expect(sleepFn).toHaveBeenNthCalledWith(2, 20);
    expect(logger.debug).toHaveBeenCalledTimes(2);
    expect(trafficLogger.recordError).toHaveBeenCalledTimes(2);
  });

  it('does not retry deterministic HTTP failures (#492)', async () => {
    const fetchFn = jest.fn(async () => jsonResponse({}, { status: 400 }));
    const sleepFn = jest.fn(async () => undefined);
    const transport = new HttpJsonRpcTransport({
      fetchFn,
      sleepFn,
      logger: createLogger(),
      maxRetries: 3
    });

    const execution = transport.execute({
      baseEndpoint: 'http://127.0.0.1:27185',
      id: 4,
      method: 'tools/list',
      params: {},
      headers: {},
      allowLegacySse: false,
      timeoutMs: 1000
    });

    await expect(execution).rejects.toBeInstanceOf(McpHttpError);
    await expect(execution).rejects.toMatchObject({ status: 400 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });
});
