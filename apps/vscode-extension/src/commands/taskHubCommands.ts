import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { TASK_GROUPS, type TaskGroup } from './taskHubCatalog';

interface TaskGroupQuickPickItem extends vscode.QuickPickItem {
  readonly taskCommand: TaskGroup['command'];
}

interface TaskActionQuickPickItem extends vscode.QuickPickItem {
  readonly command: TaskGroup['actions'][number]['command'];
}

async function openTaskHub(): Promise<void> {
  const selection = await vscode.window.showQuickPick<TaskGroupQuickPickItem>(
    TASK_GROUPS.map((group) => ({
      label: `${group.icon} ${group.label}`,
      description: group.description,
      taskCommand: group.command
    })),
    {
      placeHolder: 'Choose what you want to do with this KiCad project',
      matchOnDescription: true
    }
  );

  if (selection) {
    await vscode.commands.executeCommand(selection.taskCommand);
  }
}

async function openTaskGroup(group: TaskGroup): Promise<void> {
  const selection = await vscode.window.showQuickPick<TaskActionQuickPickItem>(
    group.actions.map((action) => ({
      label: action.label,
      description: action.description,
      command: action.command
    })),
    {
      placeHolder: group.placeholder,
      matchOnDescription: true
    }
  );

  if (selection) {
    await vscode.commands.executeCommand(selection.command);
  }
}

export function registerTaskHubCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.openTaskHub, openTaskHub),
    ...TASK_GROUPS.map((group) =>
      vscode.commands.registerCommand(group.command, () => openTaskGroup(group))
    )
  ];
}
