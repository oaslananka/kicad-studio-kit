import { McpClient } from '../../src/mcp/mcpClient';
import {
  __setConfiguration,
  createExtensionContextMock,
  workspace
} from './vscodeMock';

// Mock node:fs so the VsCodeStdio fallback cannot read the real .vscode/mcp.json
// that exists in this workspace. Individual tests override existsSync/readFileSync
// to exercise the stdio-detection path with controlled data.
jest.mock('node:fs', () => ({
  ...jest.requireActual<typeof import('node:fs')>('node:fs'),
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue('{}')
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedFs = require('node:fs') as {
  existsSync: jest.MockedFunction<typeof import('node:fs').existsSync>;
  readFileSync: jest.MockedFunction<typeof import('node:fs').readFileSync>;
};

function createJsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> }
) {
  const normalizedBody =
    (init?.status ?? 200) >= 200 &&
    (init?.status ?? 200) < 300 &&
    isEmptyResult(body)
      ? {
          result: {
            serverInfo: { version: '1.0.0' },
            capabilities: { tools: [], resources: [], prompts: [] }
          }
        }
      : body;
  return {
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    headers: new Headers({
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }),
    json: async () => normalizedBody
  };
}

function createSseResponse(
  payload: string,
  init?: { status?: number; headers?: Record<string, string> }
) {
  return {
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    headers: new Headers({
      'content-type': 'text/event-stream',
      ...(init?.headers ?? {})
    }),
    text: async () => payload
  };
}

function isEmptyResult(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'result' in body &&
    typeof (body as { result?: unknown }).result === 'object' &&
    (body as { result?: unknown }).result !== null &&
    Object.keys((body as { result: Record<string, unknown> }).result).length ===
      0
  );
}

