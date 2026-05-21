import * as vscode from 'vscode';
import {
  DiagnosticStateStore,
  ExportStateStore,
  McpStateStore,
  ProjectStateStore,
  ViewerStateStore
} from '../../src/state/stateStores';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

function createDiagnosticsCollection(): vscode.DiagnosticCollection {
  return {
    name: 'kicad',
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    forEach: jest.fn(),
    get: jest.fn(),
    has: jest.fn(),
    dispose: jest.fn(),
    [Symbol.iterator]: jest.fn(() => [][Symbol.iterator]())
  } as unknown as vscode.DiagnosticCollection;
}

function createDiagnostic(message: string): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, 1),
    message,
    vscode.DiagnosticSeverity.Error
  );
  diagnostic.source = 'kicad-cli:drc';
  return diagnostic;
}

describe('extension state stores', () => {
  it('applies validation results once for Problems, status, and debug snapshots', () => {
    const collection = createDiagnosticsCollection();
    const store = new DiagnosticStateStore(collection);
    const boardUri = vscode.Uri.file('/workspace/demo.kicad_pcb');
    const stale = createDiagnostic('Clearance violation');

    store.applyValidationResult(boardUri, [stale], {
      file: boardUri.fsPath,
      errors: 1,
      warnings: 0,
      infos: 0,
      source: 'drc'
    });
    store.applyValidationResult(boardUri, [], {
      file: boardUri.fsPath,
      errors: 0,
      warnings: 0,
      infos: 0,
      source: 'drc'
    });

    expect(collection.set).toHaveBeenNthCalledWith(1, boardUri, [stale]);
    expect(collection.set).toHaveBeenLastCalledWith(boardUri, []);
    expect(store.getSnapshot()).toMatchObject({
      drc: {
        file: boardUri.fsPath,
        errors: 0
      },
      erc: undefined
    });
    expect(store.getLatestDrcRun()).toEqual({
      file: boardUri.fsPath,
      diagnostics: [],
      summary: expect.objectContaining({ errors: 0, source: 'drc' })
    });
    expect(store.getDiagnosticBundleSnapshot()).toEqual({
      drc: expect.objectContaining({ errors: 0, source: 'drc' }),
      erc: undefined
    });
  });

  it('tracks project context without leaking mutable Uri instances', () => {
    const store = new ProjectStateStore();
    const activeResource = vscode.Uri.file('/workspace/demo.kicad_sch');

    store.update({
      activeResource,
      hasProject: true,
      hasVariants: false,
      workspaceTrusted: true
    });

    expect(store.getSnapshot()).toEqual({
      activeResource: activeResource.toString(),
      hasProject: true,
      hasVariants: false,
      workspaceTrusted: true
    });
  });

  it('clears stale viewer errors when a reload starts', () => {
    const store = new ViewerStateStore();
    const boardUri = vscode.Uri.file('/workspace/demo.kicad_pcb');

    store.recordError(boardUri, 'Bearer sk-sensitive-viewer-token failed');
    store.updateState(boardUri, {
      zoom: 2,
      grid: true,
      theme: 'dark',
      selectedReference: 'U1'
    });
    store.beginReload(boardUri);

    expect(store.getState(boardUri)).toEqual(
      expect.objectContaining({
        zoom: 2,
        selectedReference: 'U1'
      })
    );
    expect(store.getDiagnosticBundleSnapshot()).toEqual({
      viewers: [
        expect.objectContaining({
          uri: boardUri.toString(),
          error: undefined,
          status: 'loading'
        })
      ]
    });
  });

  it('redacts MCP and export diagnostics in bundle snapshots', () => {
    const mcp = new McpStateStore();
    const exports = new ExportStateStore();

    mcp.update({
      kind: 'Disconnected',
      available: true,
      connected: false,
      message: 'Authorization: Bearer sk-mcp-secret'
    });
    exports.fail(
      'bom',
      vscode.Uri.file('/workspace/demo.kicad_sch'),
      'token=raw-export-secret'
    );

    expect(mcp.getDiagnosticBundleSnapshot().message).toContain('Bearer ***');
    expect(mcp.getDiagnosticBundleSnapshot().message).not.toContain(
      'sk-mcp-secret'
    );
    expect(exports.getDiagnosticBundleSnapshot()).toEqual({
      surfaces: [
        expect.objectContaining({
          kind: 'bom',
          status: 'error',
          error: expect.stringContaining('token=***')
        })
      ]
    });
  });
});
