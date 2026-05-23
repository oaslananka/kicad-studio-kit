import { COMMANDS } from '../../src/constants';
import { registerFeedbackCommands } from '../../src/commands/feedbackCommands';
import { commands, env, window } from './vscodeMock';

describe('feedback commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the beta feedback command and opens the beta feedback discussion form', async () => {
    (env.openExternal as jest.Mock).mockResolvedValue(true);

    const disposables = registerFeedbackCommands();
    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(([command]) => command === COMMANDS.sendFeedback);

    expect(disposables).toHaveLength(1);
    expect(registration).toBeDefined();

    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(env.openExternal).toHaveBeenCalledTimes(1);
    expect(String((env.openExternal as jest.Mock).mock.calls[0]?.[0])).toBe(
      'https://github.com/oaslananka/kicad-studio-kit/discussions/new?category=beta-feedback'
    );
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('shows a fallback URL when VS Code cannot open the browser', async () => {
    (env.openExternal as jest.Mock).mockResolvedValue(false);

    registerFeedbackCommands();
    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(([command]) => command === COMMANDS.sendFeedback);

    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://github.com/oaslananka/kicad-studio-kit/discussions/categories/beta-feedback'
      )
    );
  });
});
