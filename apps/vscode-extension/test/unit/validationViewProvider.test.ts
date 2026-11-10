import * as vscode from 'vscode';
import { DiagnosticStateStore } from '../../src/state/stateStores';
import { ValidationViewProvider } from '../../src/providers/validationViewProvider';

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

describe('ValidationViewProvider', () => {
  it('shows a locked, non-actionable row in Restricted Mode and refreshes on trust', () => {
    const originalTrust = vscode.workspace.isTrusted;
    (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = false;
    const diagnostics = new DiagnosticStateStore(createDiagnosticsCollection());
    (diagnostics.onDidChange as jest.Mock).mockReturnValue({
      dispose: jest.fn()
    });
    const fire = jest.spyOn(vscode.EventEmitter.prototype, 'fire');
    const provider = new ValidationViewProvider(diagnostics);
    try {
      const items = provider
        .getChildren()
        .map((row) => provider.getTreeItem(row));
      for (const item of items) {
        expect(item.description).toBe('Trust workspace to run checks');
        expect(item.tooltip).toContain('Trust this workspace');
        expect(item.iconPath).toEqual(expect.objectContaining({ id: 'lock' }));
        expect(item.command).toBeUndefined();
      }

      fire.mockClear();
      const trustHandler = (
        vscode.workspace.onDidGrantWorkspaceTrust as jest.Mock
      ).mock.calls.at(-1)?.[0] as (() => void) | undefined;
      expect(trustHandler).toBeDefined();
      (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
      trustHandler?.();
      expect(fire).toHaveBeenCalledWith(undefined);
      expect(provider.getTreeItem(provider.getChildren()[0]!).command).toEqual(
        expect.objectContaining({ command: 'kicadstudio.runDRC' })
      );
    } finally {
      provider.dispose();
      fire.mockRestore();
      (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted =
        originalTrust;
    }
  });

  it('keeps prior diagnostic status readable in Restricted Mode without an executable command', () => {
    const originalTrust = vscode.workspace.isTrusted;
    (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = false;
    const diagnostics = new DiagnosticStateStore(createDiagnosticsCollection());
    const board = vscode.Uri.file('/workspace/demo.kicad_pcb');
    diagnostics.applyValidationResult(board, [], {
      file: board.fsPath,
      errors: 0,
      warnings: 0,
      infos: 0,
      source: 'drc',
      capturedAt: '2026-05-21T05:00:00.000Z'
    });
    (diagnostics.onDidChange as jest.Mock).mockReturnValue({
      dispose: jest.fn()
    });
    const provider = new ValidationViewProvider(diagnostics);
    try {
      const item = provider.getTreeItem(provider.getChildren()[0]!);
      expect(item.description).toContain('PASS');
      expect(item.tooltip).toContain('Trust this workspace');
      expect(item.command).toBeUndefined();
    } finally {
      provider.dispose();
      (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted =
        originalTrust;
    }
  });

  it('derives DRC and ERC rows from the shared diagnostic state', () => {
    const diagnostics = new DiagnosticStateStore(createDiagnosticsCollection());
    const provider = new ValidationViewProvider(diagnostics);
    const board = vscode.Uri.file('/workspace/demo.kicad_pcb');
    const schematic = vscode.Uri.file('/workspace/demo.kicad_sch');

    diagnostics.applyValidationResult(board, [], {
      file: board.fsPath,
      errors: 0,
      warnings: 0,
      infos: 0,
      source: 'drc',
      capturedAt: '2026-05-21T05:00:00.000Z'
    });
    diagnostics.applyValidationResult(schematic, [], {
      file: schematic.fsPath,
      errors: 0,
      warnings: 2,
      infos: 1,
      source: 'erc',
      capturedAt: '2026-05-21T05:01:00.000Z'
    });

    const rows = provider.getChildren();

    expect(rows.map((row) => row.label)).toEqual(['DRC', 'ERC']);
    expect(provider.getTreeItem(rows[0]!).description).toContain('PASS');
    expect(provider.getTreeItem(rows[1]!).description).toContain('WARN');
    expect(provider.getTreeItem(rows[1]!).tooltip).toContain(schematic.fsPath);
  });

  it('shows stale validation freshness instead of treating cached errors as current', () => {
    const diagnostics = new DiagnosticStateStore(createDiagnosticsCollection());
    const provider = new ValidationViewProvider(diagnostics);
    const board = vscode.Uri.file('/workspace/demo.kicad_pcb');

    diagnostics.applyValidationResult(board, [], {
      file: board.fsPath,
      errors: 5,
      warnings: 2,
      infos: 0,
      source: 'drc',
      capturedAt: '2026-05-21T05:00:00.000Z',
      freshness: 'stale',
      staleReason: 'Viewer reloaded after source file changed.',
      origin: 'kicad-cli'
    } as never);

    const [row] = provider.getChildren();
    const item = provider.getTreeItem(row!);

    expect(item.description).toContain('STALE');
    expect(item.description).not.toContain('FAIL');
    expect(item.tooltip).toContain('Viewer reloaded');
    expect(item.tooltip).toContain('kicad-cli');
  });
  it('exposes only fresh verified ERC UUID findings as clickable source rows', () => {
    const diagnostics = new DiagnosticStateStore(createDiagnosticsCollection());
    (diagnostics.onDidChange as jest.Mock).mockReturnValue({
      dispose: jest.fn()
    });
    const provider = new ValidationViewProvider(diagnostics);
    const root = vscode.Uri.file('/workspace/Root.kicad_sch');
    const child = vscode.Uri.file('/workspace/Connectors.kicad_sch');
    Object.defineProperty(child, 'scheme', { value: 'file' });
    const sourceRange = new vscode.Range(3351, 2, 3351, 3);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'Input Power pin not driven by any Output Power pins',
      vscode.DiagnosticSeverity.Error
    );
    diagnostic.source = 'kicad-cli:erc';
    diagnostic.relatedInformation = [
      {
        message: 'Exact KiCad source UUID location (open related information)',
        location: { uri: child, range: sourceRange }
      }
    ];
    diagnostics.applyValidationResult(root, [diagnostic], {
      file: root.fsPath,
      source: 'erc',
      errors: 1,
      warnings: 0,
      infos: 0,
      freshness: 'fresh-dirty'
    });
    try {
      const ercRow = provider.getChildren()[1]!;
      expect(provider.getTreeItem(ercRow).collapsibleState).toBe(
        vscode.TreeItemCollapsibleState.Collapsed
      );
      const sources = provider.getChildren(ercRow);
      expect(sources).toHaveLength(1);
      const item = provider.getTreeItem(sources[0]!);
      expect(item.label).toContain('Input Power');
      expect(item.description).toBe('Connectors.kicad_sch:3352');
      expect(item.command).toEqual({
        command: 'kicadstudio.revealVerifiedErcSource',
        title: 'Open exact ERC source',
        arguments: [child, sourceRange]
      });

      diagnostics.markValidationStale('erc', root, 'source changed');
      expect(provider.getChildren(provider.getChildren()[1]!)).toEqual([]);
    } finally {
      provider.dispose();
    }
  });

  it('does not link unverified ERC findings or findings from other projects', () => {
    const diagnostics = new DiagnosticStateStore(createDiagnosticsCollection());
    (diagnostics.onDidChange as jest.Mock).mockReturnValue({
      dispose: jest.fn()
    });
    const provider = new ValidationViewProvider(diagnostics);
    const root = vscode.Uri.file('/workspace/root.kicad_sch');
    const unverified = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'No UUID location',
      vscode.DiagnosticSeverity.Error
    );
    unverified.source = 'kicad-cli:erc';
    diagnostics.applyValidationResult(
      root,
      [unverified],
      { file: root.fsPath, source: 'erc', errors: 1, warnings: 0, infos: 0 },
      { projectId: 'project-alpha' }
    );
    diagnostics.setActiveProject('project-alpha');
    expect(provider.getChildren(provider.getChildren()[1]!)).toEqual([]);
    diagnostics.setActiveProject('project-beta');
    expect(diagnostics.getLatestErcRun()).toBeUndefined();
    expect(provider.getChildren(provider.getChildren()[1]!)).toEqual([]);
    provider.dispose();
  });
});
