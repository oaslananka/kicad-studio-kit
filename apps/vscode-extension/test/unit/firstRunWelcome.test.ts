import { COMMANDS, CONTEXT_KEYS } from '../../src/constants';
import { showFirstRunWelcome } from '../../src/commands/firstRunWelcome';
import { commands, window } from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('first-run welcome', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers project-first exploration and explicitly marks MCP/AI optional', async () => {
    (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      'Explore Tasks'
    );
    await showFirstRunWelcome({ hasProject: false, workspaceTrusted: false });
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringMatching(
        /review schematics and PCBs.*MCP and AI are optional/u
      ),
      'Explore Tasks',
      'Guided Tour',
      'Maybe Later'
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(COMMANDS.openTaskHub);
  });

  it('acknowledges an already discovered trusted project instead of asking to open one', async () => {
    await showFirstRunWelcome({ hasProject: true, workspaceTrusted: true });
    const message = (window.showInformationMessage as jest.Mock).mock.calls.at(
      -1
    )?.[0];
    expect(message).toContain('Your KiCad project is ready');
    expect(message).not.toContain('Open a project');
  });

  it('explains Workspace Trust clearly for an already open restricted project', async () => {
    await showFirstRunWelcome({ hasProject: true, workspaceTrusted: false });
    const message = (window.showInformationMessage as jest.Mock).mock.calls.at(
      -1
    )?.[0];
    expect(message).toContain('KiCad project detected');
    expect(message).toContain('Trust this workspace');
    expect(message).toContain('MCP and AI are optional');
  });

  it('opens the real VS Code walkthrough without completing a missing project', async () => {
    (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      'Guided Tour'
    );
    await showFirstRunWelcome({ hasProject: false, workspaceTrusted: false });
    expect(commands.executeCommand).toHaveBeenNthCalledWith(
      1,
      'workbench.action.openWalkthrough',
      expect.stringContaining('#kicadstudio.gettingStarted')
    );
    expect(commands.executeCommand).toHaveBeenNthCalledWith(
      2,
      'setContext',
      CONTEXT_KEYS.walkthroughProjectReady,
      false
    );
  });

  it.each([true, false])(
    'completes the first-run project step for an existing project, trust=%s',
    async (workspaceTrusted) => {
      (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
        'Guided Tour'
      );
      await showFirstRunWelcome({ hasProject: true, workspaceTrusted });

      expect(commands.executeCommand).toHaveBeenNthCalledWith(
        1,
        'workbench.action.openWalkthrough',
        expect.stringContaining('#kicadstudio.gettingStarted')
      );
      expect(commands.executeCommand).toHaveBeenNthCalledWith(
        2,
        'setContext',
        CONTEXT_KEYS.walkthroughProjectReady,
        true
      );
      expect(commands.executeCommand).not.toHaveBeenCalledWith(
        'setContext',
        CONTEXT_KEYS.hasProject,
        false
      );
    }
  );
  it.each(['Maybe Later', undefined])(
    'does nothing when dismissed: %s',
    async (choice) => {
      (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
        choice
      );
      await showFirstRunWelcome({ hasProject: false, workspaceTrusted: false });
      expect(commands.executeCommand).not.toHaveBeenCalled();
    }
  );
});
