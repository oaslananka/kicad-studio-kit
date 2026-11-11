import { makeCliRefresh } from '../../src/statusbar/cliStatusRefresh';

const kiCad9 = {
  path: '/test/kicad9',
  version: '9.0.0',
  versionLabel: 'KiCad 9.0.0',
  source: 'settings' as const
};
const kiCad10 = {
  path: '/usr/bin/kicad-cli',
  version: '10.0.8',
  versionLabel: 'KiCad 10.0.8',
  source: 'settings' as const
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('CLI status-bar refresh after Settings updates', () => {
  it('clears old state without launching a CLI in an untrusted workspace', () => {
    const detect = jest.fn();
    const update = jest.fn();
    const refresh = makeCliRefresh(
      { detect },
      { update } as never,
      () => false
    );
    refresh();
    expect(detect).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ cli: undefined });
  });

  it('re-detects the configured executable and updates the visible version', async () => {
    const detect = jest.fn().mockResolvedValue(kiCad10);
    const update = jest.fn();
    const refresh = makeCliRefresh({ detect }, { update } as never, () => true);
    refresh();
    expect(update).toHaveBeenNthCalledWith(1, { cli: undefined });
    await tick();
    expect(update).toHaveBeenNthCalledWith(2, { cli: kiCad10 });
  });

  it('does not retain a false old version when no CLI is available', async () => {
    const detect = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn();
    const refresh = makeCliRefresh({ detect }, { update } as never, () => true);
    refresh();
    await tick();
    expect(update).toHaveBeenLastCalledWith({ cli: undefined });
    expect(update).not.toHaveBeenCalledWith({ cli: kiCad9 });
  });

  it('discards stale asynchronous results after rapid settings changes', async () => {
    let resolveOld!: (value: typeof kiCad9) => void;
    const detect = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<typeof kiCad9>((resolve) => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValueOnce(kiCad10);
    const update = jest.fn();
    const refresh = makeCliRefresh({ detect }, { update } as never, () => true);
    refresh();
    refresh();
    await tick();
    expect(update).toHaveBeenLastCalledWith({ cli: kiCad10 });
    const count = update.mock.calls.length;
    resolveOld(kiCad9);
    await tick();
    expect(update).toHaveBeenCalledTimes(count);
    expect(update).not.toHaveBeenCalledWith({ cli: kiCad9 });
  });

  it('clears the current status after a detector error and ignores stale failures', async () => {
    let rejectOld!: (reason: Error) => void;
    const detect = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOld = reject;
          })
      )
      .mockResolvedValueOnce(kiCad10);
    const update = jest.fn();
    const refresh = makeCliRefresh({ detect }, { update } as never, () => true);
    refresh();
    refresh();
    await tick();
    const count = update.mock.calls.length;
    rejectOld(new Error('private path must not leak'));
    await tick();
    expect(update).toHaveBeenCalledTimes(count);
    expect(update).toHaveBeenLastCalledWith({ cli: kiCad10 });

    detect.mockRejectedValueOnce(new Error('not accessible'));
    refresh();
    await tick();
    expect(update).toHaveBeenLastCalledWith({ cli: undefined });
  });
});
