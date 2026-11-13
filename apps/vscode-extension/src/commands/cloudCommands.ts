import * as vscode from 'vscode';
import {
  CloudSessionController,
  cloudManageAccessUri
} from '../mcp/cloudSession';
import {
  CloudPermissionError,
  CloudUnauthorizedError,
  type CloudDevice,
  type CloudProject
} from '../mcp/cloudOAuthContract';
import { COMMANDS } from '../constants';

function describeProjectAvailability(
  available: boolean,
  reason?: string
): string {
  if (available) {
    return 'Project listed; remote preview and editing are not supported';
  }
  if (reason === 'cloud_read_not_enabled') {
    return 'Cloud read access is disabled for this project';
  }
  return 'No live remote design operation is available';
}

interface CloudProjectPick extends vscode.QuickPickItem {
  project?: CloudProject;
  manageAccess?: true;
}

function cloudProjectItem(
  project: CloudProject,
  device: CloudDevice | undefined
): CloudProjectPick {
  const deviceStatus = device?.connected ? 'Device online' : 'Device offline';
  const connectorStatus = project.connectorConnected
    ? 'Connector online'
    : 'Connector offline';
  let detail = describeProjectAvailability(project.available, project.reason);
  if (!device?.connected) {
    detail = 'Reconnect this device in Cloud before remote operations';
  } else if (!project.connectorConnected) {
    detail = 'Connector offline - check device and Cloud permissions';
  }
  return {
    label: `$(circuit-board) ${project.alias}`,
    description: `${device?.name || 'Unknown device'} - ${deviceStatus} - ${connectorStatus}`,
    detail,
    project
  };
}

export function registerCloudCommands(
  extensionContext: vscode.ExtensionContext
): vscode.Disposable[] {
  const cloud = new CloudSessionController(extensionContext);
  extensionContext.subscriptions.push(cloud);

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
      const actionLabel =
        error instanceof CloudPermissionError
          ? 'Manage Cloud Access'
          : 'Sign in to Cloud';
      const action = await vscode.window.showWarningMessage(
        message,
        actionLabel,
        'Cancel'
      );
      if (action === 'Manage Cloud Access') {
        await vscode.env.openExternal(cloudManageAccessUri());
      } else if (action === 'Sign in to Cloud') {
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

    const devicesById = new Map(
      inventory.devices.map((device) => [device.id, device])
    );
    const entries: CloudProjectPick[] = inventory.projects.map((project) =>
      cloudProjectItem(project, devicesById.get(project.deviceId))
    );
    entries.push({
      label: '$(shield) Manage Cloud Access',
      description: 'Review project grants and paired devices in your browser',
      manageAccess: true
    });
    const selection = await vscode.window.showQuickPick(entries, {
      title: 'Cloud Projects - authorized account',
      placeHolder: 'Choose a remote identity; your local project stays open',
      matchOnDescription: true,
      matchOnDetail: true
    });
    if (selection?.manageAccess) {
      await vscode.env.openExternal(cloudManageAccessUri());
      return;
    }
    if (!selection?.project) return;
    await cloud.selectRemoteProject(selection.project);
    const action = await vscode.window.showInformationMessage(
      `Selected Cloud project "${selection.project.alias}". No local design was changed. Remote preview and editing are not available in this Studio version.`,
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
