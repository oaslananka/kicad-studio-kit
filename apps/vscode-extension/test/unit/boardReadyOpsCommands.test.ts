jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
import { COMMANDS } from '../../src/constants';
import { registerBoardReadyOpsCommands } from '../../src/commands/boardReadyOpsCommands';
import { commands, window, env, __setConfiguration } from './vscodeMock';

function registeredHandler(command: string): () => Promise<void> {
  const registration = (commands.registerCommand as jest.Mock).mock.calls.find(
    ([id]: [string]) => id === command
  );
  expect(registration).toBeDefined();
  return registration[1] as () => Promise<void>;
}

function boardReadyOpsChild(stdout: string, exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  queueMicrotask(() => {
    child.stdout.emit('data', Buffer.from(stdout));
    child.emit('close', exitCode);
  });
  return child;
}

describe('BoardReadyOps commands', () => {
  let servicesMock: any;
  let mockProjectState: any;
  let mockDiagnosticsCollection: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (window.withProgress as jest.Mock).mockImplementation(
      async (_options, task) =>
        task(
          { report: jest.fn() },
          {
            isCancellationRequested: false,
            onCancellationRequested: jest.fn(() => ({ dispose: jest.fn() }))
          }
        )
    );
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

  it('discovers the BoardReadyOps doctor contract before running readiness', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': true });
    mockProjectState.getActiveProject.mockReturnValue({ rootPath: '/project' });
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock
      .mockImplementationOnce(() =>
        boardReadyOpsChild(
          JSON.stringify({
            schemaVersion: 1,
            tool: { name: 'boardreadyops', version: '1.37.0' },
            checks: []
          })
        )
      )
      .mockImplementationOnce(() =>
        boardReadyOpsChild(
          JSON.stringify({
            status: 'passed',
            summary: {
              total: 0,
              critical: 0,
              high: 0,
              medium: 0,
              low: 0,
              info: 0
            },
            findings: []
          })
        )
      );

    registerBoardReadyOpsCommands(servicesMock);
    await registeredHandler(COMMANDS.boardReadyOpsCheck)();

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([
      'boardreadyops',
      'doctor',
      '--format',
      'json'
    ]);
    expect(spawnMock.mock.calls[1]?.[1]).toEqual([
      'boardreadyops',
      'run',
      '--format',
      'json',
      '/project'
    ]);
  });

  it('does not expose raw BoardReadyOps output when readiness JSON is malformed', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': true });
    mockProjectState.getActiveProject.mockReturnValue({ rootPath: '/project' });
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock
      .mockImplementationOnce(() =>
        boardReadyOpsChild(
          JSON.stringify({
            schemaVersion: 1,
            tool: { name: 'boardreadyops', version: '1.37.0' },
            checks: []
          })
        )
      )
      .mockImplementationOnce(() => boardReadyOpsChild('PRIVATE_EVIDENCE_SENTINEL'));

    registerBoardReadyOpsCommands(servicesMock);
    await registeredHandler(COMMANDS.boardReadyOpsCheck)();

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('invalid JSON output')
    );
    expect(window.showErrorMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('PRIVATE_EVIDENCE_SENTINEL')
    );
    expect(mockLogger.error).toHaveBeenCalled();
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(
      'PRIVATE_EVIDENCE_SENTINEL'
    );
  });

  it('fails closed when BoardReadyOps doctor exits non-zero', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': true });
    mockProjectState.getActiveProject.mockReturnValue({ rootPath: '/project' });
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementationOnce(() =>
      boardReadyOpsChild(
        JSON.stringify({
          schemaVersion: 1,
          tool: { name: 'boardreadyops', version: '1.37.0' },
          checks: []
        }),
        2
      )
    );

    registerBoardReadyOpsCommands(servicesMock);
    await registeredHandler(COMMANDS.boardReadyOpsCheck)();

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('doctor exited with code 2')
    );
  });

  it('fails closed before readiness when the doctor contract is incompatible', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': true });
    mockProjectState.getActiveProject.mockReturnValue({ rootPath: '/project' });
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementationOnce(() =>
      boardReadyOpsChild(
        JSON.stringify({
          schemaVersion: 2,
          tool: { name: 'boardreadyops', version: '1.37.0' },
          checks: []
        })
      )
    );

    registerBoardReadyOpsCommands(servicesMock);
    await registeredHandler(COMMANDS.boardReadyOpsCheck)();

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('not contract-compatible')
    );
    expect(mockLogger.error).toHaveBeenCalled();
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
