import { COMMANDS, EXTENSION_ID } from '../../src/constants';
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
    await showFirstRunWelcome();
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

  it('opens the real VS Code walkthrough from the secondary option', async () => {
    (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      'Guided Tour'
    );
    await showFirstRunWelcome();
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openWalkthrough',
      `${EXTENSION_ID}#kicadstudio.gettingStarted`
    );
  });

  it.each(['Maybe Later', undefined])(
    'does nothing when dismissed: %s',
    async (choice) => {
      (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
        choice
      );
      await showFirstRunWelcome();
      expect(commands.executeCommand).not.toHaveBeenCalled();
    }
  );
});
