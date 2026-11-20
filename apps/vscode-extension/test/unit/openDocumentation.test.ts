import { execFile } from 'node:child_process';
import { openDocumentationWithRecovery } from '../../src/utils/openDocumentation';
import { env, window } from './vscodeMock';

jest.mock('node:child_process', () => ({
  execFile: jest.fn()
}));

const docsUrl =
  'https://oaslananka.github.io/kicad-studio-kit/workflows/manufacturing-export.html';
const systemOpener = execFile as unknown as jest.Mock;
const initialDisplay = process.env['DISPLAY'];
const initialDesktop = process.env['XDG_CURRENT_DESKTOP'];
const initialWayland = process.env['WAYLAND_DISPLAY'];

function restoreEnv(key: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

describe('documentation browser opening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DISPLAY'] = ':93';
    process.env['XDG_CURRENT_DESKTOP'] = 'GNOME';
    delete process.env['WAYLAND_DISPLAY'];
    delete (env as typeof env & { remoteName?: string }).remoteName;
    systemOpener.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null) => void
      ) => {
        callback(null);
        return {};
      }
    );
    (env.openExternal as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    restoreEnv('DISPLAY', initialDisplay);
    restoreEnv('XDG_CURRENT_DESKTOP', initialDesktop);
    restoreEnv('WAYLAND_DISPLAY', initialWayland);
    delete (env as typeof env & { remoteName?: string }).remoteName;
  });

  it('opens HTTPS documentation through the local Linux desktop handler', async () => {
    await openDocumentationWithRecovery(docsUrl, 'quality gate documentation');

    expect(systemOpener).toHaveBeenCalledWith(
      'xdg-open',
      [docsUrl],
      expect.objectContaining({ timeout: 4_000 }),
      expect.any(Function)
    );
    expect(env.openExternal).not.toHaveBeenCalled();
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('falls back to VS Code when the local system browser fails', async () => {
    systemOpener.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null) => void
      ) => {
        callback(new Error('xdg-open failed'));
        return {};
      }
    );

    await openDocumentationWithRecovery(docsUrl, 'quality gate documentation');

    expect(systemOpener).toHaveBeenCalledTimes(1);
    expect(env.openExternal).toHaveBeenCalledTimes(1);
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('still offers Copy link when both local and VS Code handlers fail', async () => {
    systemOpener.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null) => void
      ) => {
        callback(new Error('system handler unavailable'));
        return {};
      }
    );
    (env.openExternal as jest.Mock).mockResolvedValueOnce(false);
    (window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Copy link');

    await openDocumentationWithRecovery(docsUrl, 'quality gate documentation');

    expect(env.clipboard.writeText).toHaveBeenCalledWith(docsUrl);
  });

  it('uses the local handler for a Wayland desktop without DISPLAY', async () => {
    delete process.env['DISPLAY'];
    process.env['WAYLAND_DISPLAY'] = 'wayland-0';

    await openDocumentationWithRecovery(docsUrl, 'quality gate documentation');

    expect(systemOpener).toHaveBeenCalledTimes(1);
    expect(env.openExternal).not.toHaveBeenCalled();
  });

  it('keeps remote VS Code sessions on the VS Code opener', async () => {
    (env as typeof env & { remoteName?: string }).remoteName = 'ssh-remote';

    await openDocumentationWithRecovery(docsUrl, 'quality gate documentation');

    expect(systemOpener).not.toHaveBeenCalled();
    expect(env.openExternal).toHaveBeenCalledTimes(1);
  });

  it('does not spawn a browser without a graphical Linux desktop', async () => {
    delete process.env['DISPLAY'];
    delete process.env['XDG_CURRENT_DESKTOP'];

    await openDocumentationWithRecovery(docsUrl, 'quality gate documentation');

    expect(systemOpener).not.toHaveBeenCalled();
    expect(env.openExternal).toHaveBeenCalledTimes(1);
  });

  it('does not launch non-HTTPS URLs through an OS executable', async () => {
    await openDocumentationWithRecovery(
      'http://localhost:9000/test',
      'test documentation'
    );

    expect(systemOpener).not.toHaveBeenCalled();
    expect(env.openExternal).toHaveBeenCalledTimes(1);
  });
});
