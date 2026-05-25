import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { localize } from '../i18n';
import type { FixItem, McpConnectionState } from '../types';
import { isRecoverableMcpUnavailableError } from './mcpErrorMapper';
import type { FixQueueMcpAdapter } from './mcpToolAdapter';
import type { McpStateStore } from '../state/stateStores';
import {
  isSidebarWorkflowState,
  sidebarState,
  sidebarStateTreeItem,
  type SidebarWorkflowState
} from '../providers/sidebarWorkflowState';

class FixQueueTreeItem extends vscode.TreeItem {
  constructor(public readonly item: FixItem) {
    super(item.description, vscode.TreeItemCollapsibleState.None);
    this.description = item.tool;
    this.tooltip = item.preview ?? item.description;
    this.contextValue = `fix-${item.severity}`;
    this.command = {
      command: COMMANDS.applyFixQueueItem,
      title: 'Apply Fix',
      arguments: [item]
    };
    this.iconPath = new vscode.ThemeIcon(
      item.severity === 'error'
        ? 'error'
        : item.severity === 'warning'
          ? 'warning'
          : 'lightbulb'
    );
  }
}

type FixQueueNode = FixItem | SidebarWorkflowState;

export class FixQueueProvider implements vscode.TreeDataProvider<FixQueueNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    FixQueueNode | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private items: FixItem[] = [];
  private state: SidebarWorkflowState | undefined;

  constructor(
    private readonly adapter: FixQueueMcpAdapter,
    private readonly mcpState?: Pick<McpStateStore, 'getState'> | undefined
  ) {}

  getTreeItem(element: FixQueueNode): vscode.TreeItem {
    if (isSidebarWorkflowState(element)) {
      return sidebarStateTreeItem(element);
    }
    return new FixQueueTreeItem(element);
  }

  getChildren(): FixQueueNode[] {
    const state = this.mcpState?.getState();
    if (state && !supportsHttpFixQueue(state)) {
      return [
        sidebarState(
          'error',
          localize('fixQueueUnavailableLabel'),
          localize('fixQueueUnavailableDescription'),
          fixQueueBlockMessage(state),
          'warning',
          {
            command: COMMANDS.setupMcpIntegration,
            title: localize('fixQueueSetupMcpCommand')
          }
        )
      ];
    }
    return this.items.length
      ? this.items
      : [
          this.state ??
            sidebarState(
              'empty',
              localize('fixQueueEmptyLabel'),
              localize('fixQueueEmptyDescription'),
              localize('fixQueueEmptyDetail'),
              'lightbulb',
              {
                command: COMMANDS.retryMcp,
                title: localize('fixQueueRefreshCommand')
              }
            )
        ];
  }

  getFixesForUri(uri: vscode.Uri, range?: vscode.Range): FixItem[] {
    const target = normalizePath(uri.fsPath);
    return this.items.filter((item) => {
      if (!item.path || typeof item.line !== 'number') {
        return false;
      }
      if (normalizePath(item.path) !== target) {
        return false;
      }
      if (!range) {
        return true;
      }
      const line = Math.max(0, item.line - 1);
      return line >= range.start.line - 1 && line <= range.end.line + 1;
    });
  }

  async refresh(): Promise<void> {
    const state = this.mcpState?.getState();
    if (state && !supportsHttpFixQueue(state)) {
      this.items = [];
      this.state = undefined;
      this.onDidChangeTreeDataEmitter.fire(undefined);
      return;
    }
    try {
      this.items = await this.adapter.fetchFixQueue();
      this.state = this.items.length
        ? undefined
        : sidebarState(
            'empty',
            localize('fixQueueEmptyLabel'),
            localize('fixQueueEmptyDescription'),
            localize('fixQueueEmptyDetail'),
            'lightbulb',
            {
              command: COMMANDS.retryMcp,
              title: localize('fixQueueRefreshCommand')
            }
          );
    } catch (err) {
      // Swallow errors when MCP is connected via VS Code stdio (HTTP not
      // available) or when the server is temporarily unreachable, so the
      // tree view degrades gracefully instead of surfacing a raw error toast.
      if (!isRecoverableMcpUnavailableError(err)) {
        throw err;
      }
      this.items = [];
      this.state = sidebarState(
        'error',
        localize('fixQueueRefreshErrorLabel'),
        localize('fixQueueRefreshErrorDescription'),
        err instanceof Error ? err.message : String(err),
        'warning',
        {
          command: COMMANDS.retryMcp,
          title: localize('fixQueueRetryCommand')
        }
      );
    }
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async applyFixById(id: string): Promise<void> {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item) {
      await this.applyFix(item);
      return;
    }
    await this.adapter.applyFixById(id);
    await this.refresh();
  }

  async applyAll(): Promise<void> {
    const pending = this.items.filter((item) => item.status === 'pending');
    if (!pending.length) {
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      `Apply ${pending.length} MCP fix${pending.length === 1 ? '' : 'es'}?`,
      { modal: true },
      'Apply All',
      'Cancel'
    );
    if (choice !== 'Apply All') {
      return;
    }

    for (const item of [...pending]) {
      try {
        await this.applyFixInternal(item, { confirm: false });
      } catch {
        item.status = 'failed';
        break;
      }
    }
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async applyFix(item: FixItem): Promise<void> {
    await this.applyFixInternal(item, { confirm: true });
  }

  private async applyFixInternal(
    item: FixItem,
    options: { confirm: boolean }
  ): Promise<void> {
    const preview =
      item.preview ??
      (await this.adapter.previewToolCall({
        name: item.tool,
        arguments: item.args
      }));

    if (preview && options.confirm) {
      const document = await vscode.workspace.openTextDocument({
        content: preview,
        language: 'diff'
      });
      await vscode.window.showTextDocument(document);
    }

    const choice = options.confirm
      ? await vscode.window.showInformationMessage(
          `Apply fix: ${item.description}`,
          'Apply',
          'Cancel'
        )
      : 'Apply';

    if (choice !== 'Apply') {
      return;
    }

    await this.adapter.applyFixTool(item);
    item.status = 'done';
    this.onDidChangeTreeDataEmitter.fire(undefined);
    void vscode.window.showInformationMessage(`Applied: ${item.description}`);
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}

function supportsHttpFixQueue(state: McpConnectionState): boolean {
  return state.kind === 'Connected' && state.connected;
}

function fixQueueBlockMessage(state: McpConnectionState): string {
  return state.kind === 'VsCodeStdio'
    ? localize('fixQueueBlockStdio')
    : state.kind === 'Incompatible'
      ? localize('fixQueueBlockIncompatible')
      : localize('fixQueueBlockDefault');
}
