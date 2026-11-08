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
});
