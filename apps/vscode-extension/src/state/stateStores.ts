import * as vscode from 'vscode';
import type {
  DiagnosticFreshness,
  DiagnosticSummary,
  ProjectContext
} from '../types';

export {
  ProjectStateStore,
  type ProjectStateSnapshot
} from './projectStateStore';
export {
  ExportStateStore,
  type ExportStateSnapshot,
  type ExportSurfaceKind
} from './exportStateStore';
export { McpStateStore } from './mcpStateStore';
export { ViewerStateStore, type ViewerStateSnapshot } from './viewerStateStore';

export interface DiagnosticStateSnapshot {
  drc: DiagnosticSummary | undefined;
  erc: DiagnosticSummary | undefined;
  activeProjectId: string | undefined;
  projects: Array<{
    projectId: string;
    drc: DiagnosticSummary | undefined;
    erc: DiagnosticSummary | undefined;
  }>;
}

type ValidationSource = Extract<DiagnosticSummary['source'], 'drc' | 'erc'>;

interface LatestValidationRun {
  file: string;
  diagnostics: vscode.Diagnostic[];
  summary: DiagnosticSummary;
}

type LatestDrcRun = LatestValidationRun;

interface ProjectDiagnostics {
  drc: DiagnosticSummary | undefined;
  erc: DiagnosticSummary | undefined;
  latestDrcRun: LatestDrcRun | undefined;
  latestErcRun: LatestValidationRun | undefined;
}

export class DiagnosticStateStore implements vscode.Disposable {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<DiagnosticStateSnapshot>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private drc: DiagnosticSummary | undefined;
  private erc: DiagnosticSummary | undefined;
  private latestDrcRun: LatestDrcRun | undefined;
  private latestErcRun: LatestValidationRun | undefined;
  private activeProjectId: string | undefined;
  private readonly projectDiagnostics = new Map<string, ProjectDiagnostics>();

  constructor(private readonly diagnostics: vscode.DiagnosticCollection) {}

  setActiveProject(projectId: string | undefined): DiagnosticStateSnapshot {
    this.activeProjectId = projectId;
    const snapshot = this.getSnapshot();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }

  applyValidationResult(
    uri: vscode.Uri,
    diagnostics: readonly vscode.Diagnostic[],
    summary: DiagnosticSummary,
    options: { project?: ProjectContext | undefined; projectId?: string } = {}
  ): DiagnosticStateSnapshot {
    this.diagnostics.set(uri, diagnostics);
    const projectId = options.project?.id ?? options.projectId;
    const projectState = this.getOrCreateProjectDiagnostics(projectId);
    const nextSummary = normalizeDiagnosticSummary(summary, {
      uri,
      project: options.project,
      projectId
    });

    if (nextSummary.source === 'drc') {
      this.drc = nextSummary;
      this.latestDrcRun = {
        file: nextSummary.file,
        diagnostics: [...diagnostics],
        summary: nextSummary
      };
      if (projectState) {
        projectState.drc = nextSummary;
        projectState.latestDrcRun = {
          file: nextSummary.file,
          diagnostics: [...diagnostics],
          summary: nextSummary
        };
      }
    }
    if (nextSummary.source === 'erc') {
      this.erc = nextSummary;
      this.latestErcRun = {
        file: nextSummary.file,
        diagnostics: [...diagnostics],
        summary: nextSummary
      };
      if (projectState) {
        projectState.erc = nextSummary;
        projectState.latestErcRun = {
          file: nextSummary.file,
          diagnostics: [...diagnostics],
          summary: nextSummary
        };
      }
    }
    if (projectId && projectState) {
      this.projectDiagnostics.set(projectId, projectState);
    }
    const snapshot = this.getSnapshot();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }

