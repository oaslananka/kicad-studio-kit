import * as vscode from 'vscode';
import {
  CloudSessionController,
  cloudManageAccessUri
} from '../mcp/cloudSession';
import { CloudUnauthorizedError } from '../mcp/cloudOAuthContract';
import { COMMANDS } from '../constants';

export function registerCloudCommands(
  extensionContext: vscode.ExtensionContext
): vscode.Disposable[] {
  const cloud = new CloudSessionController(extensionContext);
  extensionContext.subscriptions.push(cloud);

  function describeProjectAvailability(
    available: boolean,
    reason?: string
  ): string {
    if (available) {
      return 'Cloud read operations may be available with owner approval';
    }
    if (reason === 'cloud_read_not_enabled') {
      return 'Cloud read access is disabled for this project';
    }
    return 'No live remote design operation is available';
  }

  async function showProjects(): Promise<void> {
    let inventory: Awaited<ReturnType<typeof cloud.listAuthorizedProjects>>;
    try {
      inventory = await cloud.listAuthorizedProjects();
    } catch (error) {
      let message = 'Cloud is unavailable.';
      if (error instanceof CloudUnauthorizedError) {
        message = 'Cloud session expired or access was revoked. Sign in again.';
      } else if (error instanceof Error) {
        message = error.message;
      }
      const action = await vscode.window.showWarningMessage(
        message,
        'Sign in to Cloud',
        'Cancel'
      );
      if (action === 'Sign in to Cloud') {
        await vscode.commands.executeCommand(COMMANDS.cloudSignIn);
      }
      return;
    }

    if (inventory.projects.length === 0) {
      const action = await vscode.window.showInformationMessage(
        inventory.devices.length === 0
          ? 'No devices or projects are authorized for this Cloud account. Local KiCad Studio remains available.'
          : 'No projects are granted to Studio. Manage access in your Cloud account to enable a project.',
        'Manage Cloud Access'
      );
      if (action === 'Manage Cloud Access') {
        await vscode.env.openExternal(cloudManageAccessUri());
      }
      return;
    }

    const selection = await vscode.window.showQuickPick(
      inventory.projects.map((project) => ({
        label: `$(circuit-board) ${project.alias}`,
        description: project.connectorConnected
          ? 'Connector online'
          : 'Connector offline',
        detail: describeProjectAvailability(project.available, project.reason),
        project
      })),
      {
        title: 'Cloud Projects - authorized account',
        placeHolder:
          'Select a remote project (does not replace your local project)',
        matchOnDescription: true
      }
    );
    if (!selection) return;
    await cloud.selectRemoteProject(selection.project);
    const action = await vscode.window.showInformationMessage(
      `Selected Cloud project "${selection.project.alias}". No local design was changed. Remote design preview and editing are not available in this Studio version.`,
      'Manage Cloud Access'
    );
    if (action === 'Manage Cloud Access') {
      await vscode.env.openExternal(cloudManageAccessUri());
    }
  }

  return [
    vscode.commands.registerCommand(COMMANDS.cloudSignIn, async () => {
      try {
        if (!(await cloud.isSignedIn())) {
          await cloud.signIn();
        }
        await showProjects();
      } catch (error) {
        void vscode.window.showErrorMessage(
          error instanceof Error ? error.message : 'Cloud sign-in failed.'
        );
      }
    }),
    vscode.commands.registerCommand(COMMANDS.cloudProjects, showProjects),
    vscode.commands.registerCommand(COMMANDS.cloudSignOut, async () => {
      await cloud.signOut();
      void vscode.window.showInformationMessage(
        'Signed out of Studio Cloud. Your device registrations and project files were not changed.'
      );
    })
  ];
}
