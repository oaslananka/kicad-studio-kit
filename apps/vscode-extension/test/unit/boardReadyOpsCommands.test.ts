import { COMMANDS } from '../../src/constants';
import { registerBoardReadyOpsCommands } from '../../src/commands/boardReadyOpsCommands';
import { commands, window, env, __setConfiguration } from './vscodeMock';

describe('BoardReadyOps commands', () => {
  let servicesMock: any;
  let mockProjectState: any;
  let mockDiagnosticsCollection: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectState = {
      getActiveProject: jest.fn()
    };
    mockDiagnosticsCollection = {
      set: jest.fn(),
      setForSource: jest.fn()
    };
    mockLogger = {
      error: jest.fn(),
      info: jest.fn()
    };
    servicesMock = {
      projectState: mockProjectState,
      diagnosticsCollection: mockDiagnosticsCollection,
      logger: mockLogger
    };
  });

  it('registers four boardReadyOps commands', () => {
    const disposables = registerBoardReadyOpsCommands(servicesMock);

    expect(disposables).toHaveLength(4);

    const registeredIds = (
      commands.registerCommand as jest.Mock
    ).mock.calls.map(([id]: [string]) => id);

    expect(registeredIds).toContain(COMMANDS.boardReadyOpsCheck);
    expect(registeredIds).toContain(COMMANDS.boardReadyOpsConfigure);
    expect(registeredIds).toContain(COMMANDS.boardReadyOpsShowReport);
    expect(registeredIds).toContain(COMMANDS.boardReadyOpsOpenDocs);
  });

  it('shows a warning when boardReadyOps check is run while disabled', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': false });
    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsCheck
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showWarningMessage).toHaveBeenCalled();
  });

  it('shows an error when run with no active project', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': true });
    mockProjectState.getActiveProject.mockReturnValue(undefined);

    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsCheck
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('No active KiCad project')
    );
  });

  it('shows an info message when showReport is invoked and report not available', async () => {
    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsShowReport
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No BoardReadyOps report')
    );
  });

  it('opens BoardReadyOps docs via env.openExternal', async () => {
    (env.openExternal as jest.Mock).mockResolvedValue(true);

    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsOpenDocs
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(env.openExternal).toHaveBeenCalledTimes(1);
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('shows a fallback when boardReadyOps docs cannot be opened', async () => {
    (env.openExternal as jest.Mock).mockResolvedValue(false);

    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsOpenDocs
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showWarningMessage).toHaveBeenCalled();
  });

  it('opens boardReadyOps settings when configure command is run', async () => {
    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsConfigure
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      'kicadstudio.boardReadyOps'
    );
  });
});
