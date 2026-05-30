import { COMMANDS } from '../../src/constants';
import { registerBoardReadyOpsCommands } from '../../src/commands/boardReadyOpsCommands';
import { commands, window, env } from './vscodeMock';

describe('BoardReadyOps commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers four boardReadyOps commands', () => {
    const disposables = registerBoardReadyOpsCommands();

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
    registerBoardReadyOpsCommands();

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsCheck
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showWarningMessage).toHaveBeenCalled();
  });

  it('shows an info message when showReport is invoked', async () => {
    registerBoardReadyOpsCommands();

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsShowReport
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('BoardReadyOps')
    );
  });

  it('opens BoardReadyOps docs via env.openExternal', async () => {
    (env.openExternal as jest.Mock).mockResolvedValue(true);

    registerBoardReadyOpsCommands();

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

    registerBoardReadyOpsCommands();

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
    registerBoardReadyOpsCommands();

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
