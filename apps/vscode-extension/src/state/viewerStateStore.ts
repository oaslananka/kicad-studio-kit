import * as vscode from 'vscode';
import { cloneViewerEngineState } from '../providers/viewer/viewerEngine';
import type { ProjectContext, ViewerState } from '../types';
import { redactSensitiveText } from '../utils/secrets';
import { cloneProjectContext } from '../workspace/projectContext';

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
        project: viewer.project
          ? cloneProjectContext(viewer.project)
          : undefined,
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
      project: project ? cloneProjectContext(project) : previous?.project,
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

function cloneViewerState(state: ViewerState): ViewerState {
  return {
    ...state,
    engine: state.engine ? cloneViewerEngineState(state.engine) : undefined,
    selectedArea: state.selectedArea ? { ...state.selectedArea } : undefined,
    activeLayers: state.activeLayers ? [...state.activeLayers] : undefined
  };
}
