import type {
  McpDiscoveryResult,
  McpProtocolAdapter,
  McpProtocolRequestContext,
  McpProtocolResponseMetadata
} from '../../src/mcp/protocol/protocolAdapter';
import {
  McpProtocolLifecycle,
  type McpProtocolRuntime,
  type McpProtocolSessionStore
} from '../../src/mcp/protocol/protocolLifecycle';
import type {
  HttpJsonRpcRequest,
  HttpJsonRpcResult,
  McpRpcTransport
} from '../../src/mcp/transport/httpJsonRpcTransport';
import { VscodeProtocolSessionStore } from '../../src/mcp/adapters/vscodeProtocolSessionStore';

class MemorySessionStore implements McpProtocolSessionStore {
  readonly writes: Array<string | undefined> = [];

  constructor(private value: string | undefined) {}

  read(): string | undefined {
    return this.value;
  }

  async write(value: string | undefined): Promise<void> {
    this.value = value;
    this.writes.push(value);
  }
}

function runtime(): McpProtocolRuntime {
  return {
    baseEndpoint: 'http://127.0.0.1:27185',
    allowLegacySse: false,
    timeoutMs: 15_000,
    hasDiscoveryState: false
  };
}

function createAdapter(
  lifecycle: McpProtocolAdapter['lifecycle'] = 'initialize-session'
): McpProtocolAdapter & {
  requestContexts: McpProtocolRequestContext[];
} {
  const requestContexts: McpProtocolRequestContext[] = [];
  return {
    version: lifecycle === 'initialize-session' ? '2025-11-25' : 'draft',
    lifecycle,
    requestContexts,
    createDiscoveryRequest: () => ({ method: 'initialize', params: {} }),
    createRequestHeaders: (context) => {
      requestContexts.push({ ...context });
      return {
        'MCP-Protocol-Version':
          lifecycle === 'initialize-session' ? '2025-11-25' : 'draft',
        ...(context.sessionId ? { 'MCP-Session-Id': context.sessionId } : {})
      };
    },
    readResponseMetadata: (headers): McpProtocolResponseMetadata => {
      const sessionId = headers.get('MCP-Session-Id') ?? undefined;
      return sessionId ? { sessionId } : {};
    },
    canReuseDiscovery: ({ force, sessionId, hasServerCard }) =>
      !force && Boolean(sessionId) && hasServerCard,
    validateDiscoveryResult: () => undefined
  };
}

function createTransport(
  results: Array<HttpJsonRpcResult<unknown>>
): McpRpcTransport & { requests: HttpJsonRpcRequest[] } {
  const requests: HttpJsonRpcRequest[] = [];
  return {
    requests,
    async execute<T>(request: HttpJsonRpcRequest) {
      requests.push({ ...request, headers: { ...request.headers } });
      const result = results.shift();
      if (!result) {
        throw new Error('No fixture response available.');
      }
      return result as HttpJsonRpcResult<T>;
    }
  };
}

function result<T>(
  value: T,
  headers: Record<string, string> = {}
): HttpJsonRpcResult<T> {
  return {
    json: { result: value },
    headers: new Headers(headers)
  };
}

