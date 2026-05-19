import { McpClient } from '../../src/mcp/mcpClient';
import { __setConfiguration, createExtensionContextMock } from './vscodeMock';

function createJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': 'application/json',
      'MCP-Session-Id': 'session-version'
    }),
    json: async () => body
  };
}

function initializeResult(version: string | undefined) {
  return {
    result: {
      ...(version ? { serverInfo: { version } } : {}),
      capabilities: {
        tools: [{ name: 'project_quality_gate_report' }],
        resources: [{ name: 'kicad://project/fix_queue' }],
        prompts: [{ name: 'manufacturing_release_checklist' }]
      }
    }
  };
}

function wellKnownResult(version: string) {
  return {
    serverInfo: {
      name: 'kicad-mcp-pro',
      version
    }
  };
}

describe('McpClient version gate', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({
      'kicadstudio.mcp.endpoint': 'http://127.0.0.1:27185',
      'kicadstudio.mcp.pushContext': true,
      'kicadstudio.mcp.allowLegacySse': false
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function createClient() {
    return new McpClient(
      createExtensionContextMock() as never,
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
      } as never
    );
  }

  it.each([
    ['1.0.0', 'ok'],
    ['1.1.0', 'ok'],
    ['1.9.9', 'ok']
  ])(
    'connects to supported server version %s as %s',
    async (version, compat) => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(createJsonResponse(initializeResult(version)))
        .mockResolvedValueOnce(
          createJsonResponse({ result: { tools: [] } })
        ) as typeof fetch;

      const state = await createClient().testConnection();

      expect(state.kind).toBe('Connected');
      expect(state.connected).toBe(true);
      expect(state.server?.version).toBe(version);
      expect(state.server?.compat).toBe(compat);
      expect(state.server?.capabilities.tools).toEqual([
        'project_quality_gate_report'
      ]);
    }
  );

  it.each(['0.9.9', '2.0.0', undefined])(
    'marks unsupported or missing version %s as incompatible',
    async (version) => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(createJsonResponse(initializeResult(version)));
      global.fetch = fetchMock as typeof fetch;

      const state = await createClient().testConnection();

      expect(state.kind).toBe('Incompatible');
      expect(state.connected).toBe(false);
      expect(state.server?.compat).toBe('incompatible');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    }
  );

  it('uses the HTTP server card version when initialize reports an SDK version', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(initializeResult('1.27.0')))
      .mockResolvedValueOnce(createJsonResponse(wellKnownResult('1.0.0')))
      .mockResolvedValueOnce(
        createJsonResponse({ result: { tools: [] } })
      ) as typeof fetch;

    const state = await createClient().testConnection();

    expect(state.kind).toBe('Connected');
    expect(state.server?.version).toBe('1.0.0');
    expect(state.server?.compat).toBe('ok');
  });

  it('blocks tool calls after an incompatible initialize response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(initializeResult('2.0.0'))
      ) as typeof fetch;

    await expect(createClient().callTool('project_ping', {})).rejects.toThrow(
      'incompatible'
    );
  });

  it('normalizes structured quality gate reports and text gate responses', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(initializeResult('1.0.0')))
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            structuredContent: {
              outcomes: [
                {
                  name: 'Schematic',
                  status: 'PASS',
                  summary: 'ERC clean',
                  details: ['WARN: advisory']
                },
                {
                  name: 'PCB transfer',
                  status: 'FAIL',
                  summary: 'nets unmapped',
                  details: ['FAIL: U1.1 missing']
                }
              ]
            }
          }
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            content: [
              {
                text: 'PCB transfer quality gate: BLOCKED\n- no named nets'
              }
            ]
          }
        })
      ) as typeof fetch;

    const client = createClient();

    await expect(client.runProjectQualityGate()).resolves.toEqual([
      expect.objectContaining({ id: 'schematic', status: 'WARN' }),
      expect.objectContaining({ id: 'pcb-transfer', status: 'FAIL' })
    ]);
    await expect(client.runTransferQualityGate()).resolves.toEqual(
      expect.objectContaining({ status: 'BLOCKED' })
    );
  });

  it('throws structured MCP tool errors', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(initializeResult('1.0.0')))
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            structuredContent: {
              error_code: 'VALIDATION_FAILED',
              message: 'Gate failed',
              hint: 'Read fix queue'
            }
          }
        })
      ) as typeof fetch;

    await expect(
      createClient().callTool('export_manufacturing_package', {})
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      hint: 'Read fix queue'
    });
  });
});
