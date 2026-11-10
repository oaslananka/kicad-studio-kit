import manifest from '../../package.json';
import { registerCheckCommands } from '../../src/commands/checkCommands';
import { resolveTargetFile } from '../../src/utils/workspaceUtils';
import type { CommandServices } from '../../src/commands/types';
import { commands, window, workspace } from './vscodeMock';

jest.mock('../../src/utils/workspaceUtils', () => ({
  resolveTargetFile: jest.fn()
}));

describe('ERC command visibility and runtime safety', () => {
  const resolve = resolveTargetFile as jest.Mock;

  function register() {
    const runERC = jest.fn();
    registerCheckCommands({
      projectState: { getActiveProject: jest.fn() },
      checkService: { runERC }
    } as unknown as CommandServices);
    const entry = (commands.registerCommand as jest.Mock).mock.calls.find(
      ([name]) => name === 'kicadstudio.runERC'
    );
    expect(entry).toBeDefined();
    return {
      runERC,
      invoke: entry![1] as () => Promise<unknown>
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
    resolve.mockResolvedValue(undefined);
  });

  afterEach(() => {
    workspace.isTrusted = true;
  });

  it('does not scan an untrusted workspace even when the command is discoverable', async () => {
    workspace.isTrusted = false;
    const { invoke, runERC } = register();
    await invoke();
    expect(resolve).not.toHaveBeenCalled();
    expect(runERC).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Run ERC requires a trusted workspace')
    );
  });

  it('explains why ERC could not start when no schematic is available', async () => {
    const { invoke, runERC } = register();
    await invoke();
    expect(resolve).toHaveBeenCalledWith(
      undefined,
      '.kicad_sch',
      expect.objectContaining({ projectRoot: undefined })
    );
    expect(runERC).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No KiCad schematic found')
    );
  });

  it('contributes ERC without a fragile palette context expression', () => {
    expect(
      manifest.contributes.menus.commandPalette.find(
        (item) => item.command === 'kicadstudio.runERC'
      )
    ).toEqual({
      command: 'kicadstudio.runERC',
      when: 'workspaceFolderCount > 0'
    });
  });
});

describe('DRC command visibility and runtime safety', () => {
  const resolve = resolveTargetFile as jest.Mock;

  function registerDRC() {
    const runDRC = jest.fn();
    registerCheckCommands({
      projectState: { getActiveProject: jest.fn() },
      checkService: { runDRC }
    } as unknown as CommandServices);
    const entry = (commands.registerCommand as jest.Mock).mock.calls.find(
      ([name]) => name === 'kicadstudio.runDRC'
    );
    expect(entry).toBeDefined();
    return {
      runDRC,
      invoke: entry![1] as () => Promise<unknown>
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
    resolve.mockResolvedValue(undefined);
  });

  afterEach(() => {
    workspace.isTrusted = true;
  });

  it('rejects untrusted DRC execution even though the command is discoverable', async () => {
    workspace.isTrusted = false;
    const { invoke, runDRC } = registerDRC();
    await invoke();
    expect(resolve).not.toHaveBeenCalled();
    expect(runDRC).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Run DRC requires a trusted workspace')
    );
  });

  it('explains missing PCB instead of silently returning', async () => {
    const { invoke, runDRC } = registerDRC();
    await invoke();
    expect(resolve).toHaveBeenCalledWith(
      undefined,
      '.kicad_pcb',
      expect.objectContaining({ projectRoot: undefined })
    );
    expect(runDRC).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No KiCad PCB found')
    );
  });

  it('contributes DRC with the stable folder-count palette context', () => {
    expect(
      manifest.contributes.menus.commandPalette.find(
        (item) => item.command === 'kicadstudio.runDRC'
      )
    ).toEqual({
      command: 'kicadstudio.runDRC',
      when: 'workspaceFolderCount > 0'
    });
  });

  it('attaches successful validation to resource project or active project fallback', async () => {
    resolve.mockResolvedValue('/workspace/board.kicad_pcb');
    const applyValidationResult = jest.fn();
    const recordValidationFailure = jest.fn();
    const activeProject = { id: 'active-1', name: 'active' };
    const findProjectForResource = jest
      .fn()
      .mockReturnValueOnce({ id: 'res-1', name: 'resource-project' })
      .mockReturnValueOnce(undefined);

    const checkService = {
      runDRC: jest.fn().mockResolvedValue({
        diagnostics: [],
        summary: { source: 'drc', errors: 0, warnings: 0, infos: 0 }
      })
    };

    registerCheckCommands({
      projectState: {
        getActiveProject: jest.fn().mockReturnValue(activeProject),
        findProjectForResource
      },
      diagnosticState: {
        applyValidationResult,
        recordValidationFailure
      },
      checkService
    } as unknown as CommandServices);

    const entry = (commands.registerCommand as jest.Mock).mock.calls.find(
      ([name]) => name === 'kicadstudio.runDRC'
    );
    const invoke = entry![1] as () => Promise<unknown>;

    await invoke();
    expect(applyValidationResult).toHaveBeenCalledWith(
      expect.anything(),
      [],
      expect.objectContaining({ source: 'drc' }),
      { project: { id: 'res-1', name: 'resource-project' } }
    );

    await invoke();
    expect(applyValidationResult).toHaveBeenCalledWith(
      expect.anything(),
      [],
      expect.objectContaining({ source: 'drc' }),
      { project: activeProject }
    );
  });

  it('records validation failure with fallback to active project', async () => {
    resolve.mockResolvedValue('/workspace/board.kicad_pcb');
    const applyValidationResult = jest.fn();
    const recordValidationFailure = jest.fn();
    const activeProject = { id: 'active-1', name: 'active' };
    const findProjectForResource = jest.fn().mockReturnValue(undefined);

    const checkService = {
      runDRC: jest.fn().mockRejectedValue(new Error('CLI failed'))
    };

    registerCheckCommands({
      projectState: {
        getActiveProject: jest.fn().mockReturnValue(activeProject),
        findProjectForResource
      },
      diagnosticState: {
        applyValidationResult,
        recordValidationFailure
      },
      checkService
    } as unknown as CommandServices);

    const entry = (commands.registerCommand as jest.Mock).mock.calls.find(
      ([name]) => name === 'kicadstudio.runDRC'
    );
    const invoke = entry![1] as () => Promise<unknown>;

    await invoke();
    expect(recordValidationFailure).toHaveBeenCalledWith(
      'drc',
      expect.anything(),
      expect.any(Error),
      { project: activeProject }
    );
  });
});
