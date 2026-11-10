import * as vscode from 'vscode';
import * as path from 'node:path';
import { COMMANDS } from '../constants';
import { localize } from '../i18n';
import type { DiagnosticSummary } from '../types';
import type { DiagnosticStateStore } from '../state/stateStores';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';

export interface ValidationRow {
  label: 'DRC' | 'ERC';
  summary: DiagnosticSummary | undefined;
}

interface ErcSourceFinding {
  kind: 'verified-erc-source';
  label: string;
  message: string;
  location: vscode.Location;
}

type ValidationTreeRow = ValidationRow | ErcSourceFinding;

const MAX_VISIBLE_SOURCE_FINDINGS = 200;
const EXACT_ERC_LOCATION_MESSAGE =
  'Exact KiCad source UUID location (open related information)';

export class ValidationViewProvider
  implements vscode.TreeDataProvider<ValidationTreeRow>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    ValidationTreeRow | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly subscription: vscode.Disposable;
  private readonly trustSubscription: vscode.Disposable;

  constructor(private readonly diagnostics: DiagnosticStateStore) {
    this.subscription = diagnostics.onDidChange(() =>
      this.onDidChangeTreeDataEmitter.fire(undefined)
    );
    this.trustSubscription = vscode.workspace.onDidGrantWorkspaceTrust(() =>
      this.onDidChangeTreeDataEmitter.fire(undefined)
    );
  }

  getTreeItem(element: ValidationTreeRow): vscode.TreeItem {
    if ('kind' in element) {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None
      );
      const source = element.location;
      item.description = `${path.basename(source.uri.fsPath)}:${source.range.start.line + 1}`;
      item.tooltip = `${element.message}\n${source.uri.fsPath}:${source.range.start.line + 1}:${source.range.start.character + 1}`;
      item.iconPath = new vscode.ThemeIcon(
        isWorkspaceTrusted() ? 'go-to-file' : 'lock'
      );
      if (isWorkspaceTrusted()) {
        item.command = {
          command: COMMANDS.revealVerifiedErcSource,
          title: 'Open exact ERC source',
          arguments: [source.uri, source.range]
        };
      }
      return item;
    }

    const hasVerifiedSources =
      element.label === 'ERC' && this.verifiedErcSources().length > 0;
    const item = new vscode.TreeItem(
      element.label,
      hasVerifiedSources
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    const trusted = isWorkspaceTrusted();
    // Keep existing results visible, but do not advertise a runnable check
    // when VS Code Restricted Mode blocks all CLI validation.
    item.description =
      !trusted && !element.summary
        ? 'Trust workspace to run checks'
        : describe(element);
    item.tooltip = trusted
      ? tooltip(element)
      : [
          tooltip(element),
          'Trust this workspace to run DRC and ERC checks.'
        ].join('\n');
    item.iconPath = new vscode.ThemeIcon(
      !trusted && !element.summary ? 'lock' : iconFor(element.summary)
    );
    if (trusted) {
      item.command = {
        command: element.label === 'DRC' ? COMMANDS.runDRC : COMMANDS.runERC,
        title: localize('runValidation', { label: element.label })
      };
    }
    return item;
  }

  getChildren(element?: ValidationTreeRow): ValidationTreeRow[] {
    if (element) {
      if ('kind' in element) return [];
      if (element.label === 'ERC') return this.verifiedErcSources();
      return [];
    }
    const snapshot = this.diagnostics.getSnapshot();
    return [
      { label: 'DRC', summary: snapshot.drc },
      { label: 'ERC', summary: snapshot.erc }
    ];
  }

  private verifiedErcSources(): ErcSourceFinding[] {
    const latest = this.diagnostics.getLatestErcRun();
    if (
      !latest ||
      this.diagnostics.getSnapshot().erc?.freshness !== 'fresh-dirty'
    )
      return [];
    const findings: ErcSourceFinding[] = [];
    for (const diagnostic of latest.diagnostics) {
      if (diagnostic.source !== 'kicad-cli:erc') continue;
      const source = diagnostic.relatedInformation?.find(
        (entry) =>
          entry.message === EXACT_ERC_LOCATION_MESSAGE &&
          entry.location.uri.scheme === 'file' &&
          entry.location.uri.fsPath.toLowerCase().endsWith('.kicad_sch')
      )?.location;
      if (!source) continue;
      findings.push({
        kind: 'verified-erc-source',
        label: diagnostic.message.replace(/\s+/g, ' ').slice(0, 120),
        message: diagnostic.message,
        location: source
      });
      if (findings.length >= MAX_VISIBLE_SOURCE_FINDINGS) break;
    }
    return findings;
  }

  dispose(): void {
    this.subscription.dispose();
    this.trustSubscription.dispose();
    this.onDidChangeTreeDataEmitter.dispose();
  }
}

function describe(row: ValidationRow): string {
  const { summary } = row;
  if (!summary) {
    return localize('diagnosticPendingRunAction', { label: row.label });
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
  'PENDING' | 'PASS' | 'WARN' | 'FAIL' | 'STALE' | 'FAILED' | 'RUNNING';

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
