import * as vscode from 'vscode';
import * as path from 'node:path';
import { COMMANDS } from '../constants';
import {
  TASK_GROUPS,
  type TaskAvailability,
  type TaskGroup,
  type TaskHubContext,
  type TaskRequirements
} from './taskHubCatalog';

const OPEN_PROJECT_COMMAND = 'workbench.action.files.openFolder';

interface TaskGroupQuickPickItem extends vscode.QuickPickItem {
  readonly taskCommand: TaskGroup['command'] | typeof OPEN_PROJECT_COMMAND;
}

interface TaskActionQuickPickItem extends vscode.QuickPickItem {
  readonly command?: TaskGroup['actions'][number]['command'];
  readonly openBoardForFabrication?: true;
}

export type TaskHubContextProvider = () =>
  TaskHubContext | Promise<TaskHubContext>;

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
  const availableGroups: TaskGroupQuickPickItem[] = TASK_GROUPS.filter(
    (group) => isAvailable(group.availability, context)
  ).map((group) => ({
    label: `${group.icon} ${group.label}`,
    description: group.description,
    taskCommand: group.command
  }));
  // Project source comes before task categories. This works without KiCad,
  // a workspace, an account or network access during extension activation.
  availableGroups.unshift(
    {
      label: '$(folder-opened) Local Projects',
      description: context.hasProject
        ? 'Choose an active KiCad project in this workspace'
        : 'Open a folder with KiCad project, PCB or schematic files',
      taskCommand: context.hasProject
        ? COMMANDS.selectActiveProject
        : OPEN_PROJECT_COMMAND
    },
    {
      label: '$(cloud) Cloud Projects',
      description:
        'Optional account and authorized project discovery; local files stay here',
      taskCommand: COMMANDS.cloudProjects
    }
  );
  const selection = await vscode.window.showQuickPick<TaskGroupQuickPickItem>(
    availableGroups,
    {
      title: 'KiCad Studio - Projects and Tasks',
      placeHolder: context.hasProject
        ? 'Choose a local or Cloud project source, or a project task'
        : 'Start with Local Projects or optional Cloud Projects',
      matchOnDescription: true
    }
  );

  if (selection) {
    await vscode.commands.executeCommand(selection.taskCommand);
  }
}

async function openBoardForFabrication(
  getContext: TaskHubContextProvider
): Promise<void> {
  // Use only boards inside the current workspace; navigating to an action
  // must never generate fabrication files or bypass release approval gates.
  const boards = await vscode.workspace.findFiles(
    '**/*.kicad_pcb',
    '**/{.git,node_modules,dist,build,backups}/**',
    100
  );
  if (!boards.length) {
    void vscode.window.showInformationMessage(
      'No .kicad_pcb file was found in this workspace. Open a folder containing a KiCad board first.'
    );
    return;
  }

  const selected =
    boards.length === 1
      ? boards[0]
      : (
          await vscode.window.showQuickPick(
            boards.map((uri) => {
              const folder = vscode.workspace.getWorkspaceFolder(uri);
              return {
                label: path.basename(uri.fsPath),
                description: folder
                  ? path.relative(folder.uri.fsPath, uri.fsPath)
                  : path.basename(uri.fsPath),
                uri
              };
            }),
            { placeHolder: 'Choose a PCB for fabrication outputs' }
          )
        )?.uri;
  if (!selected) {
    return;
  }

  await vscode.commands.executeCommand('vscode.open', selected);
  await openTaskGroup(getTaskGroup('release'), getContext, true);
}
async function openTaskGroup(
  group: TaskGroup,
  getContext: TaskHubContextProvider,
  boardJustOpened = false
): Promise<void> {
  const discoveredContext = await getContext();
  const context = boardJustOpened
    ? { ...discoveredContext, pcbOpen: true }
    : discoveredContext;
  if (!isAvailable(group.availability, context)) {
    return;
  }

  const actions: TaskActionQuickPickItem[] = group.actions
    .filter(
      (action) =>
        isAvailable(action.availability, context) &&
        meetsRequirements(action.requirements, context)
    )
    .map((action) => ({
      label: action.label,
      description: action.description,
      command: action.command
    }));

  if (group.id === 'release' && !context.pcbOpen) {
    actions.unshift({
      label: 'Open PCB for fabrication',
      description:
        'Choose a board to unlock Gerber and manufacturing package exports',
      openBoardForFabrication: true
    });
  }

  const selection = await vscode.window.showQuickPick<TaskActionQuickPickItem>(
    actions,
    {
      placeHolder: group.placeholder,
      matchOnDescription: true
    }
  );

  if (selection?.openBoardForFabrication) {
    await openBoardForFabrication(getContext);
  } else if (selection?.command) {
    await vscode.commands.executeCommand(selection.command);
  }
}

function getTaskGroup(id: TaskGroup['id']): TaskGroup {
  const group = TASK_GROUPS.find((candidate) => candidate.id === id);
  if (!group) {
    throw new Error(`Task group is not defined: ${id}`);
  }
  return group;
}

export function registerTaskHubCommands(
  getContext: TaskHubContextProvider
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.openTaskHub, () =>
      openTaskHub(getContext)
    ),
    vscode.commands.registerCommand(COMMANDS.openReviewTasks, () =>
      openTaskGroup(getTaskGroup('review'), getContext)
    ),
    vscode.commands.registerCommand(COMMANDS.openValidateTasks, () =>
      openTaskGroup(getTaskGroup('validate'), getContext)
    ),
    vscode.commands.registerCommand(COMMANDS.openReleaseTasks, () =>
      openTaskGroup(getTaskGroup('release'), getContext)
    ),
    vscode.commands.registerCommand(COMMANDS.openAutomateTasks, () =>
      openTaskGroup(getTaskGroup('automate'), getContext)
    ),
    vscode.commands.registerCommand(COMMANDS.openMaintainTasks, () =>
      openTaskGroup(getTaskGroup('maintain'), getContext)
    )
  ];
}
