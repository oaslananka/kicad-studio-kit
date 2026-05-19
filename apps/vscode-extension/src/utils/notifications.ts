import * as vscode from 'vscode';
import type { StructuredMcpError } from '../types';

export async function showStructuredError(
  error: StructuredMcpError,
  docsUri?: vscode.Uri
): Promise<void> {
  const shortHint =
    error.hint && error.hint.length <= 120 ? `\n${error.hint}` : '';
  const choice = await vscode.window.showErrorMessage(
    `${error.message}${shortHint}`,
    'What does this mean?'
  );
  if (choice === 'What does this mean?' && docsUri) {
    await vscode.commands.executeCommand('vscode.open', docsUri);
  }
}

export function structuredErrorFromUnknown(
  error: unknown
): StructuredMcpError | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  const code = typeof error['code'] === 'string' ? error['code'] : undefined;
  const message =
    typeof error['message'] === 'string' ? error['message'] : undefined;
  if (!code || !message) {
    return undefined;
  }
  return {
    code,
    message,
    hint: typeof error['hint'] === 'string' ? error['hint'] : undefined
  };
}

export function troubleshootingUri(
  extensionUri: vscode.Uri,
  code: string
): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, 'docs', 'troubleshooting.md').with({
    fragment: code.toLowerCase().replace(/_/g, '-')
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
