import {
  DEFAULT_VSCODE_TEST_VERSION,
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
        KICADSTUDIO_VSCODE_VERSION: '1.120.0'
      })
    ).toBe('1.120.0');
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
