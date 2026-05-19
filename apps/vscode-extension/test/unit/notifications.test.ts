import * as vscode from 'vscode';
import {
  showStructuredError,
  structuredErrorFromUnknown,
  troubleshootingUri
} from '../../src/utils/notifications';
import { commands, window } from './vscodeMock';

describe('structured MCP notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders short hints and opens docs from the action', async () => {
    (window.showErrorMessage as jest.Mock).mockResolvedValue(
      'What does this mean?'
    );
    const docsUri = vscode.Uri.file('/docs/troubleshooting.md');

    await showStructuredError(
      {
        code: 'VALIDATION_FAILED',
        message: 'Gate failed',
        hint: 'Fix blocking gates.'
      },
      docsUri
    );

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Fix blocking gates.'),
      'What does this mean?'
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'vscode.open',
      docsUri
    );
  });

  it('normalizes unknown errors with code and message fields', () => {
    expect(
      structuredErrorFromUnknown({
        code: 'CLI_TIMEOUT',
        message: 'Timed out',
        hint: 'Retry'
      })
    ).toEqual({
      code: 'CLI_TIMEOUT',
      message: 'Timed out',
      hint: 'Retry'
    });
    expect(structuredErrorFromUnknown(new Error('plain'))).toBeUndefined();
  });

  it('builds troubleshooting anchors from structured error codes', () => {
    const uri = troubleshootingUri(
      vscode.Uri.file('/extension'),
      'CLI_TIMEOUT'
    );
    expect(uri.fsPath.replace(/\\/g, '/')).toContain(
      '/extension/docs/troubleshooting.md'
    );
    expect(uri.fragment).toBe('cli-timeout');
  });
});
