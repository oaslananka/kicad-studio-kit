import {
  DEFAULT_VSCODE_TEST_VERSION,
  downloadVsCodeWithRetry,
  resolveVsCodeTestSuite,
  resolveVsCodeTestVersion
} from '../vscodeTestRuntime';

describe('VS Code test runtime', () => {
  it('uses the pinned local host version without a canary override', () => {
    expect(resolveVsCodeTestVersion({})).toBe(DEFAULT_VSCODE_TEST_VERSION);
  });

  it('passes explicit canary lane selectors through to test-electron', () => {
    expect(
      resolveVsCodeTestVersion({
        KICADSTUDIO_VSCODE_VERSION: ' insiders '
      })
    ).toBe('insiders');
    expect(
      resolveVsCodeTestVersion({
        KICADSTUDIO_VSCODE_VERSION: '1.122.0'
      })
    ).toBe('1.122.0');
  });

  it('#628 retries transient VS Code host download failures without hiding terminal errors', async () => {
    const transient = Object.assign(new AggregateError([], 'network timeout'), {
      code: 'ETIMEDOUT'
    });
    const download = jest
      .fn<Promise<string>, [string]>()
      .mockRejectedValueOnce(transient)
      .mockResolvedValue('/tmp/vscode');
    const delays: number[] = [];

    await expect(
      downloadVsCodeWithRetry('1.122.0', download, {
        attempts: 3,
        baseDelayMs: 10,
        sleep: async (delayMs: number) => {
          delays.push(delayMs);
        }
      })
    ).resolves.toBe('/tmp/vscode');

    expect(download).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([10]);

    const terminal = new Error('Version 9.9.9 is unavailable');
    download.mockReset();
    download.mockRejectedValue(terminal);
    await expect(
      downloadVsCodeWithRetry('9.9.9', download, {
        attempts: 3,
        baseDelayMs: 0
      })
    ).rejects.toBe(terminal);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('#628 stops after the bounded VS Code host download retry budget', async () => {
    const transient = Object.assign(new Error('socket reset'), {
      code: 'ECONNRESET'
    });
    const download = jest
      .fn<Promise<string>, [string]>()
      .mockRejectedValue(transient);

    await expect(
      downloadVsCodeWithRetry('1.122.0', download, {
        attempts: 3,
        baseDelayMs: 0
      })
    ).rejects.toBe(transient);
    expect(download).toHaveBeenCalledTimes(3);
  });

  it('selects the dedicated canary host suite only when requested', () => {
    expect(resolveVsCodeTestSuite({})).toBe('suite');
    expect(
      resolveVsCodeTestSuite({
        KICADSTUDIO_VSCODE_TEST_SUITE: ' canary '
      })
    ).toBe('canarySuite');
  });
});
