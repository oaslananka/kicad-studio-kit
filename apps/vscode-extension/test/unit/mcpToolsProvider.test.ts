import { McpToolsProvider } from '../../src/mcp/mcpToolsProvider';
import type {
  McpConnectionState,
  McpServerInfoContract
} from '../../src/types';
import { __setConfiguration } from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

type ProviderNode = ReturnType<McpToolsProvider['getChildren']>[number];

describe('McpToolsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({
      'kicadstudio.mcp.endpoint': 'http://127.0.0.1:27185',
      'kicadstudio.mcp.profile': 'full'
    });
  });

  it('renders a compatibility dashboard with required fields, actions, and raw capabilities', () => {
    const provider = providerForState(
      connectedState({
        tools: ['pcb_validate', 'sch_validate']
      })
    );

    const children = provider.getChildren();

    expect(children.map((item) => item.label)).toEqual([
      'MCP connected with degraded capabilities',
      'Compatibility dashboard',
      'Actions',
      'Install',
      'Raw advertised capabilities'
    ]);
    expect(treeDescription(provider, children, 'Compatibility dashboard')).toBe(
      'degraded'
    );

    const dashboard = child(children, 'Compatibility dashboard');
    expect(labels(provider.getChildren(dashboard))).toEqual([
      'Compatibility state',
      'Server contract',
      'KiCad runtime',
      'Advertised surface',
      'Health and remediation'
    ]);
    expect(
      labels(provider.getChildren(child(provider.getChildren(dashboard), 'Server contract')))
    ).toEqual([
      'Server',
      'Endpoint',
      'Transport mode',
      'Profile',
      'Operating mode',
      'Protocol version',
      'Tool schema version',
      'Compatibility'
    ]);

    const advertisedSurface = child(
      provider.getChildren(dashboard),
      'Advertised surface'
    );
    expect(
      treeDescription(
        provider,
        provider.getChildren(advertisedSurface),
        'Missing required tools'
      )
    ).toBe('6');
    expect(
      treeDescription(
        provider,
        provider.getChildren(advertisedSurface),
        'Missing optional capabilities'
      )
    ).toBe('none');

    expect(labels(provider.getChildren(child(children, 'Actions')))).toEqual([
      'Reconnect',
      'Refresh capabilities',
      'Open MCP log',
      'Save diagnostic bundle',
      'Pick profile',
      'Switch endpoint',
      'Launch local MCP server',
      'Open compatibility docs'
    ]);
    expect(treeDescription(provider, children, 'Raw advertised capabilities')).toBe(
      '2 tools, 1 resources, 1 prompts'
    );
  });

  it('does not report connected-only status when live PCB context is unavailable', () => {
    const provider = providerForState(
      connectedState({
        tools: [
          'kicad_get_version',
          'run_drc',
          'run_erc',
          'project_get_design_intent',
          'export_bom',
          'export_netlist'
        ],
        serverInfo: serverInfoFixture({
          kicad: {
            livePcbContext: false,
            liveSchematicContext: true,
            ipcAvailable: true
          },
          capabilities: {
            chatgptConnectorCompatible: true
          }
        }),
        diagnostics: ['Live KiCad PCB context is unavailable: No PCB is open.']
      })
    );

    const children = provider.getChildren();
    const dashboard = child(children, 'Compatibility dashboard');
    const runtime = child(provider.getChildren(dashboard), 'KiCad runtime');

    expect(child(children, 'MCP connected with degraded capabilities')).toBeDefined();
    expect(treeDescription(provider, provider.getChildren(dashboard), 'Compatibility state')).toBe(
      'Connected but degraded'
    );
    expect(treeDescription(provider, provider.getChildren(runtime), 'Live PCB context')).toBe(
      'unavailable'
    );

    const stdioProvider = providerForState({
      kind: 'VsCodeStdio',
      available: true,
      connected: true,
      install: {
        found: true,
        command: 'uvx',
        source: 'uvx',
        version: '3.5.2'
      }
    });
    const stdioChildren = stdioProvider.getChildren();
    const stdioDashboard = child(stdioChildren, 'Compatibility dashboard');
    const stdioSurface = child(
      stdioProvider.getChildren(stdioDashboard),
      'Advertised surface'
    );

    expect(
      child(stdioChildren, 'MCP connected with degraded capabilities')
    ).toBeDefined();
    expect(
      treeDescription(
        stdioProvider,
        stdioProvider.getChildren(stdioDashboard),
        'Compatibility state'
      )
    ).toBe('Connected but degraded');
    expect(
      treeDescription(
        stdioProvider,
        stdioProvider.getChildren(stdioSurface),
        'Missing optional capabilities'
      )
    ).toBe('3');
  });

  it('renders disconnected, remote-blocked, timeout, and protocol failure dashboard states', () => {
    expect(
      stateLabelFor({
        kind: 'Disconnected',
        available: true,
        connected: false
      })
    ).toBe('Installed but not running');
    expect(
      stateLabelFor({
        kind: 'Disconnected',
        available: true,
        connected: false,
        message:
          'Refusing remote MCP endpoint https://example.com. Use a loopback endpoint.'
      })
    ).toBe('Remote endpoint blocked by settings');
    expect(
      stateLabelFor({
        kind: 'Disconnected',
        available: true,
        connected: false,
        message: 'MCP request timed out after 15000ms.'
      })
    ).toBe('Timeout');
    expect(
      stateLabelFor({
        kind: 'Degraded',
        available: true,
        connected: false,
        message: 'MCP protocol contract failed: unsupported protocol version'
      })
    ).toBe('Installed but degraded');
    expect(
      stateLabelFor({
        kind: 'Disconnected',
        available: false,
        connected: false,
        message: 'Using cached MCP server metadata while reconnecting.',
        server: {
          version: '3.5.2',
          compat: 'ok',
          capturedAt: '2026-05-20T12:00:00.000Z',
          capabilities: {
            tools: [
              'kicad_get_version',
              'run_drc',
              'run_erc',
              'project_get_design_intent',
              'export_bom',
              'export_netlist'
            ],
            resources: ['project://active'],
            prompts: ['manufacturing-review'],
            serverInfo: serverInfoFixture({
              transport: { statelessHttp: false }
            })
          }
        }
      })
    ).toBe('Disconnected');
  });

  it('keeps the dashboard tree visual model stable', () => {
    const provider = providerForState(
      connectedState({
        tools: ['kicad_get_version', 'run_drc', 'run_erc'],
        serverInfo: serverInfoFixture({
          transport: { statelessHttp: false },
          capabilities: {
            chatgptConnectorCompatible: false
          }
        })
      })
    );

    expect(flattenTree(provider)).toMatchInlineSnapshot(`
      [
        "MCP connected with degraded capabilities :: 3.5.2",
        "Compatibility dashboard :: degraded",
        "Compatibility dashboard > Compatibility state :: Connected but degraded",
        "Compatibility dashboard > Server contract :: 8",
        "Compatibility dashboard > Server contract > Server :: kicad-mcp-pro",
        "Compatibility dashboard > Server contract > Endpoint :: http://127.0.0.1:27185/mcp",
        "Compatibility dashboard > Server contract > Transport mode :: streamable-http, stateful",
        "Compatibility dashboard > Server contract > Profile :: full",
        "Compatibility dashboard > Server contract > Operating mode :: readonly",
        "Compatibility dashboard > Server contract > Protocol version :: 2025-11-25",
        "Compatibility dashboard > Server contract > Tool schema version :: 1.0.0",
        "Compatibility dashboard > Server contract > Compatibility :: degraded",
        "Compatibility dashboard > KiCad runtime :: 4",
        "Compatibility dashboard > KiCad runtime > KiCad CLI :: KiCad 10.0.3 (/usr/bin/kicad-cli)",
        "Compatibility dashboard > KiCad runtime > Live GUI availability :: available",
        "Compatibility dashboard > KiCad runtime > Live PCB context :: available",
        "Compatibility dashboard > KiCad runtime > Live schematic context :: available",
        "Compatibility dashboard > Advertised surface :: 5",
        "Compatibility dashboard > Advertised surface > Advertised tools :: 3",
        "Compatibility dashboard > Advertised surface > Advertised resources :: 1",
        "Compatibility dashboard > Advertised surface > Advertised prompts :: 1",
        "Compatibility dashboard > Advertised surface > Missing required tools :: 3",
        "Compatibility dashboard > Advertised surface > Missing required tools > project_get_design_intent ::",
        "Compatibility dashboard > Advertised surface > Missing required tools > export_bom ::",
        "Compatibility dashboard > Advertised surface > Missing required tools > export_netlist ::",
        "Compatibility dashboard > Advertised surface > Missing optional capabilities :: 2",
        "Compatibility dashboard > Advertised surface > Missing optional capabilities > stateless Streamable HTTP transport ::",
        "Compatibility dashboard > Advertised surface > Missing optional capabilities > ChatGPT connector compatibility ::",
        "Compatibility dashboard > Health and remediation :: 4",
        "Compatibility dashboard > Health and remediation > Last health check :: 2026-05-20T12:00:00.000Z",
        "Compatibility dashboard > Health and remediation > Last error :: none",
        "Compatibility dashboard > Health and remediation > Remediation hint :: Refresh capabilities, launch the local HTTP server, or open KiCad with the target project.",
        "Compatibility dashboard > Health and remediation > Capability diagnostics :: none",
        "Actions :: MCP operations",
        "Actions > Reconnect ::",
        "Actions > Refresh capabilities ::",
        "Actions > Open MCP log ::",
        "Actions > Save diagnostic bundle ::",
        "Actions > Pick profile ::",
        "Actions > Switch endpoint ::",
        "Actions > Launch local MCP server ::",
        "Actions > Open compatibility docs ::",
        "Install :: uvx 3.5.2",
        "Raw advertised capabilities :: 3 tools, 1 resources, 1 prompts",
        "Raw advertised capabilities > Capability diagnostics :: none",
        "Raw advertised capabilities > KiCad runtime :: live PCB",
        "Raw advertised capabilities > Operation modes :: readonly",
        "Raw advertised capabilities > Operation modes > Active operating mode :: readonly",
        "Raw advertised capabilities > Operation modes > File-backed DRC :: available",
        "Raw advertised capabilities > Operation modes > File-backed ERC :: available",
        "Raw advertised capabilities > Operation modes > File-backed exports :: available",
        "Raw advertised capabilities > Operation modes > Live PCB read :: available",
        "Raw advertised capabilities > Operation modes > Live PCB write :: available",
        "Raw advertised capabilities > Operation modes > Live schematic read :: available",
        "Raw advertised capabilities > Operation modes > Live schematic write :: available",
        "Raw advertised capabilities > Operation modes > ChatGPT connector :: unavailable",
        "Raw advertised capabilities > Tools :: 3",
        "Raw advertised capabilities > Tools > kicad_get_version ::",
        "Raw advertised capabilities > Tools > run_drc ::",
        "Raw advertised capabilities > Tools > run_erc ::",
        "Raw advertised capabilities > Resources :: 1",
        "Raw advertised capabilities > Resources > project://active ::",
        "Raw advertised capabilities > Prompts :: 1",
        "Raw advertised capabilities > Prompts > manufacturing-review ::",
      ]
    `);
  });
});

