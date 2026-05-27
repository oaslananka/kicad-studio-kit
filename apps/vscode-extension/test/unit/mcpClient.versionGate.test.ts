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

function initializeResult(version: string | undefined, name?: string) {
  return {
    result: {
      ...(version
        ? { serverInfo: { ...(name ? { name } : {}), version } }
        : {}),
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

function wellKnownServerInfoResult() {
  return {
    serverInfo: {
      name: 'kicad-mcp-pro',
      version: '3.5.2'
    },
    serverInfoContract: {
      schemaVersion: '1.2.0',
      server: 'kicad-mcp-pro',
      version: '3.5.2',
      mcpProtocolVersion: '2025-11-25',
      toolSchemaVersion: '1.0.0',
      compatibilityRange: {
        kicadStudio: {
          required: '>=3.5.2 <4.0.0',
          recommended: '>=3.5.2 <4.0.0',
          testedAgainst: '3.5.2'
        },
        kicadMcpPro: {
          required: '>=1.0.0 <2.0.0',
          testedAgainst: '1.0.0'
        }
      },
      transport: {
        type: 'streamable-http',
        streamableHttp: true,
        statelessHttp: true,
        legacySse: false,
        authRequired: false,
        endpoint: 'http://127.0.0.1:27185/mcp'
      },
      kicad: {
        cliFound: true,
        cliPath: '/usr/bin/kicad-cli',
        cliVersion: 'KiCad 10.0.3',
        ipcAvailable: false,
        ipcVersion: null,
        ipcApiVersion: null,
        ipcMajorVersion: null,
        ipcEndpointSource: 'default',
        livePcbContext: false,
        liveSchematicContext: false
      },
      operatingMode: {
        active: 'readonly',
        default: 'readonly',
        available: ['readonly', 'write', 'manufacturing', 'experimental'],
        experimentalEnabled: false,
        toolAvailability: {
          kicad_get_version: {
            available: true,
            requiredMode: 'readonly',
            reason: null
          },
          pcb_add_track: {
            available: false,
            requiredMode: 'write',
            reason: 'Requires write operating mode.'
          }
        }
      },
      capabilities: {
        fileBackedDrc: true,
        fileBackedErc: true,
        fileBackedExports: true,
        livePcbRead: false,
        livePcbWrite: false,
        liveSchematicRead: false,
        liveSchematicWrite: false,
        liveEditingTools: {
          pcb_place_component: {
            available: false,
            backend: 'kicad-ipc',
            reason: 'KiCad IPC is unavailable.',
            minimumKiCadMajor: 9
          },
          pcb_route_trace: {
            available: false,
            backend: 'kicad-ipc',
            reason: 'KiCad IPC is unavailable.',
            minimumKiCadMajor: 9
          },
          pcb_add_zone: {
            available: false,
            backend: 'kicad-ipc',
            reason: 'KiCad IPC is unavailable.',
            minimumKiCadMajor: 9
          },
          pcb_set_design_rules: {
            available: false,
            backend: 'hybrid-file-ipc',
            reason: 'KiCad IPC is unavailable.',
            minimumKiCadMajor: 9
          },
          pcb_move_component: {
            available: false,
            backend: 'kicad-ipc',
            reason: 'KiCad IPC is unavailable.',
            minimumKiCadMajor: 9
          },
          pcb_delete_object: {
            available: false,
            backend: 'kicad-ipc',
            reason: 'KiCad IPC is unavailable.',
            minimumKiCadMajor: 9
          },
          sch_add_component: {
            available: false,
            backend: 'hybrid-file-ipc',
            reason: 'KiCad IPC is unavailable.',
            minimumKiCadMajor: 10
          },
          sch_add_wire: {
            available: false,
            backend: 'hybrid-file-ipc',
            reason: 'KiCad IPC is unavailable.',
            minimumKiCadMajor: 10
          },
          sch_modify_property: {
            available: false,
            backend: 'hybrid-file-ipc',
            reason: 'KiCad IPC is unavailable.',
            minimumKiCadMajor: 10
          }
        },
        chatgptConnectorCompatible: false,
        cliExports: {
          ipc2581: false,
          odb: false,
          svg: false,
          dxf: false,
          step: false,
          render: false,
          spiceNetlist: false
        }
      },
      diagnostics: ['Live KiCad PCB context is unavailable: No PCB is open.']
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
    ['3.5.2', 'ok'],
    ['3.6.0', 'ok'],
    ['3.9.9', 'ok']
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

  it.each(['3.5.1', '4.0.0', undefined])(
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
      .mockResolvedValueOnce(createJsonResponse(wellKnownResult('3.5.2')))
      .mockResolvedValueOnce(
        createJsonResponse({ result: { tools: [] } })
      ) as typeof fetch;

    const state = await createClient().testConnection();

    expect(state.kind).toBe('Connected');
    expect(state.server?.version).toBe('3.5.2');
    expect(state.server?.compat).toBe('ok');
  });

  it('captures degraded server-info diagnostics from the HTTP server card', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(initializeResult('1.27.0')))
      .mockResolvedValueOnce(createJsonResponse(wellKnownServerInfoResult()))
      .mockResolvedValueOnce(
        createJsonResponse({ result: { tools: [] } })
      ) as typeof fetch;

    const state = await createClient().testConnection();

    expect(state.kind).toBe('Connected');
    expect(state.connected).toBe(true);
    expect(state.server?.compat).toBe('warn');
    expect(state.message).toContain('Live KiCad PCB context is unavailable');
    expect(state.server?.capabilities.serverInfo?.kicad.livePcbContext).toBe(
      false
    );
    expect(
      state.server?.capabilities.serverInfo?.capabilities.livePcbRead
    ).toBe(false);
  });

  it('ignores malformed server-info contracts from the HTTP server card', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(initializeResult('1.27.0')))
      .mockResolvedValueOnce(
        createJsonResponse({
          ...wellKnownResult('3.5.2'),
          serverInfoContract: {
            schemaVersion: '1.2.0',
            server: 'other-server'
          }
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({ result: { tools: [] } })
      ) as typeof fetch;

    const state = await createClient().testConnection();

    expect(state.kind).toBe('Connected');
    expect(state.server?.compat).toBe('ok');
    expect(state.server?.capabilities.serverInfo).toBeUndefined();
  });

  it('marks MCP degraded when tools/list violates the discovery schema', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(initializeResult('3.5.2')))
      .mockResolvedValueOnce(
        createJsonResponse({ result: { resources: [] } })
      ) as typeof fetch;

    const state = await createClient().testConnection();

    expect(state.kind).toBe('Degraded');
    expect(state.connected).toBe(false);
    expect(state.message).toContain(
      'MCP tools/list response failed protocol schema validation'
    );
  });

  it('reads server-info diagnostics when initialize identifies kicad-mcp-pro', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(initializeResult('3.5.2', 'kicad-mcp-pro'))
      )
      .mockResolvedValueOnce(createJsonResponse(wellKnownServerInfoResult()))
      .mockResolvedValueOnce(
        createJsonResponse({ result: { tools: [] } })
      ) as typeof fetch;

    const state = await createClient().testConnection();

    expect(state.server?.compat).toBe('warn');
    expect(state.server?.capabilities.serverInfo?.schemaVersion).toBe('1.2.0');
  });

  it('blocks tool calls after an incompatible initialize response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(initializeResult('4.0.0'))
      ) as typeof fetch;

    await expect(createClient().callTool('project_ping', {})).rejects.toThrow(
      'incompatible'
    );
  });

  it('normalizes structured quality gate reports and text gate responses', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(initializeResult('3.5.2')))
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
      .mockResolvedValueOnce(createJsonResponse(initializeResult('3.5.2')))
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
