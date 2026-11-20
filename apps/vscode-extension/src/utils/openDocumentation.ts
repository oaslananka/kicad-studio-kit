import { execFile } from 'node:child_process';
import * as vscode from 'vscode';

/**
 * Local Linux desktops may be unable to complete VS Code's external URI
 * handoff even when their system URL handler works. Do not launch anything
 * on a remote extension host or in a headless session.
 */
async function openWithLocalLinuxBrowser(url: string): Promise<boolean> {
  if (
    process.platform !== 'linux' ||
    vscode.env.remoteName ||
    !(process.env['DISPLAY'] || process.env['WAYLAND_DISPLAY']) ||
    !process.env['XDG_CURRENT_DESKTOP']
  ) {
    return false;
  }

  try {
    if (new URL(url).protocol !== 'https:') {
      return false;
    }
  } catch {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    execFile(
      '/usr/bin/xdg-open',
      [url],
      { timeout: 4_000, windowsHide: true },
      (error) => resolve(error === null)
    );
  });
}

/**
 * A browser URL handler may never settle (for example in an isolated desktop
 * session). Offer a usable copyable link instead of leaving the user waiting.
 */
export async function openDocumentationWithRecovery(
  url: string,
  documentName: string
): Promise<void> {
  if (await openWithLocalLinuxBrowser(url)) {
    return;
  }

  let opened = false;
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    opened = await Promise.race([
      vscode.env.openExternal(vscode.Uri.parse(url)),
      new Promise<boolean>((resolve) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          resolve(false);
        }, 8_000);
      })
    ]);
  } catch {
    // Fall through to the copyable link if the OS handler rejects.
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }

  if (opened) {
    return;
  }

  const action = await vscode.window.showWarningMessage(
    timedOut
      ? `The ${documentName} is taking too long to open. You can copy its link.`
      : `The ${documentName} could not be opened in your browser.`,
    'Copy link'
  );

  if (action !== 'Copy link') {
    return;
  }

  try {
    await vscode.env.clipboard.writeText(url);
    const title = documentName.charAt(0).toUpperCase() + documentName.slice(1);
    void vscode.window.showInformationMessage(`${title} link copied.`);
  } catch {
    void vscode.window.showErrorMessage(
      `Could not copy the ${documentName} link: ${url}`
    );
  }
}
