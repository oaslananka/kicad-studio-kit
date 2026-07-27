import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import {
  TASK_GROUPS,
  type TaskAvailability,
  type TaskGroup,
  type TaskHubContext,
  type TaskRequirements
} from './taskHubCatalog';

interface TaskGroupQuickPickItem extends vscode.QuickPickItem {
  readonly taskCommand: TaskGroup['command'];
}

interface TaskActionQuickPickItem extends vscode.QuickPickItem {
  readonly command: TaskGroup['actions'][number]['command'];
}

export type TaskHubContextProvider = () =>
  | TaskHubContext
  | Promise<TaskHubContext>;

function isAvailable(
  availability: TaskAvailability = 'always',
  context: TaskHubContext
): boolean {
  switch (availability) {
    case 'always':
      return true;
    case 'project':
      return context.hasProject;
    case 'trusted':
      return context.workspaceTrusted;
    case 'trustedProject':
      return context.hasProject && context.workspaceTrusted;
  }
}

function meetsRequirements(
  requirements: TaskRequirements | undefined,
  context: TaskHubContext
): boolean {
  if (!requirements) {
    return true;
  }
  const allSatisfied = (requirements.all ?? []).every((key) => context[key]);
  const anySatisfied =
    !requirements.any?.length || requirements.any.some((key) => context[key]);
  return allSatisfied && anySatisfied;
}

async function openTaskHub(getContext: TaskHubContextProvider): Promise<void> {
  const context = await getContext();
  const selection = await vscode.window.showQuickPick<TaskGroupQuickPickItem>(
    TASK_GROUPS.filter((group) => isAvailable(group.availability, context)).map(
      (group) => ({
        label: `${group.icon} ${group.label}`,
        description: group.description,
        taskCommand: group.command
      })
    ),
    {
      placeHolder: 'Choose what you want to do with this KiCad project',
      matchOnDescription: true
    }
  );

  if (selection) {
    await vscode.commands.executeCommand(selection.taskCommand);
  }
}

async function openTaskGroup(
  group: TaskGroup,
  getContext: TaskHubContextProvider
): Promise<void> {
  const context = await getContext();
  if (!isAvailable(group.availability, context)) {
    return;
  }

  const selection = await vscode.window.showQuickPick<TaskActionQuickPickItem>(
    group.actions
      .filter(
        (action) =>
          isAvailable(action.availability, context) &&
          meetsRequirements(action.requirements, context)
      )
      .map((action) => ({
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

export function registerTaskHubCommands(
  getContext: TaskHubContextProvider
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.openTaskHub, () =>
      openTaskHub(getContext)
    ),
    ...TASK_GROUPS.map((group) =>
      vscode.commands.registerCommand(group.command, () =>
        openTaskGroup(group, getContext)
      )
    )
  ];
}
