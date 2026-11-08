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
    ).toEqual({ command: 'kicadstudio.runERC' });
  });
});
