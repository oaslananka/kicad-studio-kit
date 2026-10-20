import {
  Mcp2026InvalidDiscoveryError,
  Mcp2026ProtocolAdapter,
  Mcp2026UnsupportedResultError
} from '../../src/mcp/protocol/mcp2026ProtocolAdapter';
import { McpProtocolVersionMismatchError } from '../../src/mcp/protocol/protocolAdapter';
import { resolveMcpProtocolAdapter } from '../../src/mcp/protocol/protocolAdapterRegistry';
import { McpProtocolLifecycle } from '../../src/mcp/protocol/protocolLifecycle';
import { Mcp2025ProtocolAdapter } from '../../src/mcp/protocol/mcp2025ProtocolAdapter';
import { HttpJsonRpcTransport } from '../../src/mcp/transport/httpJsonRpcTransport';

const clientInfo = { name: 'kicad-studio', version: '1.15.4' };
const modernDiscovery = {
  resultType: 'complete',
  supportedVersions: ['2026-07-28', '2025-11-25'],
  capabilities: { tools: {} },
  ttlMs: 3600000,
  cacheScope: 'private' as const,
  _meta: {
    'io.modelcontextprotocol/serverInfo': {
      name: 'untrusted-server-name',
      version: '999.999.999'
    }
  }
};

