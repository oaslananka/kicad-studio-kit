import { COMMANDS } from '../../src/constants';
import {
  TASK_GROUPS,
  type TaskGroupId,
  type TaskHubContext
} from '../../src/commands/taskHubCatalog';
import { registerTaskHubCommands } from '../../src/commands/taskHubCommands';
import { commands, window, workspace, Uri } from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

function handler(commandId: string): () => Promise<void> {
  const entry = (commands.registerCommand as jest.Mock).mock.calls.find(
    ([id]: [string]) => id === commandId
  );
  if (!entry) throw new Error(`Command not registered: ${commandId}`);
  return entry[1];
}

function taskContext(overrides: Partial<TaskHubContext> = {}): TaskHubContext {
  return {
    hasProject: true,
    workspaceTrusted: true,
    schematicOpen: true,
    pcbOpen: true,
    jobsetOpen: true,
    hasVariants: true,
    aiEnabled: true,
    mcpAvailable: true,
    mcpConnected: true,
    mcpRetryAvailable: true,
    mcpManufacturingMode: true,
    ...overrides
  };
}

describe('task-oriented command hub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    registerTaskHubCommands(() => taskContext());
  });

  it('defines the five product task groups in stable order', () => {
    expect(TASK_GROUPS.map((group) => group.id)).toEqual<TaskGroupId[]>([
      'review',
      'validate',
      'release',
      'automate',
      'maintain'
    ]);
  });

  it('registers the hub and every direct task entry point', () => {
    expect(commands.registerCommand).toHaveBeenCalledTimes(6);
    expect(commands.registerCommand).toHaveBeenCalledWith(
      COMMANDS.openTaskHub,
      expect.any(Function)
    );
    for (const group of TASK_GROUPS) {
      expect(commands.registerCommand).toHaveBeenCalledWith(
        group.command,
        expect.any(Function)
      );
    }
  });

  it('routes the main hub selection to the selected task command', async () => {
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce({
      label: '$(checklist) Validate',
      taskCommand: COMMANDS.openValidateTasks
    });

    await handler(COMMANDS.openTaskHub)();

    expect(window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          taskCommand: COMMANDS.openValidateTasks
        })
      ]),
      expect.objectContaining({
        placeHolder: 'Choose what you want to do with this KiCad project'
      })
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(
      COMMANDS.openValidateTasks
    );
  });

  it('delegates a task action to its existing command handler', async () => {
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce({
      label: 'Run all quality gates',
      command: COMMANDS.qualityGateRunAll
    });

    await handler(COMMANDS.openValidateTasks)();

    expect(window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          command: COMMANDS.qualityGateRunAll
        })
      ]),
      expect.objectContaining({
        placeHolder: 'Validate — choose a project check'
      })
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(
      COMMANDS.qualityGateRunAll
    );
  });

  it('filters task groups that are unavailable in the current workspace', async () => {
    jest.clearAllMocks();
    registerTaskHubCommands(() => taskContext({ hasProject: false }));
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

    await handler(COMMANDS.openTaskHub)();

    expect(window.showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          label: expect.stringContaining('Open a KiCad project'),
          taskCommand: 'workbench.action.files.openFolder'
        }),
        expect.objectContaining({
          taskCommand: COMMANDS.openMaintainTasks
        })
      ],
      expect.objectContaining({
        placeHolder: 'Open a KiCad project to start, or configure the workspace'
      })
    );
  });

  it('opens the folder picker from the first-run task hub without requiring MCP', async () => {
    jest.clearAllMocks();
    registerTaskHubCommands(() =>
      taskContext({ hasProject: false, mcpConnected: false, aiEnabled: false })
    );
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce({
      label: '$(folder-opened) Open a KiCad project',
      taskCommand: 'workbench.action.files.openFolder'
    });

    await handler(COMMANDS.openTaskHub)();

    expect(commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.files.openFolder'
    );
    expect(commands.executeCommand).not.toHaveBeenCalledWith(
      COMMANDS.setupMcpIntegration
    );
  });

  it('hides trusted maintenance actions in an untrusted workspace', async () => {
    jest.clearAllMocks();
    registerTaskHubCommands(() => taskContext({ workspaceTrusted: false }));
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

    await handler(COMMANDS.openMaintainTasks)();

    const items = (window.showQuickPick as jest.Mock).mock.calls[0][0];
    expect(items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: COMMANDS.detectCli })
      ])
    );
  });

  it('hides validate actions whose runtime prerequisites are unavailable', async () => {
    jest.clearAllMocks();
    registerTaskHubCommands(() =>
      taskContext({
        schematicOpen: false,
        pcbOpen: false,
        aiEnabled: false,
        mcpConnected: false
      })
    );
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

    await handler(COMMANDS.openValidateTasks)();

    const items = (window.showQuickPick as jest.Mock).mock.calls[0][0];
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: COMMANDS.boardReadyOpsCheck }),
        expect.objectContaining({ command: COMMANDS.boardReadyOpsPlan }),
        expect.objectContaining({
          command: COMMANDS.boardReadyOpsReviewEvidence
        }),
        expect.objectContaining({ command: COMMANDS.qualityGateOpenDocs })
      ])
    );
    expect(items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: COMMANDS.qualityGateRunAll }),
        expect.objectContaining({ command: COMMANDS.runDRC }),
        expect.objectContaining({ command: COMMANDS.runERC }),
        expect.objectContaining({ command: COMMANDS.aiProactiveDRC })
      ])
    );
  });

  it('shows release outputs without exposing the manufacturing wizard in read-only MCP mode', async () => {
    jest.clearAllMocks();
    registerTaskHubCommands(() => taskContext({ mcpManufacturingMode: false }));
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

    await handler(COMMANDS.openReleaseTasks)();

    const items = (window.showQuickPick as jest.Mock).mock.calls[0][0];
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: COMMANDS.exportManufacturingPackage
        }),
        expect.objectContaining({ command: COMMANDS.exportGerbersWithDrill })
      ])
    );
    expect(items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: COMMANDS.manufacturingRelease })
      ])
    );
  });

  it('guides a user without an active PCB directly to their workspace board', async () => {
    jest.clearAllMocks();
    registerTaskHubCommands(() =>
      taskContext({ pcbOpen: false, schematicOpen: false, mcpConnected: false })
    );
    const board = Uri.file('/workspace/demo/board.kicad_pcb');
    (workspace.findFiles as jest.Mock).mockResolvedValueOnce([board]);
    (window.showQuickPick as jest.Mock).mockImplementationOnce(async (items) =>
      items.find(
        (item: { openBoardForFabrication?: boolean }) =>
          item.openBoardForFabrication
      )
    );

    await handler(COMMANDS.openReleaseTasks)();

    expect(window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          label: expect.stringContaining('Open PCB for fabrication'),
          openBoardForFabrication: true
        })
      ]),
      expect.any(Object)
    );
    expect(workspace.findFiles).toHaveBeenCalled();
    expect(commands.executeCommand).toHaveBeenCalledWith('vscode.open', board);
    expect(window.showQuickPick).toHaveBeenCalledTimes(2);
    expect(commands.executeCommand).not.toHaveBeenCalledWith(
      COMMANDS.exportManufacturingPackage
    );
  });

  it('lets users choose among several workspace PCBs', async () => {
    jest.clearAllMocks();
    registerTaskHubCommands(() => taskContext({ pcbOpen: false }));
    const boards = [
      Uri.file('/workspace/first/board.kicad_pcb'),
      Uri.file('/workspace/second/board.kicad_pcb')
    ];
    (workspace.findFiles as jest.Mock).mockResolvedValueOnce(boards);
    (window.showQuickPick as jest.Mock)
      .mockImplementationOnce(async (items) =>
        items.find(
          (item: { openBoardForFabrication?: boolean }) =>
            item.openBoardForFabrication
        )
      )
      .mockImplementationOnce(async (items) => items[1]);

    await handler(COMMANDS.openReleaseTasks)();

    expect(window.showQuickPick).toHaveBeenCalledTimes(3);
    const releaseActions = (window.showQuickPick as jest.Mock).mock.calls[2][0];
    expect(releaseActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: COMMANDS.exportManufacturingPackage
        }),
        expect.objectContaining({ command: COMMANDS.exportGerbersWithDrill })
      ])
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'vscode.open',
      boards[1]
    );
    expect(commands.executeCommand).not.toHaveBeenCalledWith(
      'vscode.open',
      boards[0]
    );
  });

  it('does not open or export a board when selection is cancelled', async () => {
    jest.clearAllMocks();
    registerTaskHubCommands(() => taskContext({ pcbOpen: false }));
    (workspace.findFiles as jest.Mock).mockResolvedValueOnce([
      Uri.file('/workspace/a/a.kicad_pcb'),
      Uri.file('/workspace/b/b.kicad_pcb')
    ]);
    (window.showQuickPick as jest.Mock)
      .mockImplementationOnce(async (items) =>
        items.find(
          (item: { openBoardForFabrication?: boolean }) =>
            item.openBoardForFabrication
        )
      )
      .mockResolvedValueOnce(undefined);

    await handler(COMMANDS.openReleaseTasks)();

    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('explains when no workspace PCB exists instead of claiming an export', async () => {
    jest.clearAllMocks();
    registerTaskHubCommands(() => taskContext({ pcbOpen: false }));
    (workspace.findFiles as jest.Mock).mockResolvedValueOnce([]);
    (window.showQuickPick as jest.Mock).mockImplementationOnce(async (items) =>
      items.find(
        (item: { openBoardForFabrication?: boolean }) =>
          item.openBoardForFabrication
      )
    );

    await handler(COMMANDS.openReleaseTasks)();

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('.kicad_pcb')
    );
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('keeps normal release actions when a PCB is already active', async () => {
    jest.clearAllMocks();
    registerTaskHubCommands(() =>
      taskContext({ pcbOpen: true, mcpConnected: false })
    );
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

    await handler(COMMANDS.openReleaseTasks)();

    const items = (window.showQuickPick as jest.Mock).mock.calls[0][0];
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: COMMANDS.exportManufacturingPackage
        }),
        expect.objectContaining({ command: COMMANDS.exportGerbersWithDrill })
      ])
    );
    expect(items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ openBoardForFabrication: true })
      ])
    );
  });
  it('does nothing when a Quick Pick is cancelled', async () => {
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

    await handler(COMMANDS.openReviewTasks)();

    expect(commands.executeCommand).not.toHaveBeenCalled();
  });
});
