export const DEFAULT_VSCODE_TEST_VERSION = '1.120.0';

type TestEnvironment = Record<string, string | undefined>;

export type VsCodeTestSuite = 'suite' | 'canarySuite';

export function resolveVsCodeTestVersion(
  env: TestEnvironment = process.env
): string {
  return (
    env['KICADSTUDIO_VSCODE_VERSION']?.trim() || DEFAULT_VSCODE_TEST_VERSION
  );
}

export function resolveVsCodeTestSuite(
  env: TestEnvironment = process.env
): VsCodeTestSuite {
  return env['KICADSTUDIO_VSCODE_TEST_SUITE']?.trim() === 'canary'
    ? 'canarySuite'
    : 'suite';
}
