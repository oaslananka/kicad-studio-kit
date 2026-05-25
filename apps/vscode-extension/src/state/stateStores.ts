import * as vscode from 'vscode';
import type {
  DiagnosticSummary,
  McpCapabilityCard,
  McpConnectionState,
  McpInstallStatus,
  ProjectContext,
  McpServerCard,
  ViewerState
} from '../types';
import { cloneViewerEngineState } from '../providers/viewer/viewerEngine';
import { redactSensitiveText } from '../utils/secrets';
import {
  cloneProjectContext,
  findProjectForResource
} from '../workspace/projectContext';

export interface ProjectStateSnapshot {
  activeResource: string | undefined;
  activeProject: ProjectContext | undefined;
  projects: ProjectContext[];
  hasProject: boolean;
  hasVariants: boolean;
  workspaceTrusted: boolean;
}

interface ProjectState extends Omit<ProjectStateSnapshot, 'activeResource'> {
  activeResource: vscode.Uri | undefined;
  activeProject: ProjectContext | undefined;
  projects: ProjectContext[];
}

export class ProjectStateStore implements vscode.Disposable {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<ProjectStateSnapshot>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private state: ProjectState = {
    activeResource: undefined,
    activeProject: undefined,
    projects: [],
    hasProject: false,
    hasVariants: false,
    workspaceTrusted: false
  };

  update(update: Partial<ProjectState>): ProjectStateSnapshot {
    this.state = { ...this.state, ...update };
    const snapshot = this.getSnapshot();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }

  getSnapshot(): ProjectStateSnapshot {
    return {
      activeResource: this.state.activeResource?.toString(),
      activeProject: this.state.activeProject
        ? cloneProjectContext(this.state.activeProject)
        : undefined,
      projects: this.state.projects.map(cloneProjectContext),
      hasProject: this.state.hasProject,
      hasVariants: this.state.hasVariants,
      workspaceTrusted: this.state.workspaceTrusted
    };
  }

  getProjects(): ProjectContext[] {
    return this.state.projects.map(cloneProjectContext);
  }

  getActiveProject(): ProjectContext | undefined {
    return this.state.activeProject
      ? cloneProjectContext(this.state.activeProject)
      : undefined;
  }

  findProjectById(id: string | undefined): ProjectContext | undefined {
    const project = id
      ? this.state.projects.find((entry) => entry.id === id)
      : undefined;
    return project ? cloneProjectContext(project) : undefined;
  }

  findProjectForResource(
    resource: vscode.Uri | string | undefined
  ): ProjectContext | undefined {
    return findProjectForResource(this.state.projects, resource);
  }