  recordValidationFailure(
    source: ValidationSource,
    uri: vscode.Uri,
    error: unknown,
    options: { project?: ProjectContext | undefined; projectId?: string } = {}
  ): DiagnosticStateSnapshot {
    const projectId = options.project?.id ?? options.projectId;
    const projectState = this.getOrCreateProjectDiagnostics(projectId);
    const previous =
      this.getSummaryForSource(source, projectState) ??
      this.getSummaryForSource(source);
    const nextSummary = normalizeDiagnosticSummary(
      {
        ...(previous ?? {
          file: uri.fsPath,
          errors: 0,
          warnings: 0,
          infos: 0,
          source
        }),
        file: previous?.file ?? uri.fsPath,
        source,
        freshness: 'failed',
        failureMessage: formatErrorMessage(error),
        lastGoodCapturedAt: lastGoodTimestamp(previous),
        capturedAt: new Date().toISOString()
      },
      { uri, project: options.project, projectId }
    );

    this.setSummaryForSource(source, nextSummary, projectState);
    if (projectId && projectState) {
      this.projectDiagnostics.set(projectId, projectState);
    }
    const snapshot = this.getSnapshot();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }

  markStaleForResource(
    uri: vscode.Uri,
    reason: string,
    options: { project?: ProjectContext | undefined; projectId?: string } = {}
  ): DiagnosticStateSnapshot {
    const source = validationSourceForUri(uri);
    if (!source) {
      return this.getSnapshot();
    }
    return this.markValidationStale(source, uri, reason, options);
  }

  markValidationStale(
    source: ValidationSource,
    uri: vscode.Uri,
    reason: string,
    options: { project?: ProjectContext | undefined; projectId?: string } = {}
  ): DiagnosticStateSnapshot {
    const projectId = options.project?.id ?? options.projectId;
    const projectState = this.getOrCreateProjectDiagnostics(projectId);
    const previous =
      this.getSummaryForSource(source, projectState) ??
      this.getSummaryForSource(source);
    if (!previous) {
      return this.getSnapshot();
    }

    const nextSummary = normalizeDiagnosticSummary(
      {
        ...previous,
        file: previous.file || uri.fsPath,
        source,
        freshness: 'stale',
        staleReason: reason,
        lastGoodCapturedAt: lastGoodTimestamp(previous)
      },
      { uri, project: options.project, projectId }
    );
    this.setSummaryForSource(source, nextSummary, projectState);
    this.markProblemsDiagnosticsStale(source, uri, reason, projectState);
    if (projectId && projectState) {
      this.projectDiagnostics.set(projectId, projectState);
    }
    const snapshot = this.getSnapshot();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }

  getLatestDrcRun(projectId?: string | undefined): LatestDrcRun | undefined {
    const latest = projectId
      ? this.projectDiagnostics.get(projectId)?.latestDrcRun
      : this.activeProjectId
        ? (this.projectDiagnostics.get(this.activeProjectId)?.latestDrcRun ??
          this.latestDrcRun)
        : this.latestDrcRun;
    return latest
      ? {
          file: latest.file,
          diagnostics: [...latest.diagnostics],
          summary: cloneSummary(latest.summary)
        }
      : undefined;
  }

  getSnapshot(
    options: { projectId?: string | undefined } = {}
  ): DiagnosticStateSnapshot {
    const projectId = options.projectId ?? this.activeProjectId;
    const projectState = projectId
      ? this.projectDiagnostics.get(projectId)
      : undefined;
    const useProjectScope = Boolean(projectId);
    return {
      drc: projectState?.drc
        ? cloneSummary(projectState.drc)
        : useProjectScope
          ? undefined
          : this.drc
            ? cloneSummary(this.drc)
            : undefined,
      erc: projectState?.erc
        ? cloneSummary(projectState.erc)
        : useProjectScope
          ? undefined
          : this.erc
            ? cloneSummary(this.erc)
            : undefined,
      activeProjectId: this.activeProjectId,
      projects: [...this.projectDiagnostics.entries()].map(
        ([entryProjectId, state]) => ({
          projectId: entryProjectId,
          drc: state.drc ? cloneSummary(state.drc) : undefined,
          erc: state.erc ? cloneSummary(state.erc) : undefined
        })
      )
    };
  }

