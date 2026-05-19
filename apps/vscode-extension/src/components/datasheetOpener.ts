import * as vscode from 'vscode';

export async function openDatasheet(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    void vscode.window.showWarningMessage(
      'Datasheet URL is invalid and was not opened.'
    );
    return;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    void vscode.window.showWarningMessage(
      'Datasheet URL must use http or https.'
    );
    return;
  }

  await vscode.env.openExternal(vscode.Uri.parse(parsed.toString()));
}
