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
    item.description = describe(element);
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

function describe(row: ValidationRow): string {
  const { summary } = row;
  if (!summary) {
    return `Not run - Run ${row.label}`;
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
    ...(row.summary.fileUri ? [`URI: ${row.summary.fileUri}`] : []),
    ...(row.summary.projectName || row.summary.projectId
      ? [`Project: ${row.summary.projectName ?? row.summary.projectId}`]
      : []),
    `Freshness: ${row.summary.freshness ?? 'not recorded'}`,
    `Origin: ${row.summary.origin ?? 'not recorded'}`,
    ...(row.summary.capturedAt ? [`Last run: ${row.summary.capturedAt}`] : []),
    ...(row.summary.kicadVersion
      ? [`KiCad CLI: ${row.summary.kicadVersion}`]
      : []),
    ...(row.summary.reportPath ? [`Report: ${row.summary.reportPath}`] : []),
    ...(row.summary.commandArgs?.length
      ? [`Command: kicad-cli ${row.summary.commandArgs.join(' ')}`]
      : []),
    ...(row.summary.staleReason
      ? [`Stale reason: ${row.summary.staleReason}`]
      : []),
    ...(row.summary.failureMessage
      ? [`Failure: ${row.summary.failureMessage}`]
      : []),
    ...(row.summary.lastGoodCapturedAt
      ? [`Last good result: ${row.summary.lastGoodCapturedAt}`]
      : []),
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
    case 'STALE':
      return 'history';
    case 'FAILED':
      return 'error';
    case 'RUNNING':
      return 'sync';
    case 'PENDING':
      return 'play-circle';
  }
}

type ValidationStatus =
  | 'PENDING'
  | 'PASS'
  | 'WARN'
  | 'FAIL'
  | 'STALE'
  | 'FAILED'
  | 'RUNNING';

function statusFor(summary: DiagnosticSummary | undefined): ValidationStatus {
  if (!summary) {
    return 'PENDING';
  }
  if (summary.freshness === 'stale') {
    return 'STALE';
  }
  if (summary.freshness === 'failed') {
    return 'FAILED';
  }
  if (summary.freshness === 'running') {
    return 'RUNNING';
  }
  if (summary.freshness === 'never-run') {
    return 'PENDING';
  }
  if (summary.freshness === 'fresh-clean') {
    return 'PASS';
  }
  if (summary.errors > 0) {
    return 'FAIL';
  }
  return summary.warnings > 0 ? 'WARN' : 'PASS';
}
