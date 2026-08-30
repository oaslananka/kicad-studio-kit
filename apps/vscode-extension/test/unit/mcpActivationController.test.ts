import { McpActivationController } from '../../src/activation/mcpActivationController';
import { COMMANDS } from '../../src/constants';
import { __setConfiguration, commands, window, workspace } from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

jest.mock('../../src/workspace/projectContext', () => ({
  discoverKiCadProjects: jest.fn().mockResolvedValue([{ root: '/workspace' }])
}));

describe('McpActivationController onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
    workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
    __setConfiguration({ 'kicadstudio.mcp.autoDetect': true });
  });

  it('#628 delegates detected-server bootstrap to the canonical MCP setup command', async () => {
    const disconnected = {
      kind: 'Disconnected' as const,
      available: true,
      connected: false,
      install: {
        found: true,
        command: 'kicad-mcp-pro',
        version: '3.33.3',
        source: 'global' as const
      }
    };
    const mcpClient = {
      testConnection: jest.fn().mockResolvedValue(disconnected)
    };
    const mcpState = { update: jest.fn() };
    const mcpDetector = { generateMcpJson: jest.fn() };
    (window.showInformationMessage as jest.Mock).mockResolvedValue('Setup MCP');

    const controller = new McpActivationController({
      mcpClient: mcpClient as never,
      mcpState: mcpState as never,
      mcpDetector: mcpDetector as never
    });

    await controller.refreshMcpState();

    expect(commands.executeCommand).toHaveBeenCalledWith(
      COMMANDS.setupMcpIntegration
    );
    expect(mcpDetector.generateMcpJson).not.toHaveBeenCalled();
    expect(mcpClient.testConnection).toHaveBeenCalledTimes(1);
  });

  it('#628 offers MCP bootstrap at most once per activation session', async () => {
    const disconnected = {
      kind: 'Disconnected' as const,
      available: true,
      connected: false,
      install: {
        found: true,
        command: 'kicad-mcp-pro',
        version: '3.33.3',
        source: 'global' as const
      }
    };
    const mcpClient = {
      testConnection: jest.fn().mockResolvedValue(disconnected)
    };
    (window.showInformationMessage as jest.Mock).mockResolvedValue('Later');

    const controller = new McpActivationController({
      mcpClient: mcpClient as never,
      mcpState: { update: jest.fn() } as never,
      mcpDetector: { generateMcpJson: jest.fn() } as never
    });

    await Promise.all([
      controller.refreshMcpState(),
      controller.refreshMcpState()
    ]);
    await controller.refreshMcpState();

    expect(window.showInformationMessage).toHaveBeenCalledTimes(1);
  });
});
