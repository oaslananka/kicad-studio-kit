import * as vscode from 'vscode';
import { redactSensitiveText } from '../utils/secrets';

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