describe('staged MCP 2026-07-28 stateless adapter (#492)', () => {
  const adapter = new Mcp2026ProtocolAdapter();

  it('is not production-selectable until the activation contract is verified', () => {
    expect(adapter.lifecycle).toBe('stateless-discovery');
    expect(resolveMcpProtocolAdapter(adapter.version).lifecycle).toBe(
      'stateless-discovery'
    );
    expect(adapter.createDiscoveryRequest(clientInfo)).toEqual({
      method: 'server/discover',
      params: {}
    });
  });

  it('envelopes every request, preserves unrelated _meta and overwrites forged reserved fields', () => {
    const params = {
      name: 'pcb_get_board_summary',
      arguments: {},
      _meta: {
        custom: 'allowed',
        'io.modelcontextprotocol/protocolVersion': 'forged',
        'io.modelcontextprotocol/clientCapabilities': { admin: true }
      }
    };
    const prepared = adapter.prepareRequestParams(params, clientInfo);
    expect(prepared).toEqual({
      ...params,
      _meta: {
        custom: 'allowed',
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': clientInfo,
        'io.modelcontextprotocol/clientCapabilities': {}
      }
    });
    expect(params._meta['io.modelcontextprotocol/protocolVersion']).toBe(
      'forged'
    );
    expect(() =>
      adapter.prepareRequestParams({ _meta: 'bad' }, clientInfo)
    ).toThrow('MCP request _meta must be an object.');
  });

  it('routes tool/resource requests by method and principal name without sessions', () => {
    expect(
      adapter.createRequestHeaders({
        method: 'tools/call',
        params: { name: 'pcb_get_board_summary' },
        sessionId: 'old-session'
      })
    ).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'pcb_get_board_summary'
    });
    expect(
      adapter.createRequestHeaders({
        method: 'resources/read',
        params: { uri: 'file:///example.kicad_pcb' }
      })['Mcp-Name']
    ).toBe('file:///example.kicad_pcb');
    expect(
      adapter.createRequestHeaders({
        method: 'resources/read',
        params: { uri: 'kicad://proje/şema' }
      })['Mcp-Name']
    ).toBe(
      `=?base64?${Buffer.from('kicad://proje/şema', 'utf8').toString('base64')}?=`
    );
    expect(
      adapter.createRequestHeaders({ method: 'server/discover' })['Mcp-Name']
    ).toBeUndefined();
    expect(() =>
      adapter.createRequestHeaders({
        method: 'tools/call',
        params: { name: '\r\nSecret: 1' }
      })
    ).toThrow();
    expect(() =>
      adapter.createRequestHeaders({ method: 'prompts/get', params: {} })
    ).toThrow();
  });

  it('never consumes 2025 session state or caches a previous-era server card', () => {
    expect(
      adapter.readResponseMetadata(new Headers({ 'Mcp-Session-Id': 'legacy' }))
    ).toEqual({});
    expect(
      adapter.canReuseDiscovery({
        force: false,
        sessionId: 'legacy',
        hasServerCard: true
      })
    ).toBe(false);
  });

  it('requires a matching discovery result and fails closed on input_required', () => {
    expect(() =>
      adapter.validateDiscoveryResult(modernDiscovery)
    ).not.toThrow();
    expect(() =>
      adapter.validateDiscoveryResult({ supportedVersions: ['2025-11-25'] })
    ).toThrow(McpProtocolVersionMismatchError);
    expect(() => adapter.validateDiscoveryResult(undefined)).toThrow(
      McpProtocolVersionMismatchError
    );
    expect(() =>
      adapter.validateResponseResult({ resultType: 'complete', tools: [] })
    ).not.toThrow();
    for (const result of [
      { resultType: 'input_required' },
      { tools: [] },
      { resultType: 'future' },
      null
    ]) {
      expect(() => adapter.validateResponseResult(result)).toThrow(
        Mcp2026UnsupportedResultError
      );
    }
  });

  it('rejects malformed mandatory discovery fields without trusting advertised identity', () => {
    expect(() =>
      adapter.validateDiscoveryResult(modernDiscovery)
    ).not.toThrow();
    expect(() =>
      adapter.validateDiscoveryResult({ ...modernDiscovery, ttlMs: 0 })
    ).not.toThrow();
    expect(() =>
      adapter.validateDiscoveryResult({
        ...modernDiscovery,
        cacheScope: 'public'
      })
    ).not.toThrow();

    const malformed = [
      { ...modernDiscovery, capabilities: undefined },
      { ...modernDiscovery, capabilities: [] },
      { ...modernDiscovery, ttlMs: undefined },
      { ...modernDiscovery, ttlMs: -1 },
      { ...modernDiscovery, ttlMs: 0.5 },
      { ...modernDiscovery, ttlMs: Number.MAX_SAFE_INTEGER + 1 },
      { ...modernDiscovery, cacheScope: undefined },
      { ...modernDiscovery, cacheScope: 'shared' },
      { ...modernDiscovery, supportedVersions: ['2026-07-28', 5] },
      { ...modernDiscovery, _meta: [] },
      {
        ...modernDiscovery,
        _meta: { 'io.modelcontextprotocol/serverInfo': { name: 123 } }
      }
    ];
    for (const result of malformed) {
      expect(() =>
        adapter.validateDiscoveryResult(
          result as Parameters<typeof adapter.validateDiscoveryResult>[0]
        )
      ).toThrow(Mcp2026InvalidDiscoveryError);
    }
    // Even a plausible serverInfo version cannot bypass the production gate.
    expect(resolveMcpProtocolAdapter(adapter.version).lifecycle).toBe(
      'stateless-discovery'
    );
  });

  it('never reports a malformed discovery as ready or forwards server metadata', async () => {
    const onDiscovery = jest.fn();
    const write = jest.fn();
    const lifecycle = new McpProtocolLifecycle({
      adapter,
      clientInfo,
      sessionStore: { read: () => 'legacy-secret-session', write },
      transport: {
        execute: async <T>() => ({
          json: {
            result: {
              ...modernDiscovery,
              cacheScope: 'invalid'
            } as T
          },
          headers: new Headers({ 'Mcp-Session-Id': 'forged-session' })
        })
      }
    });
    await expect(
      lifecycle.ensureReady(
        {
          baseEndpoint: 'http://127.0.0.1:3334',
          allowLegacySse: false,
          timeoutMs: 1000,
          hasDiscoveryState: false
        },
        { onDiscovery }
      )
    ).rejects.toThrow(Mcp2026InvalidDiscoveryError);
    expect(onDiscovery).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('never enables the legacy /sse fallback for 2026, even with the old preference enabled', async () => {
    const fetchFn = jest.fn(
      async (_input: RequestInfo | URL) => new Response(null, { status: 404 })
    );
    const lifecycle = new McpProtocolLifecycle({
      adapter,
      clientInfo,
      sessionStore: {
        read: () => '2025-legacy-session',
        write: jest.fn(async () => undefined)
      },
      transport: new HttpJsonRpcTransport({
        fetchFn,
        logger: { debug: jest.fn(), warn: jest.fn() },
        maxRetries: 1
      })
    });

    await expect(
      lifecycle.ensureReady(
        {
          baseEndpoint: 'http://127.0.0.1:3334',
          allowLegacySse: true,
          timeoutMs: 1000,
          hasDiscoveryState: false
        },
        { onDiscovery: jest.fn() }
      )
    ).rejects.toThrow('does not expose Streamable HTTP');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0]?.[0])).toMatch(/\/mcp$/u);
  });

  it('preserves explicitly enabled 2025 /sse fallback after blocking the modern path', async () => {
    const requests: string[] = [];
    const fetchFn = jest.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input));
      if (String(input).endsWith('/mcp')) {
        return new Response(null, { status: 404 });
      }
      return new Response(
        'data: {"result":{"protocolVersion":"2025-11-25"}}\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } }
      );
    });
    const onDiscovery = jest.fn();
    const lifecycle = new McpProtocolLifecycle({
      adapter: new Mcp2025ProtocolAdapter(),
      clientInfo,
      sessionStore: {
        read: () => undefined,
        write: jest.fn(async () => undefined)
      },
      transport: new HttpJsonRpcTransport({
        fetchFn,
        logger: { debug: jest.fn(), warn: jest.fn() },
        maxRetries: 1
      })
    });

    await expect(
      lifecycle.ensureReady(
        {
          baseEndpoint: 'http://127.0.0.1:3334',
          allowLegacySse: true,
          timeoutMs: 1000,
          hasDiscoveryState: false
        },
        { onDiscovery }
      )
    ).resolves.toBeUndefined();
    expect(requests).toEqual([
      'http://127.0.0.1:3334/mcp',
      'http://127.0.0.1:3334/sse'
    ]);
    expect(onDiscovery).toHaveBeenCalledWith({
      protocolVersion: '2025-11-25'
    });
  });

  it('isolates 2026 negative MRTR and 2025 session fallback in one client process', async () => {
    let savedSession: string | undefined = 'persisted-2025-session';
    const writes: Array<string | undefined> = [];
    const requests: Array<{
      method: string;
      version: string | null;
      session: string | null;
      meta: unknown;
    }> = [];
    const store = {
      read: () => savedSession,
      write: async (session: string | undefined) => {
        savedSession = session;
        writes.push(session);
      }
    };
    const fetchFn = jest.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          method: string;
          params: Record<string, unknown>;
        };
        const headers = new Headers(init?.headers);
        const version = headers.get('MCP-Protocol-Version');
        requests.push({
          method: request.method,
          version,
          session: headers.get('MCP-Session-Id'),
          meta: request.params['_meta']
        });
        const reply = (
          body: unknown,
          extraHeaders: Record<string, string> = {}
        ) =>
          new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json', ...extraHeaders }
          });
        if (version === '2026-07-28') {
          if (request.method === 'server/discover') {
            return reply(
              { result: modernDiscovery },
              { 'Mcp-Session-Id': 'malicious-modern-session' }
            );
          }
          return reply({
            result: {
              resultType: 'input_required',
              inputRequests: { confirm: { type: 'elicitation' } }
            }
          });
        }
        if (request.method === 'initialize') {
          return reply(
            { result: { protocolVersion: '2025-11-25' } },
            { 'Mcp-Session-Id': 'negotiated-2025-session' }
          );
        }
        return reply({ result: { tools: [] } });
      }
    );
    const transport = new HttpJsonRpcTransport({
      fetchFn,
      logger: { debug: jest.fn(), warn: jest.fn() },
      maxRetries: 1
    });
    const runtime = {
      baseEndpoint: 'http://127.0.0.1:3334',
      allowLegacySse: true,
      timeoutMs: 1000,
      hasDiscoveryState: false
    };
    const modern = new McpProtocolLifecycle({
      adapter,
      transport,
      clientInfo,
      sessionStore: store
    });
    await modern.ensureReady(runtime, { onDiscovery: jest.fn() });
    await expect(
      modern.execute('tools/call', { name: 'kicad_get_version' }, runtime)
    ).rejects.toBeInstanceOf(Mcp2026UnsupportedResultError);
    expect(savedSession).toBe('persisted-2025-session');
    expect(writes).toEqual([]);

    // Explicit fallback to the production 2025 adapter must still negotiate
    // and persist its own session, not reuse 2026 metadata or body fields.
    const legacy = new McpProtocolLifecycle({
      adapter: new Mcp2025ProtocolAdapter(),
      transport,
      clientInfo,
      sessionStore: store
    });
    await legacy.ensureReady(runtime, { onDiscovery: jest.fn() });
    await legacy.execute('tools/list', {}, runtime);
    expect(savedSession).toBe('negotiated-2025-session');
    expect(writes).toEqual(['negotiated-2025-session']);

    // A subsequent stateless call must neither send nor erase the 2025 session.
    await modern.ensureReady(runtime, { onDiscovery: jest.fn() });
    expect(savedSession).toBe('negotiated-2025-session');
    expect(requests.map((request) => request.method)).toEqual([
      'server/discover',
      'tools/call',
      'initialize',
      'tools/list',
      'server/discover'
    ]);
    for (const request of requests.filter((r) => r.version === '2026-07-28')) {
      expect(request.session).toBeNull();
      expect(request.meta).toMatchObject({
        'io.modelcontextprotocol/protocolVersion': '2026-07-28'
      });
    }
    const oldRequests = requests.filter((r) => r.version === '2025-11-25');
    expect(oldRequests[0]?.session).toBe('persisted-2025-session');
    expect(oldRequests[1]?.session).toBe('negotiated-2025-session');
    expect(oldRequests.every((r) => r.meta === undefined)).toBe(true);
    expect(resolveMcpProtocolAdapter('2026-07-28').lifecycle).toBe(
      'stateless-discovery'
    );
  });

  it('uses stateless lifecycle wire requests without changing the legacy adapter', async () => {
    const sent: Array<{
      method: string;
      params: Record<string, unknown>;
      headers: Record<string, string>;
    }> = [];
    const write = jest.fn(async () => undefined);
    const lifecycle = new McpProtocolLifecycle({
      adapter,
      clientInfo,
      sessionStore: { read: () => 'legacy-session', write },
      transport: {
        execute: async <T>(request: {
          method: string;
          params: Record<string, unknown>;
          headers: Record<string, string>;
        }) => {
          sent.push(request);
          return {
            json: {
              result: {
                ...modernDiscovery
              } as T
            },
            headers: new Headers({ 'Mcp-Session-Id': 'ignored' })
          };
        }
      }
    });
    const runtime = {
      baseEndpoint: 'http://127.0.0.1:3334',
      allowLegacySse: false,
      timeoutMs: 1000,
      hasDiscoveryState: false
    };
    await lifecycle.ensureReady(runtime, { onDiscovery: () => undefined });
    await lifecycle.execute(
      'tools/call',
      { name: 'pcb_get_board_summary', arguments: {} },
      runtime
    );
    expect(sent.map((request) => request.method)).toEqual([
      'server/discover',
      'tools/call'
    ]);
    expect(sent[0]?.params['_meta']).toMatchObject({
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': clientInfo
    });
    expect(sent[1]?.headers['Mcp-Name']).toBe('pcb_get_board_summary');
    expect(sent[1]?.headers['Mcp-Session-Id']).toBeUndefined();
    expect(write).not.toHaveBeenCalled();
  });
});
