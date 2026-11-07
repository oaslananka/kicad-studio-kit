import { downloadAndUnzipVSCode } from '@vscode/test-electron';

import {
  DEFAULT_VSCODE_TEST_VERSION,
  downloadVsCodeWithRetry
} from '../vscodeTestRuntime';

// Keep the initial VS Code download outside Playwright's per-test timeout.
// On cold GitHub runners the ~300 MB host could consume the entire test budget.
export default async function prepareVsCodeE2EHost(): Promise<void> {
  await downloadVsCodeWithRetry(DEFAULT_VSCODE_TEST_VERSION, (version) =>
    downloadAndUnzipVSCode({ version, timeout: 120_000 })
  );
}
