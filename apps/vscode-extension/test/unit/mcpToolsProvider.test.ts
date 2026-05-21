import { McpToolsProvider } from '../../src/mcp/mcpToolsProvider';
import { __setConfiguration } from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('McpToolsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({
      'kicadstudio.mcp.endpoint': 'http://127.0.0.1:27185',
      'kicadstudio.mcp.profile': 'full'
    });
  });

  it('shows transport, server metadata, capability counts, and install source', () => {
    const provider = new McpToolsProvider({
      getState: () => ({
        kind: 'Connected',
        available: true,
        connected: true,
        install: {
          found: true,
          command: 'uvx',
          source: 'uvx',
          version: '1.0.0'
        },
        server: {
          version: '1.0.0',
          compat: 'ok',
          capturedAt: '2026-05-20T12:00:00.000Z',
          capabilities: {
            tools: ['pcb_validate', 'sch_validate'],
            resources: ['project://active'],
            prompts: ['manufacturing-review'],
            serverInfo: {
              schemaVersion: '1.0.0',
              server: 'kicad-mcp-pro',
              version: '1.0.0',
              mcpProtocolVersion: '2025-11-25',
              toolSchemaVersion: '1.0.0',
              compatibilityRange: {
                kicadStudio: {
                  required: '>=1.0.0 <2.0.0',
                  recommended: '>=1.0.0 <2.0.0',
                  testedAgainst: '1.0.0'
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
                livePcbContext: false
              },
              capabilities: {
                fileBackedDrc: true,
                fileBackedErc: true,
                fileBackedExports: true,
                livePcbRead: false,
                livePcbWrite: false,
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
              diagnostics: [
                'Live KiCad PCB context is unavailable: No PCB is open.'
              ]
            },
            diagnostics: [
              'Live KiCad PCB context is unavailable: No PCB is open.'
            ]
          }
        }
      })
    } as never);

    const children = provider.getChildren();

    expect(children.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        'MCP connected',
        'Transport',
        'Profile',
        'Server version',
        'Capabilities',
        'Install',
        'Open MCP Log'
      ])
    );
    expect(
      provider.getTreeItem(
        children.find((item) => item.label === 'Capabilities') as never
      ).description
    ).toBe('2 tools, 1 resources, 1 prompts, 1 diagnostic');
    expect(
      provider
        .getChildren(
          children.find((item) => item.label === 'Capabilities') as never
        )
        .map((item) => item.label)
    ).toEqual(
      expect.arrayContaining([
        'Capability diagnostics',
        'KiCad runtime',
        'Operation modes'
      ])
    );
  });

  it('renders disconnected state as an actionable retry row', () => {
    const provider = new McpToolsProvider({
      getState: () => ({
        kind: 'Disconnected',
        available: true,
        connected: false,
        message: 'HTTP 503'
      })
    } as never);

    const state = childrenByLabel(provider, 'MCP disconnected');
    const diagnostic = childrenByLabel(provider, 'Last diagnostic');

    expect(provider.getTreeItem(state as never).command).toEqual(
      expect.objectContaining({ command: 'kicadstudio.mcp.retry' })
    );
    expect(provider.getTreeItem(diagnostic as never).description).toBe(
      'HTTP 503'
    );
  });

  it('renders degraded state as an actionable protocol warning row', () => {
    const provider = new McpToolsProvider({
      getState: () => ({
        kind: 'Degraded',
        available: true,
        connected: false,
        message: 'MCP protocol contract failed: HTTP 421'
      })
    } as never);

    const state = childrenByLabel(provider, 'MCP degraded');
    const diagnostic = childrenByLabel(provider, 'Last diagnostic');

    expect(provider.getTreeItem(state as never).command).toEqual(
      expect.objectContaining({ command: 'kicadstudio.mcp.retry' })
    );
    expect(provider.getTreeItem(diagnostic as never).description).toBe(
      'MCP protocol contract failed: HTTP 421'
    );
  });
});

function childrenByLabel(provider: McpToolsProvider, label: string) {
  const node = provider.getChildren().find((item) => item.label === label);
  expect(node).toBeDefined();
  return node!;
}
