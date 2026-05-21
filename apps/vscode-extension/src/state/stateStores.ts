import * as vscode from 'vscode';
import type {
  DiagnosticSummary,
  McpCapabilityCard,
  McpConnectionState,
  McpInstallStatus,
  McpServerCard,
  ViewerState
} from '../types';
import { redactSensitiveText } from '../utils/secrets';

export interface ProjectStateSnapshot {
  activeResource: string | undefined;
  hasProject: boolean;
  hasVariants: boolean;
  workspaceTrusted: boolean;
}

interface ProjectState extends Omit<ProjectStateSnapshot, 'activeResource'> {
  activeResource: vscode.Uri | undefined;
}

export class ProjectStateStore implements vscode.Disposable {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<ProjectStateSnapshot>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private state: ProjectState = {
    activeResource: undefined,
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
      hasProject: this.state.hasProject,
      hasVariants: this.state.hasVariants,
      workspaceTrusted: this.state.workspaceTrusted
    };
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
}

interface LatestDrcRun {
  file: string;
  diagnostics: vscode.Diagnostic[];
  summary: DiagnosticSummary;
}

export class DiagnosticStateStore implements vscode.Disposable {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<DiagnosticStateSnapshot>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private drc: DiagnosticSummary | undefined;
  private erc: DiagnosticSummary | undefined;
  private latestDrcRun: LatestDrcRun | undefined;

  constructor(private readonly diagnostics: vscode.DiagnosticCollection) {}

  applyValidationResult(
    uri: vscode.Uri,
    diagnostics: readonly vscode.Diagnostic[],
    summary: DiagnosticSummary
  ): DiagnosticStateSnapshot {
    this.diagnostics.set(uri, diagnostics);
    const nextSummary = cloneSummary(summary);
    if (summary.source === 'drc') {
      this.drc = nextSummary;
      this.latestDrcRun = {
        file: summary.file,
        diagnostics: [...diagnostics],
        summary: nextSummary
      };
    }
    if (summary.source === 'erc') {
      this.erc = nextSummary;
    }
    const snapshot = this.getSnapshot();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }

  getLatestDrcRun(): LatestDrcRun | undefined {
    return this.latestDrcRun
      ? {
          file: this.latestDrcRun.file,
          diagnostics: [...this.latestDrcRun.diagnostics],
          summary: cloneSummary(this.latestDrcRun.summary)
        }
      : undefined;
  }

  getSnapshot(): DiagnosticStateSnapshot {
    return {
      drc: this.drc ? cloneSummary(this.drc) : undefined,
      erc: this.erc ? cloneSummary(this.erc) : undefined
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
  state: ViewerState | undefined;
  error: string | undefined;
  status: ViewerSurfaceStatus;
}

export interface ViewerStateSnapshot {
  viewers: Array<{
    uri: string;
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

  beginReload(uri: vscode.Uri): ViewerStateSnapshot {
    return this.updateSurface(uri, {
      error: undefined,
      status: 'loading'
    });
  }

  recordError(uri: vscode.Uri, error: unknown): ViewerStateSnapshot {
    return this.updateSurface(uri, {
      error: error instanceof Error ? error.message : String(error),
      status: 'error'
    });
  }

  updateState(uri: vscode.Uri, state: ViewerState): ViewerStateSnapshot {
    return this.updateSurface(uri, {
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
    this.viewers.set(uri.toString(), {
      uri,
      state: previous?.state,
      error: previous?.error,
      status: previous?.status ?? 'idle',
      ...update
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
