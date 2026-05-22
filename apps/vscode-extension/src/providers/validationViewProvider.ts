import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { localize } from '../i18n';
import type { DiagnosticSummary } from '../types';
import type { DiagnosticStateStore } from '../state/stateStores';

export interface ValidationRow {
  label: 'DRC' | 'ERC';
  summary: DiagnosticSummary | undefined;
}

export class ValidationViewProvider
  implements vscode.TreeDataProvider<ValidationRow>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    ValidationRow | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly diagnostics: DiagnosticStateStore) {
    this.subscription = diagnostics.onDidChange(() =>
      this.onDidChangeTreeDataEmitter.fire(undefined)
    );
  }

  getTreeItem(element: ValidationRow): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = describe(element.summary);
    item.tooltip = tooltip(element);
    item.iconPath = new vscode.ThemeIcon(iconFor(element.summary));
    item.command = {
      command: element.label === 'DRC' ? COMMANDS.runDRC : COMMANDS.runERC,
      title: localize('runValidation', { label: element.label })
    };
    return item;
  }

  getChildren(): ValidationRow[] {
    const snapshot = this.diagnostics.getSnapshot();
    return [
      { label: 'DRC', summary: snapshot.drc },
      { label: 'ERC', summary: snapshot.erc }
    ];
  }

  dispose(): void {
    this.subscription.dispose();
    this.onDidChangeTreeDataEmitter.dispose();
  }
}

function describe(summary: DiagnosticSummary | undefined): string {
  if (!summary) {
    return localize('diagnosticPendingNoCachedResult');
  }
  return localize('diagnosticSummary', {
    status: statusFor(summary),
    errors: summary.errors,
    warnings: summary.warnings
  });
}

function tooltip(row: ValidationRow): string {
  if (!row.summary) {
    return localize('diagnosticNotRun', { label: row.label });
  }
  return [
    localize('diagnosticStatusTooltip', {
      label: row.label,
      status: statusFor(row.summary)
    }),
    row.summary.file,
    localize('diagnosticErrors', { count: row.summary.errors }),
    localize('diagnosticWarnings', { count: row.summary.warnings }),
    localize('diagnosticInfos', { count: row.summary.infos })
  ].join('\n');
}

function iconFor(summary: DiagnosticSummary | undefined): string {
  switch (statusFor(summary)) {
    case 'FAIL':
      return 'error';
    case 'WARN':
      return 'warning';
    case 'PASS':
      return 'pass';
    case 'PENDING':
      return 'play-circle';
  }
}

function statusFor(
  summary: DiagnosticSummary | undefined
): 'PENDING' | 'PASS' | 'WARN' | 'FAIL' {
  if (!summary) {
    return 'PENDING';
  }
  if (summary.errors > 0) {
    return 'FAIL';
  }
  return summary.warnings > 0 ? 'WARN' : 'PASS';
}