  getDiagnosticBundleSnapshot(): DiagnosticStateSnapshot {
    return this.getSnapshot();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private getOrCreateProjectDiagnostics(
    projectId: string | undefined
  ): ProjectDiagnostics | undefined {
    return projectId
      ? (this.projectDiagnostics.get(projectId) ?? {
          drc: undefined,
          erc: undefined,
          latestDrcRun: undefined,
          latestErcRun: undefined
        })
      : undefined;
  }

  private getSummaryForSource(
    source: ValidationSource,
    projectState?: ProjectDiagnostics | undefined
  ): DiagnosticSummary | undefined {
    if (projectState) {
      return source === 'drc' ? projectState.drc : projectState.erc;
    }
    return source === 'drc' ? this.drc : this.erc;
  }

  private setSummaryForSource(
    source: ValidationSource,
    summary: DiagnosticSummary,
    projectState?: ProjectDiagnostics | undefined
  ): void {
    if (source === 'drc') {
      this.drc = summary;
      if (projectState) {
        projectState.drc = summary;
      }
      return;
    }
    this.erc = summary;
    if (projectState) {
      projectState.erc = summary;
    }
  }

  private getLatestRunForSource(
    source: ValidationSource,
    projectState?: ProjectDiagnostics | undefined
  ): LatestValidationRun | undefined {
    if (source === 'drc') {
      return projectState?.latestDrcRun ?? this.latestDrcRun;
    }
    return projectState?.latestErcRun ?? this.latestErcRun;
  }

  private markProblemsDiagnosticsStale(
    source: ValidationSource,
    uri: vscode.Uri,
    reason: string,
    projectState?: ProjectDiagnostics | undefined
  ): void {
    const latest = this.getLatestRunForSource(source, projectState);
    if (!latest?.diagnostics.length) {
      return;
    }
    this.diagnostics.set(
      uri,
      latest.diagnostics.map((diagnostic) =>
        cloneStaleDiagnostic(diagnostic, source, reason)
      )
    );
  }
}

function cloneSummary(summary: DiagnosticSummary): DiagnosticSummary {
  return {
    ...summary,
    commandArgs: summary.commandArgs ? [...summary.commandArgs] : undefined
  };
}

function normalizeDiagnosticSummary(
  summary: DiagnosticSummary,
  context: {
    uri?: vscode.Uri | undefined;
    project?: ProjectContext | undefined;
    projectId?: string | undefined;
  } = {}
): DiagnosticSummary {
  const next = cloneSummary(summary);
  next.fileUri = next.fileUri ?? context.uri?.toString();
  next.projectId = next.projectId ?? context.project?.id ?? context.projectId;
  next.projectName = next.projectName ?? context.project?.name;
  next.origin = next.origin ?? defaultDiagnosticOrigin(next.source);
  next.freshness = next.freshness ?? inferDiagnosticFreshness(next);
  return next;
}

function inferDiagnosticFreshness(
  summary: DiagnosticSummary
): DiagnosticFreshness {
  return summary.errors + summary.warnings + summary.infos > 0
    ? 'fresh-dirty'
    : 'fresh-clean';
}

function defaultDiagnosticOrigin(
  source: DiagnosticSummary['source']
): NonNullable<DiagnosticSummary['origin']> {
  return source === 'syntax' ? 'syntax' : 'kicad-cli';
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function lastGoodTimestamp(
  summary: DiagnosticSummary | undefined
): string | undefined {
  if (!summary) {
    return undefined;
  }
  if (
    summary.freshness === 'fresh-clean' ||
    summary.freshness === 'fresh-dirty' ||
    !summary.freshness
  ) {
    return summary.capturedAt;
  }
  return summary.lastGoodCapturedAt;
}

function validationSourceForUri(uri: vscode.Uri): ValidationSource | undefined {
  const filePath = uri.fsPath.toLowerCase();
  if (filePath.endsWith('.kicad_pcb')) {
    return 'drc';
  }
  if (filePath.endsWith('.kicad_sch')) {
    return 'erc';
  }
  return undefined;
}

function cloneStaleDiagnostic(
  diagnostic: vscode.Diagnostic,
  source: ValidationSource,
  reason: string
): vscode.Diagnostic {
  const stale = new vscode.Diagnostic(
    diagnostic.range,
    `[stale] ${diagnostic.message} (${reason})`,
    diagnostic.severity
  );
  stale.source = `${diagnostic.source ?? `kicad-cli:${source}`}:stale`;
  if (typeof diagnostic.code !== 'undefined') {
    stale.code = diagnostic.code;
  }
  if (diagnostic.relatedInformation) {
    stale.relatedInformation = [...diagnostic.relatedInformation];
  }
  if (diagnostic.tags) {
    stale.tags = [...diagnostic.tags];
  }
  return stale;
}
