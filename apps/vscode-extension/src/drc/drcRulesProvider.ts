import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { localize } from '../i18n';
import { SExpressionParser, type SNode } from '../language/sExpressionParser';
import {
  isSidebarWorkflowState,
  sidebarState,
  sidebarStateTreeItem,
  type SidebarWorkflowState
} from '../providers/sidebarWorkflowState';

export interface DrcRuleItem {
  file: string;
  name: string;
  condition?: string | undefined;
  constraint?: string | undefined;
  range: vscode.Range;
}

class DrcRuleTreeItem extends vscode.TreeItem {
  constructor(public readonly item: DrcRuleItem) {
    super(item.name, vscode.TreeItemCollapsibleState.None);
    this.description = item.constraint ?? 'rule';
    this.tooltip = [item.condition, item.constraint].filter(Boolean).join('\n');
    this.contextValue = 'drc-rule';
    this.iconPath = new vscode.ThemeIcon('symbol-rule');
    this.command = {
      command: COMMANDS.revealDrcRule,
      title: 'Reveal DRC Rule',
      arguments: [item]
    };
  }
}

type DrcRulesNode = DrcRuleItem | SidebarWorkflowState;

export class DrcRulesProvider implements vscode.TreeDataProvider<DrcRulesNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    DrcRulesNode | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private items: DrcRuleItem[] = [];
  private state: SidebarWorkflowState | undefined;

  constructor(private readonly parser: SExpressionParser) {}

  refresh(): void {
    void this.load().then(() =>
      this.onDidChangeTreeDataEmitter.fire(undefined)
    );
  }

  getTreeItem(element: DrcRulesNode): vscode.TreeItem {
    if (isSidebarWorkflowState(element)) {
      return sidebarStateTreeItem(element);
    }
    return new DrcRuleTreeItem(element);
  }

  getChildren(): DrcRulesNode[] {
    return this.items.length ? this.items : this.state ? [this.state] : [];
  }

  async reveal(item: DrcRuleItem): Promise<void> {
    const document = await vscode.workspace.openTextDocument(item.file);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false
    });
    editor.selection = new vscode.Selection(item.range.start, item.range.end);
    editor.revealRange(item.range, vscode.TextEditorRevealType.InCenter);
  }

  private async load(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      '**/*.kicad_dru',
      '**/node_modules/**'
    );
    if (!files.length) {
      this.items = [];
      this.state = sidebarState(
        'empty',
        localize('drcRulesNoFileLabel'),
        localize('drcRulesNoFileDescription'),
        localize('drcRulesNoFileDetail'),
        'new-file',
        {
          command: COMMANDS.createDrcRulesFile,
          title: localize('drcRulesCreateOrOpenCommand')
        }
      );
      return;
    }

    try {
      this.items = files
        .map((file) => file.fsPath)
        .filter((file) => fs.existsSync(file))
        .flatMap((file) => this.parseFile(file));
      this.state = this.items.length
        ? undefined
        : sidebarState(
            'empty',
            localize('drcRulesNoCustomRulesLabel'),
            localize('drcRulesNoCustomRulesDescription'),
            localize('drcRulesNoCustomRulesDetail'),
            'symbol-rule'
          );
    } catch (error) {
      this.items = [];
      this.state = sidebarState(
        'error',
        localize('drcRulesLoadErrorLabel'),
        localize('drcRulesLoadErrorDescription'),
        error instanceof Error ? error.message : String(error),
        'error'
      );
    }
  }

  private parseFile(file: string): DrcRuleItem[] {
    const root = this.parser.parse(fs.readFileSync(file, 'utf8'));
    return this.parser.findAllNodes(root, 'rule').map((node, index) => {
      const name = readString(node, 1) ?? `Rule ${index + 1}`;
      const conditionNode = node.children?.find(
        (child) => getTag(child) === 'condition'
      );
      const constraintNode = node.children?.find(
        (child) => getTag(child) === 'constraint'
      );
      return {
        file,
        name,
        condition: conditionNode
          ? flattenNode(conditionNode).replace(/^condition\s*/, '')
          : undefined,
        constraint: constraintNode
          ? flattenNode(constraintNode).replace(/^constraint\s*/, '')
          : undefined,
        range: this.parser.getPosition(node)
      };
    });
  }
}

function getTag(node: SNode): string | undefined {
  const first = node.children?.[0];
  if (!first) {
    return undefined;
  }
  return first.type === 'atom' || first.type === 'string'
    ? String(first.value ?? '')
    : undefined;
}

function readString(node: SNode, index: number): string | undefined {
  const child = node.children?.[index];
  if (!child) {
    return undefined;
  }
  if (
    child.type === 'atom' ||
    child.type === 'string' ||
    child.type === 'number'
  ) {
    return String(child.value ?? '');
  }
  return undefined;
}

function flattenNode(node: SNode): string {
  if (!node.children?.length) {
    return String(node.value ?? '');
  }
  return node.children
    .map((child) => flattenNode(child))
    .join(' ')
    .trim();
}