function providerForState(state: McpConnectionState): McpToolsProvider {
  return new McpToolsProvider({ getState: () => state } as never);
}

function connectedState(options: {
  tools: string[];
  serverInfo?: McpServerInfoContract;
  diagnostics?: string[];
}): McpConnectionState {
  return {
    kind: 'Connected',
    available: true,
    connected: true,
    install: {
      found: true,
      command: 'uvx',
      source: 'uvx',
      version: '3.5.2'
    },
    server: {
      version: '3.5.2',
      compat: options.diagnostics?.length ? 'warn' : 'ok',
      capturedAt: '2026-05-20T12:00:00.000Z',
      capabilities: {
        tools: options.tools,
        resources: ['project://active'],
        prompts: ['manufacturing-review'],
        serverInfo: options.serverInfo ?? serverInfoFixture({}),
        diagnostics: options.diagnostics
      }
    }
  };
}

function serverInfoFixture(
  overrides: {
    transport?: Partial<McpServerInfoContract['transport']>;
    kicad?: Partial<McpServerInfoContract['kicad']>;
    capabilities?: Partial<McpServerInfoContract['capabilities']>;
  } = {}
): McpServerInfoContract {
  const base: McpServerInfoContract = {
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
      endpoint: 'http://127.0.0.1:27185/mcp',
      ...overrides.transport
    },
    kicad: {
      cliFound: true,
      cliPath: '/usr/bin/kicad-cli',
      cliVersion: 'KiCad 10.0.3',
      ipcAvailable: true,
      ipcVersion: '10.0.3',
      ipcApiVersion: '10',
      ipcMajorVersion: 10,
      ipcEndpointSource: 'default',
      livePcbContext: true,
      liveSchematicContext: true,
      ...overrides.kicad
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
        },
        export_manufacturing_package: {
          available: false,
          requiredMode: 'manufacturing',
          reason: 'Requires manufacturing operating mode.'
        },
        route_tune_length: {
          available: false,
          requiredMode: 'experimental',
          reason: 'Requires experimental operating mode.'
        }
      }
    },
    capabilities: {
      fileBackedDrc: true,
      fileBackedErc: true,
      fileBackedExports: true,
      livePcbRead: true,
      livePcbWrite: true,
      liveSchematicRead: true,
      liveSchematicWrite: true,
      liveEditingTools: {},
      chatgptConnectorCompatible: true,
      cliExports: {
        ipc2581: true,
        odb: true,
        svg: true,
        dxf: true,
        step: true,
        render: true,
        spiceNetlist: true
      },
      ...overrides.capabilities
    },
    diagnostics: []
  };

  return base;
}

function labels(nodes: ProviderNode[]): string[] {
  return nodes.map((item) => item.label);
}

function child(nodes: ProviderNode[], label: string): ProviderNode {
  const node = nodes.find((item) => item.label === label);
  expect(node).toBeDefined();
  return node!;
}

function treeDescription(
  provider: McpToolsProvider,
  nodes: ProviderNode[],
  label: string
): unknown {
  return provider.getTreeItem(child(nodes, label)).description;
}

function stateLabelFor(state: McpConnectionState): unknown {
  const provider = providerForState(state);
  const dashboard = child(provider.getChildren(), 'Compatibility dashboard');
  return treeDescription(
    provider,
    provider.getChildren(dashboard),
    'Compatibility state'
  );
}

function flattenTree(
  provider: McpToolsProvider,
  node?: unknown,
  parent = ''
): string[] {
  return provider.getChildren(node as never).flatMap((childNode) => {
    const item = provider.getTreeItem(childNode as never);
    const label = `${parent}${childNode.label}`;
    const description = item.description ? ` ${String(item.description)}` : '';
    const current = `${label} ::${description}`;
    const children = provider.getChildren(childNode as never);
    return children.length
      ? [current, ...flattenTree(provider, childNode, `${label} > `)]
      : [current];
  });
}
