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
    expect(provider.getTreeItem(rows[1]!).tooltip).toContain(
      schematic.fsPath
    );
  });
});
