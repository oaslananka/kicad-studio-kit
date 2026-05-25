import * as vscode from 'vscode';

export type SidebarWorkflowStateKind =
  | 'empty'
  | 'loading'
  | 'error'
  | 'ready'
  | 'populated';

export interface SidebarWorkflowState {
  kind: 'sidebar-state';
  state: SidebarWorkflowStateKind;
  label: string;
  description: string;
  detail: string;
  icon: string;
  command?: vscode.Command | undefined;
}

export function sidebarState(
  state: SidebarWorkflowStateKind,
  label: string,
  description: string,
  detail: string,
  icon: string,
  command?: vscode.Command | undefined
): SidebarWorkflowState {
  return {
    kind: 'sidebar-state',
    state,
    label,
    description,
    detail,
    icon,
    command
  };
}

export function isSidebarWorkflowState(
  value: unknown
): value is SidebarWorkflowState {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as SidebarWorkflowState).kind === 'sidebar-state'
  );
}

export function sidebarStateTreeItem(
  state: SidebarWorkflowState
): vscode.TreeItem {
  const item = new vscode.TreeItem(
    state.label,
    vscode.TreeItemCollapsibleState.None
  );
  item.description = state.description;
  item.tooltip = `${state.label}\n${state.detail}`;
  item.contextValue = `sidebar-state-${state.state}`;
  item.iconPath = new vscode.ThemeIcon(state.icon);
  if (state.command) {
    item.command = state.command;
  }
  return item;
}