describe('McpClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocked fs helpers to safe defaults before each test.
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.readFileSync.mockReturnValue('{}');
    __setConfiguration({
      'kicadstudio.mcp.endpoint': 'http://127.0.0.1:27185',
      'kicadstudio.mcp.pushContext': true,
      'kicadstudio.mcp.allowLegacySse': false
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    workspace.isTrusted = true;
  });

  function createClient(context = createExtensionContextMock(), options = {}) {
    return new McpClient(
      context as never,
      {
        detectKicadMcpPro: jest
          .fn()
          .mockResolvedValue({ found: true, source: 'uvx' })
      } as never,
      {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      } as never,
      options
    );
  }

  it('does not probe or push MCP context in restricted workspaces', async () => {
    workspace.isTrusted = false;
    global.fetch = jest.fn() as typeof fetch;
    const detector = {
      detectKicadMcpPro: jest
        .fn()
        .mockResolvedValue({ found: true, source: 'uvx' })
    };
    const client = new McpClient(
      createExtensionContextMock() as never,
      detector as never,
      {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      } as never
    );

    await expect(client.detectInstall()).resolves.toEqual({
      found: false,
      source: 'none'
    });
    await expect(client.testConnection()).resolves.toEqual(
      expect.objectContaining({
        kind: 'Disconnected',
        available: false,
        connected: false
      })
    );
    await expect(
      client.pushContext({
        activeFile: 'board.kicad_pcb',
        fileType: 'pcb',
        drcErrors: []
      })
    ).resolves.toBeUndefined();

    expect(detector.detectKicadMcpPro).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends the extension package version in MCP client metadata', async () => {
    const rpcBodies: Array<{ method?: string; params?: unknown }> = [];
    const fetchMock = jest.fn(async (_url, init?: RequestInit) => {
      rpcBodies.push(JSON.parse(String(init?.body)));
      const method = rpcBodies[rpcBodies.length - 1]?.method;
      return createJsonResponse(
        method === 'tools/list' ? { result: { tools: [] } } : { result: {} },
        { headers: { 'MCP-Session-Id': 'version-session' } }
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const context = {
      ...createExtensionContextMock(),
      extension: {
        packageJSON: {
          name: 'kicadstudio',
          version: '9.9.9'
        }
      }
    };

    await expect(createClient(context).testConnection()).resolves.toEqual(
      expect.objectContaining({ connected: true })
    );

    expect(rpcBodies[0]).toEqual(
      expect.objectContaining({
        method: 'initialize',
        params: expect.objectContaining({
          clientInfo: {
            name: 'kicad-studio',
            version: '9.9.9'
          }
        })
      })
    );
  });

  it('attaches an abortable timeout signal to MCP HTTP requests', async () => {
    __setConfiguration({
      'kicadstudio.mcp.endpoint': 'http://127.0.0.1:27185',
      'kicadstudio.mcp.pushContext': true,
      'kicadstudio.mcp.allowLegacySse': false,
      'kicadstudio.mcp.timeout': 1
    });
    const fetchMock = jest.fn(async (_url, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return createJsonResponse(
        { result: {} },
        { headers: { 'MCP-Session-Id': 'timeout-session' } }
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient().testConnection()).resolves.toEqual(
      expect.objectContaining({ available: true })
    );
    expect(fetchMock).toHaveBeenCalled();
  });

  it('initializes a session and reuses MCP-Session-Id for subsequent calls', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'session-123' } }
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            structuredContent: { ok: true }
          }
        })
      );
    global.fetch = fetchMock as typeof fetch;

    const result = await createClient().callTool('project_ping', {});

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual(
      expect.objectContaining({ 'MCP-Session-Id': 'session-123' })
    );
  });

  it('sends the negotiated MCP protocol version on HTTP requests', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'protocol-session' } }
        )
      )
      .mockResolvedValueOnce(createJsonResponse({ result: { tools: [] } }));
    global.fetch = fetchMock as typeof fetch;

    await expect(createClient().testConnection()).resolves.toEqual(
      expect.objectContaining({ connected: true })
    );

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'MCP-Protocol-Version': '2025-11-25'
      })
    );
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'MCP-Protocol-Version': '2025-11-25'
      })
    );
  });

  it('refuses non-loopback MCP endpoints by default', async () => {
    __setConfiguration({
      'kicadstudio.mcp.endpoint': 'https://mcp.example.com',
      'kicadstudio.mcp.pushContext': true,
      'kicadstudio.mcp.allowLegacySse': false,
      'kicadstudio.mcp.allowRemoteEndpoint': false
    });
    global.fetch = jest.fn() as typeof fetch;

    await expect(createClient().testConnection()).rejects.toThrow(
      'Refusing remote MCP endpoint'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('allows non-loopback MCP endpoints only when explicitly enabled', async () => {
    __setConfiguration({
      'kicadstudio.mcp.endpoint': 'https://mcp.example.com',
      'kicadstudio.mcp.pushContext': true,
      'kicadstudio.mcp.allowLegacySse': false,
      'kicadstudio.mcp.allowRemoteEndpoint': true
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'remote-session' } }
        )
      )
      .mockResolvedValueOnce(createJsonResponse({ result: { tools: [] } }));
    global.fetch = fetchMock as typeof fetch;

    await expect(createClient().testConnection()).resolves.toEqual(
      expect.objectContaining({ available: true, connected: true })
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://mcp.example.com/mcp');
  });

  it('parses JSON text tool results and falls back to plain text when JSON parsing fails', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'session-json' } }
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            content: [{ text: '{"preview":"ready"}' }]
          }
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            content: [{ text: 'preview unavailable' }]
          }
        })
      );
    global.fetch = fetchMock as typeof fetch;

    const client = createClient();

    await expect(client.callTool('tool_json', {})).resolves.toEqual({
      preview: 'ready'
    });
    await expect(client.callTool('tool_text', {})).resolves.toEqual({
      text: 'preview unavailable'
    });
  });

  it('parses JSON-RPC payloads returned over text/event-stream', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'session-xyz' } }
        )
      )
      .mockResolvedValueOnce(
        createSseResponse(
          'event: message\ndata: {"result":{"structuredContent":{"preview":"via-sse"}}}\n\n'
        )
      );
    global.fetch = fetchMock as typeof fetch;

    const result = await createClient().callTool('tool_sse', {});

    expect(result).toEqual({ preview: 'via-sse' });
  });

  it('reads resources as JSON when possible and as raw text otherwise', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'session-resource' } }
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            contents: [{ text: '{"items":[{"id":"fix-1"}]}' }]
          }
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            contents: [{ text: 'raw-text' }]
          }
        })
      );
    global.fetch = fetchMock as typeof fetch;

    const client = createClient();

    await expect(
      client.readResource('kicad://project/fix_queue')
    ).resolves.toEqual({
      items: [{ id: 'fix-1' }]
    });
    await expect(client.readResource('kicad://project/notes')).resolves.toEqual(
      { text: 'raw-text' }
    );
  });

  it('prefers the fix queue resource and falls back to a tool call when the resource is empty', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'session-fixes' } }
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            contents: [
              {
                text: '{"items":[{"id":"fix-1","description":"From resource"}]}'
              }
            ]
          }
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            contents: []
          }
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            structuredContent: {
              items: [
                {
                  id: 'fix-2',
                  description: 'From tool',
                  tool: 'apply_fix',
                  args: {}
                }
              ]
            }
          }
        })
      );
    global.fetch = fetchMock as typeof fetch;

    const client = createClient();

    await expect(client.fetchFixQueue()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'fix-1' })])
    );
    await expect(client.fetchFixQueue()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'fix-2', tool: 'apply_fix' })
      ])
    );
  });

  it('handles disabled context push and connection failures gracefully', async () => {
    __setConfiguration({
      'kicadstudio.mcp.endpoint': 'http://127.0.0.1:27185',
      'kicadstudio.mcp.pushContext': false,
      'kicadstudio.mcp.allowLegacySse': false
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        createJsonResponse({ error: { message: 'boom' } }, { status: 500 })
      );
    global.fetch = fetchMock as typeof fetch;

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const client = new McpClient(
      createExtensionContextMock() as never,
      {
        detectKicadMcpPro: jest
          .fn()
          .mockResolvedValue({ found: true, source: 'uvx' })
      } as never,
      logger as never
    );

    await expect(
      client.pushContext({
        activeFile: 'board.kicad_pcb',
        fileType: 'pcb',
        drcErrors: []
      })
    ).resolves.toBeUndefined();

    await expect(client.testConnection()).resolves.toEqual(
      expect.objectContaining({ available: true, connected: false })
    );
    expect(logger.debug).toHaveBeenCalled();
  });

  it('uses the legacy /sse fallback only when explicitly enabled', async () => {
    __setConfiguration({
      'kicadstudio.mcp.endpoint': 'http://127.0.0.1:27185',
      'kicadstudio.mcp.pushContext': true,
      'kicadstudio.mcp.allowLegacySse': true
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ result: {} }, { status: 404 })
      )
      .mockResolvedValueOnce(createJsonResponse({ result: {} }))
      .mockResolvedValueOnce(
        createJsonResponse({ result: {} }, { status: 404 })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            structuredContent: { fallback: true }
          }
        })
      );
    global.fetch = fetchMock as typeof fetch;

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const client = new McpClient(
      createExtensionContextMock() as never,
      {
        detectKicadMcpPro: jest
          .fn()
          .mockResolvedValue({ found: true, source: 'uvx' })
      } as never,
      logger as never
    );

    await expect(client.callTool('legacy_tool', {})).resolves.toEqual({
      fallback: true
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:27185/sse');
    expect(fetchMock.mock.calls[3]?.[0]).toBe('http://127.0.0.1:27185/sse');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('reports a healthy connection when tools/list succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'session-ok' } }
        )
      )
      .mockResolvedValueOnce(createJsonResponse({ result: { tools: [] } }));
    global.fetch = fetchMock as typeof fetch;

    await expect(createClient().testConnection()).resolves.toEqual(
      expect.objectContaining({ available: true, connected: true })
    );
  });

  it.each([400, 401, 403, 404, 421, 500])(
    'marks MCP degraded when tools/list fails with HTTP %i after initialize',
    async (status) => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse(
            { result: {} },
            { headers: { 'MCP-Session-Id': 'degraded-session' } }
          )
        )
        .mockResolvedValue(
          createJsonResponse(
            {
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32000,
                message: 'MCP protocol contract failed'
              }
            },
            { status }
          )
        );
      global.fetch = fetchMock as typeof fetch;

      const state = await createClient(createExtensionContextMock(), {
        maxRetries: 1
      }).testConnection();

      expect(state).toEqual(
        expect.objectContaining({
          kind: 'Degraded',
          available: true,
          connected: false
        })
      );
      expect(state.message).toContain('MCP protocol contract failed');
      expect(state.message).toContain(
        status === 404 ? 'does not expose Streamable HTTP' : `HTTP ${status}`
      );
    }
  );

  it('does not mark cached server metadata as degraded when initialize fails before a live handshake', async () => {
    const context = createExtensionContextMock();
    await context.globalState.update('kicadstudio.mcp.lastServerCard', {
      version: '1.0.0',
      compat: 'compatible',
      capabilities: { tools: [], resources: [], prompts: [] },
      capturedAt: '2026-05-21T00:00:00.000Z'
    });
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const state = await createClient(context, {
      maxRetries: 1
    }).testConnection();

    expect(state).toEqual(
      expect.objectContaining({
        kind: 'Disconnected',
        available: true,
        connected: false,
        message: 'ECONNREFUSED'
      })
    );
  });

  it('marks MCP degraded when tools/list returns a JSON-RPC error after initialize', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'degraded-jsonrpc-session' } }
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          error: {
            message: 'Invalid JSON-RPC request'
          }
        })
      );
    global.fetch = fetchMock as typeof fetch;

    await expect(createClient().testConnection()).resolves.toEqual(
      expect.objectContaining({
        kind: 'Degraded',
        connected: false,
        message: 'MCP protocol contract failed: Invalid JSON-RPC request'
      })
    );
  });

  it('returns preview fallback text and undefined resources when MCP omits text content', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'session-preview' } }
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse({ result: { structuredContent: {} } })
      )
      .mockResolvedValueOnce(
        createJsonResponse({ result: { contents: [{}] } })
      );
    global.fetch = fetchMock as typeof fetch;

    const client = createClient();

    await expect(
      client.previewToolCall({
        name: 'project_fix',
        arguments: {},
        preview: 'Saved preview'
      })
    ).resolves.toBe('Saved preview');
    await expect(
      client.readResource('kicad://project/empty')
    ).resolves.toBeUndefined();
  });

  it('logs and swallows context-push errors when MCP is enabled but unavailable', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        createJsonResponse(
          { error: { message: 'bad gateway' } },
          { status: 502 }
        )
      );
    global.fetch = fetchMock as typeof fetch;

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const client = new McpClient(
      createExtensionContextMock() as never,
      {
        detectKicadMcpPro: jest
          .fn()
          .mockResolvedValue({ found: true, source: 'uvx' })
      } as never,
      logger as never
    );

    await expect(
      client.pushContext({
        activeFile: 'board.kicad_pcb',
        fileType: 'pcb',
        drcErrors: ['clearance']
      })
    ).resolves.toBeUndefined();

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('MCP context push skipped')
    );
  });

  it('reports a clear upgrade error when the server does not expose streamable HTTP', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(createJsonResponse({ result: {} }, { status: 404 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(
      createClient().callTool('legacy_only_tool', {})
    ).rejects.toThrow('does not expose Streamable HTTP');
  });

  it('persists session IDs in global state and reuses them after restart', async () => {
    const context = createExtensionContextMock();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'persisted-1' } }
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            structuredContent: { first: true }
          }
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            structuredContent: { second: true }
          }
        })
      );
    global.fetch = fetchMock as typeof fetch;

    await expect(
      createClient(context).callTool('project_ping', {})
    ).resolves.toEqual({ first: true });
    expect(context.globalState.update).toHaveBeenCalledWith(
      'kicadstudio.mcp.sessionId',
      'persisted-1'
    );

    await expect(
      createClient(context).callTool('project_ping', {})
    ).resolves.toEqual({ second: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual(
      expect.objectContaining({ 'MCP-Session-Id': 'persisted-1' })
    );
  });

  it('retries transient MCP failures with exponential backoff', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ result: {} }, { status: 503 })
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          { result: {} },
          { headers: { 'MCP-Session-Id': 'retry-session' } }
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse({ result: {} }, { status: 503 })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            structuredContent: { ok: true }
          }
        })
      );
    global.fetch = fetchMock as typeof fetch;

    await expect(
      createClient(createExtensionContextMock(), {
        retryBaseDelayMs: 1
      }).callTool('project_ping', {})
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('reports VsCodeStdio state when HTTP fails but .vscode/mcp.json has kicad-mcp-pro (command field)', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({
        servers: {
          kicad: { command: 'kicad-mcp-pro', args: [], type: 'stdio' }
        }
      })
    );

    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = createClient();
    const state = await client.testConnection();

    expect(state.kind).toBe('VsCodeStdio');
    expect(state.connected).toBe(true);
    expect(state.available).toBe(true);
  });

  it('reports VsCodeStdio state when kicad-mcp-pro appears in args (not command)', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({
        servers: {
          kicad: { command: 'uvx', args: ['kicad-mcp-pro'], type: 'stdio' }
        }
      })
    );

    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = createClient();
    const state = await client.testConnection();

    expect(state.kind).toBe('VsCodeStdio');
    expect(state.connected).toBe(true);
  });

  it('stays Disconnected when .vscode/mcp.json exists but has no kicad-mcp-pro server', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({
        servers: {
          other: { command: 'some-other-tool', args: [], type: 'stdio' }
        }
      })
    );

    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = createClient();
    const state = await client.testConnection();

    expect(state.connected).toBe(false);
  });

  it('throws a friendly error when callTool is called while in VsCodeStdio state', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({
        servers: { kicad: { command: 'kicad-mcp-pro', args: [] } }
      })
    );
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = createClient();
    await client.testConnection(); // puts client into VsCodeStdio state

    await expect(client.callTool('some_tool', {})).rejects.toThrow(
      'kicad-mcp-pro is connected via VS Code stdio'
    );
  });
});
