import { COMMANDS } from '../../src/constants';
import { registerMcpCommands } from '../../src/commands/mcpCommands';
import { McpDetector } from '../../src/mcp/mcpDetector';
import {
  commands,
  createExtensionContextMock,
  env,
  tasks,
  window,
  workspace
} from './vscodeMock';

describe('MCP command workspace trust guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
    workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    workspace.isTrusted = true;
    workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  function registerWithServices(overrides: Record<string, unknown> = {}) {
    const services = {
      mcpClient: {
        detectInstall: jest.fn(),
        retryNow: jest.fn()
      },
      fixQueueProvider: {
        refresh: jest.fn(),
        applyFix: jest.fn(),
        applyFixById: jest.fn(),
        applyAll: jest.fn()
      },
      refreshMcpState: jest.fn(),
      context: createExtensionContextMock(),
      ...overrides
    };

    registerMcpCommands(
      createExtensionContextMock() as never,
      services as never
    );
    return services;
  }

  function registeredHandler(
    commandId: string
  ): (...args: unknown[]) => unknown {
    const entry = (commands.registerCommand as jest.Mock).mock.calls.find(
      ([id]) => id === commandId
    );
    if (!entry) {
      throw new Error(`Command was not registered: ${commandId}`);
    }
    return entry[1] as (...args: unknown[]) => unknown;
  }

  it('blocks mutating fix queue commands in untrusted workspaces', async () => {
    workspace.isTrusted = false;
    const services = registerWithServices();

    await registeredHandler(COMMANDS.applyAllFixQueueItems)();

    expect(services.fixQueueProvider.applyAll).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('requires a trusted workspace')
    );
  });

  it('runs trusted fix queue commands when the workspace is trusted', async () => {
    const services = registerWithServices();

    await registeredHandler(COMMANDS.applyFixQueueById)('fix-1');
    await registeredHandler(COMMANDS.applyAllFixQueueItems)();

    expect(services.fixQueueProvider.applyFixById).toHaveBeenCalledWith(
      'fix-1'
    );
    expect(services.fixQueueProvider.applyAll).toHaveBeenCalled();
  });

  it('refreshes and retries MCP state through non-mutating commands', async () => {
    const services = registerWithServices();

    await registeredHandler(COMMANDS.refreshFixQueue)();
    await registeredHandler(COMMANDS.retryMcp)();

    expect(services.fixQueueProvider.refresh).toHaveBeenCalled();
    expect(services.mcpClient.retryNow).toHaveBeenCalled();
    expect(services.refreshMcpState).toHaveBeenCalled();
  });

  it('opens the org kicad-mcp-pro guide when MCP setup cannot find an install', async () => {
    const services = registerWithServices({
      mcpClient: {
        detectInstall: jest.fn().mockResolvedValue({ found: false })
      }
    });
    (window.showWarningMessage as jest.Mock).mockResolvedValue(
      'Open Repository'
    );

    await registeredHandler(COMMANDS.setupMcpIntegration)();

    expect(env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: 'https://github.com/oaslananka/kicad-studio-kit'
      })
    );
    expect(services.refreshMcpState).not.toHaveBeenCalled();
  });

  it('starts MCP installation from setup when the user chooses Install', async () => {
    registerWithServices({
      mcpClient: {
        detectInstall: jest.fn().mockResolvedValue({ found: false })
      }
    });
    (window.showWarningMessage as jest.Mock).mockResolvedValue('Install');

    await registeredHandler(COMMANDS.setupMcpIntegration)();

    expect(commands.executeCommand).toHaveBeenCalledWith(COMMANDS.installMcp);
  });

  it('#620 shows Python prerequisite guidance when no safe installer exists', async () => {
    registerWithServices();
    jest.spyOn(McpDetector.prototype, 'detectInstallers').mockResolvedValue([]);
    (window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

    await registeredHandler(COMMANDS.installMcp)();

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Python 3.13'),
      'Open install docs'
    );
    expect(tasks.executeTask).not.toHaveBeenCalled();
  });

  it('#620 opens the current MCP server getting-started guide from prerequisite guidance', async () => {
    registerWithServices();
    jest.spyOn(McpDetector.prototype, 'detectInstallers').mockResolvedValue([]);
    (window.showWarningMessage as jest.Mock).mockResolvedValue(
      'Open install docs'
    );

    await registeredHandler(COMMANDS.installMcp)();

    expect(env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath:
          'https://oaslananka.github.io/kicad-mcp-pro/tutorials/getting-started/'
      })
    );
  });

  it('#620 refreshes MCP state automatically after a successful install task', async () => {
    const services = registerWithServices();
    const candidate = {
      id: 'pipx' as const,
      label: 'pipx install kicad-mcp-pro',
      description: 'Install with Python 3.13',
      command: 'pipx',
      args: ['install', '--python', '/usr/bin/python3.13', 'kicad-mcp-pro']
    };
    jest
      .spyOn(McpDetector.prototype, 'detectInstallers')
      .mockResolvedValue([candidate]);
    (window.showQuickPick as jest.Mock).mockResolvedValue({
      label: candidate.label,
      description: candidate.description,
      candidate
    });

    let endListener:
      | ((event: { execution: { task: unknown }; exitCode: number }) => void)
      | undefined;
    (tasks.onDidEndTaskProcess as jest.Mock).mockImplementation((listener) => {
      endListener = listener;
      return { dispose: jest.fn() };
    });
    (tasks.executeTask as jest.Mock).mockImplementation(async (task) => {
      const execution = { task };
      queueMicrotask(() => endListener?.({ execution, exitCode: 0 }));
      return execution;
    });

    await registeredHandler(COMMANDS.installMcp)();

    expect(tasks.onDidEndTaskProcess).toHaveBeenCalled();
    expect(services.refreshMcpState).toHaveBeenCalledTimes(1);
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('installation completed')
    );
  });

  it('#620 reports a failed install task without refreshing MCP state', async () => {
    const services = registerWithServices();
    const candidate = {
      id: 'pipx' as const,
      label: 'pipx install kicad-mcp-pro',
      description: 'Install with Python 3.13',
      command: 'pipx',
      args: ['install', '--python', '/usr/bin/python3.13', 'kicad-mcp-pro']
    };
    jest
      .spyOn(McpDetector.prototype, 'detectInstallers')
      .mockResolvedValue([candidate]);
    (window.showQuickPick as jest.Mock).mockResolvedValue({
      label: candidate.label,
      description: candidate.description,
      candidate
    });

    let endListener:
      | ((event: { execution: { task: unknown }; exitCode: number }) => void)
      | undefined;
    (tasks.onDidEndTaskProcess as jest.Mock).mockImplementation((listener) => {
      endListener = listener;
      return { dispose: jest.fn() };
    });
    (tasks.executeTask as jest.Mock).mockImplementation(async (task) => {
      const execution = { task };
      queueMicrotask(() => endListener?.({ execution, exitCode: 1 }));
      return execution;
    });

    await registeredHandler(COMMANDS.installMcp)();

    expect(services.refreshMcpState).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('installation failed')
    );
  });

  it('#620 observes installer completion even when the task exits before executeTask resolves', async () => {
    const services = registerWithServices();
    const candidate = {
      id: 'pipx' as const,
      label: 'pipx install kicad-mcp-pro',
      description: 'Install with Python 3.13',
      command: 'pipx',
      args: ['install', '--python', '/usr/bin/python3.13', 'kicad-mcp-pro']
    };
    jest
      .spyOn(McpDetector.prototype, 'detectInstallers')
      .mockResolvedValue([candidate]);
    (window.showQuickPick as jest.Mock).mockResolvedValue({
      label: candidate.label,
      description: candidate.description,
      candidate
    });

    let endListener:
      | ((event: { execution: { task: unknown }; exitCode: number }) => void)
      | undefined;
    (tasks.onDidEndTaskProcess as jest.Mock).mockImplementation((listener) => {
      endListener = listener;
      return { dispose: jest.fn() };
    });
    (tasks.executeTask as jest.Mock).mockImplementation(async (task) => {
      const execution = { task };
      endListener?.({ execution, exitCode: 0 });
      return execution;
    });

    await registeredHandler(COMMANDS.installMcp)();

    expect(services.refreshMcpState).toHaveBeenCalledTimes(1);
  });

  it('stops MCP setup when no workspace folder is open', async () => {
    const services = registerWithServices({
      mcpClient: {
        detectInstall: jest.fn().mockResolvedValue({
          found: true,
          command: 'uvx',
          source: 'uvx'
        })
      }
    });
    (workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;

    await registeredHandler(COMMANDS.setupMcpIntegration)();

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Open a workspace folder')
    );
    expect(services.refreshMcpState).not.toHaveBeenCalled();
  });

  it('generates stdio MCP setup when selected', async () => {
    const services = registerWithServices({
      mcpClient: {
        detectInstall: jest.fn().mockResolvedValue({
          found: true,
          command: 'uvx',
          source: 'uvx'
        })
      }
    });
    const generateMcpJson = jest
      .spyOn(McpDetector.prototype, 'generateMcpJson')
      .mockResolvedValue();
    (window.showQuickPick as jest.Mock)
      .mockResolvedValueOnce({ value: 'stdio' })
      .mockResolvedValueOnce('analysis');

    await registeredHandler(COMMANDS.setupMcpIntegration)();

    expect(generateMcpJson).toHaveBeenCalledWith(
      '/workspace',
      expect.objectContaining({ command: 'uvx' }),
      'analysis'
    );
    expect(services.refreshMcpState).toHaveBeenCalled();
  });

  it('generates HTTP MCP setup when selected', async () => {
    const services = registerWithServices({
      mcpClient: {
        detectInstall: jest.fn().mockResolvedValue({
          found: true,
          command: 'uvx',
          source: 'uvx'
        })
      }
    });
    const generateHttpConfig = jest
      .spyOn(McpDetector.prototype, 'generateHttpConfig')
      .mockResolvedValue();
    (window.showQuickPick as jest.Mock)
      .mockResolvedValueOnce({ value: 'http' })
      .mockResolvedValueOnce('full');

    await registeredHandler(COMMANDS.setupMcpIntegration)();

    expect(generateHttpConfig).toHaveBeenCalledWith(
      '/workspace',
      expect.objectContaining({ command: 'uvx' }),
      'full'
    );
    expect(services.refreshMcpState).toHaveBeenCalled();
  });

  it('cancels MCP setup when the transport picker is dismissed', async () => {
    const services = registerWithServices({
      mcpClient: {
        detectInstall: jest.fn().mockResolvedValue({
          found: true,
          command: 'uvx',
          source: 'uvx'
        })
      }
    });
    (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    await registeredHandler(COMMANDS.setupMcpIntegration)();

    expect(services.refreshMcpState).not.toHaveBeenCalled();
  });
});
