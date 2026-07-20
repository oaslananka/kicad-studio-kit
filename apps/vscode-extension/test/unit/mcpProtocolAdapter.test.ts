import {
  McpProtocolVersionMismatchError,
  type McpDiscoveryResult
} from '../../src/mcp/protocol/protocolAdapter';
import {
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
  UnsupportedMcpProtocolVersionError,
  resolveMcpProtocolAdapter
} from '../../src/mcp/protocol/protocolAdapterRegistry';
import draftProtocol from '../fixtures/mcp-protocol/2026-07-28-draft.json';

describe('MCP protocol adapter boundary (#492)', () => {
  it('selects the current production adapter explicitly (#492)', () => {
    const adapter = resolveMcpProtocolAdapter('2025-11-25');

    expect(adapter.version).toBe('2025-11-25');
    expect(adapter.lifecycle).toBe('initialize-session');
    expect(SUPPORTED_MCP_PROTOCOL_VERSIONS).toEqual(['2025-11-25']);
  });

  it('rejects unsupported or draft protocol versions with structured diagnostics (#492)', () => {
    expect.assertions(6);

    try {
      resolveMcpProtocolAdapter('2026-07-28');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedMcpProtocolVersionError);
      expect(error).toMatchObject({
        code: 'MCP_PROTOCOL_VERSION_UNSUPPORTED',
        requestedVersion: '2026-07-28',
        supportedVersions: ['2025-11-25']
      });
      expect((error as UnsupportedMcpProtocolVersionError).hint).toContain(
        'compatibility metadata'
      );
      expect((error as Error).message).toContain('2026-07-28');
      expect((error as Error).message).toContain('2025-11-25');
      expect((error as Error).name).toBe('UnsupportedMcpProtocolVersionError');
    }
  });

  it('builds the exact 2025 initialize discovery request (#492)', () => {
    const adapter = resolveMcpProtocolAdapter('2025-11-25');

    expect(
      adapter.createDiscoveryRequest({
        name: 'kicad-studio',
        version: '9.9.9'
      })
    ).toEqual({
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        clientInfo: {
          name: 'kicad-studio',
          version: '9.9.9'
        },
        capabilities: {}
      }
    });
  });

  it('owns 2025 protocol and session request headers (#492)', () => {
    const adapter = resolveMcpProtocolAdapter('2025-11-25');

    expect(adapter.createRequestHeaders({ method: 'initialize' })).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25'
    });
    expect(
      adapter.createRequestHeaders({
        method: 'tools/list',
        sessionId: 'session-123'
      })
    ).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
      'MCP-Session-Id': 'session-123'
    });
  });

  it('extracts 2025 session metadata without teaching the transport about sessions (#492)', () => {
    const adapter = resolveMcpProtocolAdapter('2025-11-25');

    expect(
      adapter.readResponseMetadata(
        new Headers({ 'MCP-Session-Id': 'response-session' })
      )
    ).toEqual({ sessionId: 'response-session' });
    expect(adapter.readResponseMetadata(new Headers())).toEqual({});
  });

  it('reuses discovery only when 2025 session and server state are both present (#492)', () => {
    const adapter = resolveMcpProtocolAdapter('2025-11-25');

    expect(
      adapter.canReuseDiscovery({
        force: false,
        sessionId: 'session-123',
        hasServerCard: true
      })
    ).toBe(true);
    expect(
      adapter.canReuseDiscovery({
        force: true,
        sessionId: 'session-123',
        hasServerCard: true
      })
    ).toBe(false);
    expect(
      adapter.canReuseDiscovery({
        force: false,
        hasServerCard: true
      })
    ).toBe(false);
    expect(
      adapter.canReuseDiscovery({
        force: false,
        sessionId: 'session-123',
        hasServerCard: false
      })
    ).toBe(false);
  });

  it('accepts an omitted negotiated version but rejects an explicit mismatch (#492)', () => {
    const adapter = resolveMcpProtocolAdapter('2025-11-25');
    const legacyResult: McpDiscoveryResult = {
      serverInfo: { name: 'kicad-mcp-pro', version: '3.9.2' },
      capabilities: {}
    };

    expect(() => adapter.validateDiscoveryResult(legacyResult)).not.toThrow();
    expect(() =>
      adapter.validateDiscoveryResult({
        ...legacyResult,
        protocolVersion: '2026-07-28'
      })
    ).toThrow(McpProtocolVersionMismatchError);

    try {
      adapter.validateDiscoveryResult({
        ...legacyResult,
        protocolVersion: '2026-07-28'
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'MCP_PROTOCOL_VERSION_MISMATCH',
        expectedVersion: '2025-11-25',
        receivedVersion: '2026-07-28',
        hint: expect.stringContaining('matching protocol adapter')
      });
    }
  });

  it('keeps the 2026 RC envelope draft, stateless, and non-selectable (#492)', () => {
    expect(draftProtocol).toMatchObject({
      issue: 492,
      status: 'draft',
      selectable: false,
      protocolVersion: '2026-07-28',
      lifecycle: {
        discoveryMethod: 'server/discover',
        stateless: true,
        sessionHeader: null
      }
    });
    expect(() =>
      resolveMcpProtocolAdapter(draftProtocol.protocolVersion)
    ).toThrow(UnsupportedMcpProtocolVersionError);
  });
});