describe('MCP protocol lifecycle boundary (#492)', () => {
  it('coalesces concurrent discovery and allocates deterministic request IDs (#492)', async () => {
    let releaseDiscovery: (() => void) | undefined;
    const discoveryResult = new Promise<HttpJsonRpcResult<unknown>>(
      (resolve) => {
        releaseDiscovery = () =>
          resolve(
            result<McpDiscoveryResult>({
              protocolVersion: '2025-11-25',
              serverInfo: { version: '3.5.2' }
            })
          );
      }
    );
    const transport = createTransport([]);
    transport.execute = jest
      .fn()
      .mockImplementationOnce(async (request: HttpJsonRpcRequest) => {
        transport.requests.push({
          ...request,
          headers: { ...request.headers }
        });
        return discoveryResult;
      })
      .mockImplementationOnce(async (request: HttpJsonRpcRequest) => {
        transport.requests.push({
          ...request,
          headers: { ...request.headers }
        });
        return result({ tools: [] });
      });
    const onDiscovery = jest.fn(async () => undefined);
    const lifecycle = new McpProtocolLifecycle({
      adapter: createAdapter(),
      transport,
      clientInfo: { name: 'kicad-studio', version: '1.9.7' },
      sessionStore: new MemorySessionStore(undefined)
    });

    const first = lifecycle.ensureReady(runtime(), { onDiscovery });
    const second = lifecycle.ensureReady(runtime(), { onDiscovery });
    await Promise.resolve();

    expect(transport.execute).toHaveBeenCalledTimes(1);
    releaseDiscovery?.();
    await Promise.all([first, second]);
    await lifecycle.execute('tools/list', {}, runtime());

    expect(onDiscovery).toHaveBeenCalledTimes(1);
    expect(transport.requests.map((request) => request.id)).toEqual([1, 2]);
  });

  it('reuses persisted 2025 discovery state without transport work (#492)', async () => {
    const transport = createTransport([]);
    const onDiscovery = jest.fn(async () => undefined);
    const lifecycle = new McpProtocolLifecycle({
      adapter: createAdapter(),
      transport,
      clientInfo: { name: 'kicad-studio', version: '1.9.7' },
      sessionStore: new MemorySessionStore('persisted-session')
    });

    await lifecycle.ensureReady(
      { ...runtime(), hasDiscoveryState: true },
      { onDiscovery }
    );

    expect(transport.requests).toEqual([]);
    expect(onDiscovery).not.toHaveBeenCalled();
  });

  it('maps discovery JSON-RPC failures without a client callback (#492)', async () => {
    const transport = createTransport([
      {
        json: { error: {} },
        headers: new Headers()
      }
    ]);
    const lifecycle = new McpProtocolLifecycle({
      adapter: createAdapter(),
      transport,
      clientInfo: { name: 'kicad-studio', version: '1.9.7' },
      sessionStore: new MemorySessionStore(undefined)
    });

    await expect(
      lifecycle.ensureReady(runtime(), {
        onDiscovery: async () => undefined
      })
    ).rejects.toThrow('Unknown MCP error');
  });

  it('persists 2025 response sessions and reuses them on later requests (#492)', async () => {
    const store = new MemorySessionStore(undefined);
    const adapter = createAdapter();
    const transport = createTransport([
      result<McpDiscoveryResult>(
        { protocolVersion: '2025-11-25' },
        { 'MCP-Session-Id': 'session-123' }
      ),
      result({ tools: [] })
    ]);
    const lifecycle = new McpProtocolLifecycle({
      adapter,
      transport,
      clientInfo: { name: 'kicad-studio', version: '1.9.7' },
      sessionStore: store
    });

    await lifecycle.ensureReady(runtime(), {
      onDiscovery: async () => undefined
    });
    await lifecycle.execute('tools/list', {}, runtime());

    expect(store.writes).toEqual(['session-123']);
    expect(adapter.requestContexts).toEqual([
      { method: 'initialize' },
      { method: 'tools/list', sessionId: 'session-123' }
    ]);
  });

  it('clears persisted 2025 session state explicitly (#492)', async () => {
    const store = new MemorySessionStore('persisted-session');
    const adapter = createAdapter();
    const lifecycle = new McpProtocolLifecycle({
      adapter,
      transport: createTransport([result({ tools: [] })]),
      clientInfo: { name: 'kicad-studio', version: '1.9.7' },
      sessionStore: store
    });

    await lifecycle.clearSession();
    await lifecycle.execute('tools/list', {}, runtime());

    expect(store.writes).toEqual([undefined]);
    expect(adapter.requestContexts).toEqual([{ method: 'tools/list' }]);
  });

  it('does not expose legacy sessions to a stateless adapter (#492)', async () => {
    const store = new MemorySessionStore('legacy-session');
    const adapter = createAdapter('stateless-discovery');
    const lifecycle = new McpProtocolLifecycle({
      adapter,
      transport: createTransport([
        result<McpDiscoveryResult>(
          { protocolVersion: 'draft' },
          { 'MCP-Session-Id': 'ignored-session' }
        ),
        result({ tools: [] })
      ]),
      clientInfo: { name: 'kicad-studio', version: '1.9.7' },
      sessionStore: store
    });

    await lifecycle.ensureReady(runtime(), {
      onDiscovery: async () => undefined
    });
    await lifecycle.execute('tools/list', {}, runtime());
    await lifecycle.clearSession();

    expect(adapter.requestContexts).toEqual([
      { method: 'initialize' },
      { method: 'tools/list' }
    ]);
    expect(store.writes).toEqual([]);
  });

  it('adapts VS Code Memento storage behind a narrow session store (#492)', async () => {
    const values = new Map<string, unknown>([
      ['kicadstudio.mcp.sessionId', 'stored-session']
    ]);
    const memento = {
      get: jest.fn(<T>(key: string) => values.get(key) as T),
      update: jest.fn(async (key: string, value: unknown) => {
        if (value === undefined) {
          values.delete(key);
        } else {
          values.set(key, value);
        }
      })
    };
    const store = new VscodeProtocolSessionStore(memento);

    expect(store.read()).toBe('stored-session');
    await store.write('next-session');
    expect(store.read()).toBe('next-session');
    await store.write(undefined);
    expect(store.read()).toBeUndefined();
  });
});
