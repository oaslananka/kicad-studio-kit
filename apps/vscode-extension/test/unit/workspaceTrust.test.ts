import {
  registerTrustedCommand,
  requireWorkspaceTrust
} from '../../src/utils/workspaceTrust';
import { commands, window, workspace } from './vscodeMock';

describe('workspace trust helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
  });

  it('allows trusted workspaces without prompting', async () => {
    await expect(requireWorkspaceTrust('Run DRC')).resolves.toBe(true);

    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('blocks restricted workspaces with a warning', async () => {
    workspace.isTrusted = false;

    await expect(requireWorkspaceTrust('Run DRC')).resolves.toBe(false);

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Run DRC requires a trusted workspace.')
    );
  });

  it('wraps registered command handlers behind the trust check', async () => {
    workspace.isTrusted = false;
    const handler = jest.fn();
    registerTrustedCommand(
      'kicadstudio.testTrustedCommand',
      handler,
      'Export Gerbers'
    );
    const registered = (commands.registerCommand as jest.Mock).mock
      .calls[0]?.[1] as () => Promise<void>;

    await registered();

    expect(handler).not.toHaveBeenCalled();
  });
});