  getDiagnosticBundleSnapshot(): ProjectStateSnapshot {
    return this.getSnapshot();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

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

interface LatestDrcRun {
  file: string;
  diagnostics: vscode.Diagnostic[];
  summary: DiagnosticSummary;
}

interface ProjectDiagnostics {
  drc: DiagnosticSummary | undefined;
  erc: DiagnosticSummary | undefined;
  latestDrcRun: LatestDrcRun | undefined;
}

export class DiagnosticStateStore implements vscode.Disposable {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<DiagnosticStateSnapshot>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private drc: DiagnosticSummary | undefined;
  private erc: DiagnosticSummary | undefined;
  private latestDrcRun: LatestDrcRun | undefined;
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
    const nextSummary = cloneSummary(summary);
    const projectId = options.project?.id ?? options.projectId;
    const projectState = projectId
      ? (this.projectDiagnostics.get(projectId) ?? {
          drc: undefined,
          erc: undefined,
          latestDrcRun: undefined
        })
      : undefined;

    if (summary.source === 'drc') {
      this.drc = nextSummary;
      this.latestDrcRun = {
        file: summary.file,
        diagnostics: [...diagnostics],
        summary: nextSummary
      };
      if (projectState) {
        projectState.drc = nextSummary;
        projectState.latestDrcRun = {
          file: summary.file,
          diagnostics: [...diagnostics],
          summary: nextSummary
        };
      }
    }
    if (summary.source === 'erc') {
      this.erc = nextSummary;
      if (projectState) {
        projectState.erc = nextSummary;
      }
    }
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
}

type ViewerSurfaceStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ViewerSurfaceState {
  uri: vscode.Uri;
  project: ProjectContext | undefined;
  state: ViewerState | undefined;
  error: string | undefined;
  status: ViewerSurfaceStatus;
}

export interface ViewerStateSnapshot {
  viewers: Array<{
    uri: string;
    project: ProjectContext | undefined;
    state: ViewerState | undefined;
    error: string | undefined;
    status: ViewerSurfaceStatus;
  }>;
}

export class ViewerStateStore implements vscode.Disposable {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<ViewerStateSnapshot>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private readonly viewers = new Map<string, ViewerSurfaceState>();

  beginReload(
    uri: vscode.Uri,
    options: { project?: ProjectContext | undefined } = {}
  ): ViewerStateSnapshot {
    return this.updateSurface(uri, {
      project: options.project,
      error: undefined,
      status: 'loading'
    });
  }

  recordError(
    uri: vscode.Uri,
    error: unknown,
    options: { project?: ProjectContext | undefined } = {}
  ): ViewerStateSnapshot {
    return this.updateSurface(uri, {
      project: options.project,
      error: error instanceof Error ? error.message : String(error),
      status: 'error'
    });
  }

  updateState(
    uri: vscode.Uri,
    state: ViewerState,
    options: { project?: ProjectContext | undefined } = {}
  ): ViewerStateSnapshot {
    return this.updateSurface(uri, {
      project: options.project,
      error: undefined,
      state: cloneViewerState(state),
      status: 'ready'
    });
  }

  getState(uri: vscode.Uri): ViewerState | undefined {
    const state = this.viewers.get(uri.toString())?.state;
    return state ? cloneViewerState(state) : undefined;
  }

  getSnapshot(): ViewerStateSnapshot {
    return {
      viewers: [...this.viewers.values()].map((viewer) => ({
        uri: viewer.uri.toString(),
        project: viewer.project ? cloneProjectContext(viewer.project) : undefined,
        state: viewer.state ? cloneViewerState(viewer.state) : undefined,
        error: viewer.error,
        status: viewer.status
      }))
    };
  }

  getDiagnosticBundleSnapshot(): ViewerStateSnapshot {
    const snapshot = this.getSnapshot();
    return {
      viewers: snapshot.viewers.map((viewer) => ({
        ...viewer,
        error: viewer.error ? redactSensitiveText(viewer.error) : undefined
      }))
    };
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private updateSurface(
    uri: vscode.Uri,
    update: Partial<Omit<ViewerSurfaceState, 'uri'>>
  ): ViewerStateSnapshot {
    const previous = this.viewers.get(uri.toString());
    const { project, ...rest } = update;
    this.viewers.set(uri.toString(), {
      uri,
      project: project ?? previous?.project,
      state: previous?.state,
      error: previous?.error,
      status: previous?.status ?? 'idle',
      ...rest
    });
    const snapshot = this.getSnapshot();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }
}

export class McpStateStore implements vscode.Disposable {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<McpConnectionState>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private state: McpConnectionState = {
    kind: 'Disconnected',
    available: false,
    connected: false
  };

  update(state: McpConnectionState): McpConnectionState {
    this.state = cloneMcpConnectionState(state);
    const snapshot = this.getState();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }

  getState(): McpConnectionState {
    return cloneMcpConnectionState(this.state);
  }

  getDiagnosticBundleSnapshot(): McpConnectionState {
    const snapshot = this.getState();
    return {
      ...snapshot,
      message: snapshot.message
        ? redactSensitiveText(snapshot.message)
        : undefined,
      server: snapshot.server
        ? {
            ...snapshot.server,
            capabilities: {
              ...snapshot.server.capabilities,
              diagnostics: snapshot.server.capabilities.diagnostics?.map((value) =>
                redactSensitiveText(value)
              ),
              serverInfo: snapshot.server.capabilities.serverInfo
                ? {
                    ...snapshot.server.capabilities.serverInfo,
                    diagnostics:
                      snapshot.server.capabilities.serverInfo.diagnostics?.map(
                        (value) => redactSensitiveText(value)
                      ) ?? []
                  }
                : undefined
            }
          }
        : undefined
    };
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

export type ExportSurfaceKind = 'export' | 'bom' | 'netlist';
type ExportSurfaceStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ExportSurfaceState {
  kind: ExportSurfaceKind;
  resource: vscode.Uri | undefined;
  message: string | undefined;
  error: string | undefined;
  status: ExportSurfaceStatus;
}

export interface ExportStateSnapshot {
  surfaces: Array<{
    kind: ExportSurfaceKind;
    resource: string | undefined;
    message: string | undefined;
    error: string | undefined;
    status: ExportSurfaceStatus;
  }>;
}

export class ExportStateStore implements vscode.Disposable {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<ExportStateSnapshot>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private readonly surfaces = new Map<ExportSurfaceKind, ExportSurfaceState>();

  begin(
    kind: ExportSurfaceKind,
    resource?: vscode.Uri,
    message?: string
  ): ExportStateSnapshot {
    return this.updateSurface(kind, {
      resource,
      message,
      error: undefined,
      status: 'loading'
    });
  }

  complete(
    kind: ExportSurfaceKind,
    resource?: vscode.Uri,
    message?: string
  ): ExportStateSnapshot {
    return this.updateSurface(kind, {
      resource,
      message,
      error: undefined,
      status: 'ready'
    });
  }

  fail(
    kind: ExportSurfaceKind,
    resource: vscode.Uri | undefined,
    error: unknown
  ): ExportStateSnapshot {
    return this.updateSurface(kind, {
      resource,
      error: error instanceof Error ? error.message : String(error),
      status: 'error'
    });
  }

  getSnapshot(): ExportStateSnapshot {
    return {
      surfaces: [...this.surfaces.values()].map((surface) => ({
        kind: surface.kind,
        resource: surface.resource?.toString(),
        message: surface.message,
        error: surface.error,
        status: surface.status
      }))
    };
  }

  getDiagnosticBundleSnapshot(): ExportStateSnapshot {
    const snapshot = this.getSnapshot();
    return {
      surfaces: snapshot.surfaces.map((surface) => ({
        ...surface,
        message: surface.message
          ? redactSensitiveText(surface.message)
          : undefined,
        error: surface.error ? redactSensitiveText(surface.error) : undefined
      }))
    };
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private updateSurface(
    kind: ExportSurfaceKind,
    update: Partial<Omit<ExportSurfaceState, 'kind'>>
  ): ExportStateSnapshot {
    const previous = this.surfaces.get(kind);
    this.surfaces.set(kind, {
      kind,
      resource: previous?.resource,
      message: previous?.message,
      error: previous?.error,
      status: previous?.status ?? 'idle',
      ...update
    });
    const snapshot = this.getSnapshot();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }
}

function cloneSummary(summary: DiagnosticSummary): DiagnosticSummary {
  return { ...summary };
}

function cloneViewerState(state: ViewerState): ViewerState {
  return {
    ...state,
    engine: state.engine ? cloneViewerEngineState(state.engine) : undefined,
    selectedArea: state.selectedArea ? { ...state.selectedArea } : undefined,
    activeLayers: state.activeLayers ? [...state.activeLayers] : undefined
  };
}

function cloneMcpConnectionState(state: McpConnectionState): McpConnectionState {
  return {
    ...state,
    install: cloneInstall(state.install),
    server: cloneServerCard(state.server)
  };
}

function cloneInstall(
  install: McpInstallStatus | undefined
): McpInstallStatus | undefined {
  return install ? { ...install } : undefined;
}

function cloneServerCard(
  server: McpServerCard | undefined
): McpServerCard | undefined {
  return server
    ? {
        ...server,
        capabilities: cloneCapabilities(server.capabilities)
      }
    : undefined;
}

function cloneCapabilities(capabilities: McpCapabilityCard): McpCapabilityCard {
  const serverInfo = capabilities.serverInfo;
  return {
    ...capabilities,
    tools: [...(capabilities.tools ?? [])],
    resources: [...(capabilities.resources ?? [])],
    prompts: [...(capabilities.prompts ?? [])],
    diagnostics: capabilities.diagnostics
      ? [...capabilities.diagnostics]
      : undefined,
    serverInfo: serverInfo
      ? {
          ...serverInfo,
          compatibilityRange: {
            kicadStudio: {
              ...serverInfo.compatibilityRange?.kicadStudio
            },
            kicadMcpPro: {
              ...serverInfo.compatibilityRange?.kicadMcpPro
            }
          },
          transport: { ...serverInfo.transport },
          kicad: { ...serverInfo.kicad },
          operatingMode: cloneOperatingMode(serverInfo),
          capabilities: {
            ...serverInfo.capabilities,
            cliExports: {
              ...serverInfo.capabilities?.cliExports
            }
          },
          diagnostics: [...(serverInfo.diagnostics ?? [])]
        }
      : undefined
  };
}

function cloneOperatingMode(
  serverInfo: NonNullable<McpCapabilityCard['serverInfo']>
): NonNullable<McpCapabilityCard['serverInfo']>['operatingMode'] {
  const mode = serverInfo.operatingMode;
  if (!mode) {
    return {
      active: 'readonly',
      default: 'readonly',
      available: ['readonly', 'write', 'manufacturing', 'experimental'],
      experimentalEnabled: false,
      toolAvailability: {}
    };
  }
  return {
    ...mode,
    available: [...mode.available],
    toolAvailability: Object.fromEntries(
      Object.entries(mode.toolAvailability).map(([name, availability]) => [
        name,
        { ...availability }
      ])
    )
  };
}
