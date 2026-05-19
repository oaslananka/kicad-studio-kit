import * as vscode from 'vscode';

export function isWorkspaceTrusted(): boolean {
  return vscode.workspace.isTrusted !== false;
}

export async function requireWorkspaceTrust(feature: string): Promise<boolean> {
  if (isWorkspaceTrusted()) {
    return true;
  }
  void vscode.window.showWarningMessage(
    `${feature} requires a trusted workspace. Trust this workspace to run KiCad CLI, external KiCad, import, or export tooling.`
  );
  return false;
}

export function registerTrustedCommand<T extends unknown[]>(
  command: string,
  handler: (...args: T) => unknown | Promise<unknown>,
  feature: string
): vscode.Disposable {
  return vscode.commands.registerCommand(command, async (...args: T) => {
    if (!(await requireWorkspaceTrust(feature))) {
      return undefined;
    }
    return handler(...args);
  });
}
