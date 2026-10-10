import {
  Mcp2026ProtocolAdapter,
  Mcp2026UnsupportedResultError
} from '../../src/mcp/protocol/mcp2026ProtocolAdapter';
import { McpProtocolVersionMismatchError } from '../../src/mcp/protocol/protocolAdapter';
import {
  UnsupportedMcpProtocolVersionError,
  resolveMcpProtocolAdapter
} from '../../src/mcp/protocol/protocolAdapterRegistry';
import { McpProtocolLifecycle } from '../../src/mcp/protocol/protocolLifecycle';

const clientInfo = { name: 'kicad-studio', version: '1.15.4' };

describe('staged MCP 2026-07-28 stateless adapter (#492)', () => {
  const adapter = new Mcp2026ProtocolAdapter();

  it('is not production-selectable until the activation contract is verified', () => {
    expect(adapter.lifecycle).toBe('stateless-discovery');
    expect(() => resolveMcpProtocolAdapter(adapter.version)).toThrow(
      UnsupportedMcpProtocolVersionError
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
      adapter.validateDiscoveryResult({ protocolVersion: '2026-07-28' })
    ).not.toThrow();
    expect(() =>
      adapter.validateDiscoveryResult({ protocolVersion: '2025-11-25' })
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
                resultType: 'complete',
                protocolVersion: '2026-07-28'
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
