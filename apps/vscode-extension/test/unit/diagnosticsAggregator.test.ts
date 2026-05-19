import * as vscode from 'vscode';
import { KiCadDiagnosticsAggregator } from '../../src/language/diagnosticsAggregator';

describe('KiCadDiagnosticsAggregator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createBackingCollection() {
    return {
      name: 'kicad',
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      forEach: jest.fn(),
      dispose: jest.fn(),
      [Symbol.iterator]: jest.fn(() => [][Symbol.iterator]())
    } as unknown as vscode.DiagnosticCollection;
  }

  it('keeps syntax and DRC diagnostics for the same file in one collection', () => {
    const backing = createBackingCollection();
    const aggregator = new KiCadDiagnosticsAggregator(backing);
    const uri = vscode.Uri.file('/workspace/board.kicad_pcb');
    const syntax = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'Unknown node',
      2
    );
    syntax.source = 'kicad-studio:syntax';
    const drc = new vscode.Diagnostic(
      new vscode.Range(1, 0, 1, 1),
      'Clearance',
      0
    );
    drc.source = 'kicad-cli:drc';

    aggregator.set(uri, [syntax]);
    aggregator.set(uri, [drc]);

    expect(
      aggregator.get(uri)?.map((diagnostic) => diagnostic.message)
    ).toEqual(['Unknown node', 'Clearance']);
  });

  it('replaces only diagnostics from the same source', () => {
    const backing = createBackingCollection();
    const aggregator = new KiCadDiagnosticsAggregator(backing);
    const uri = vscode.Uri.file('/workspace/schematic.kicad_sch');
    const first = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'Old ERC',
      1
    );
    first.source = 'kicad-cli:erc';
    const second = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'New ERC',
      1
    );
    second.source = 'kicad-cli:erc';

    aggregator.set(uri, [first]);
    aggregator.set(uri, [second]);

    expect(
      aggregator.get(uri)?.map((diagnostic) => diagnostic.message)
    ).toEqual(['New ERC']);
  });

  it('infers buckets from file extension and supports delete and clear', () => {
    const backing = createBackingCollection();
    const aggregator = new KiCadDiagnosticsAggregator(backing);
    const pcbUri = vscode.Uri.file('/workspace/board.kicad_pcb');
    const schUri = vscode.Uri.file('/workspace/schematic.kicad_sch');
    const pcbDiagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'Board issue',
      0
    );
    const schDiagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'Schematic issue',
      0
    );

    aggregator.set(pcbUri, [pcbDiagnostic]);
    aggregator.set(schUri, [schDiagnostic]);

    expect(
      aggregator.get(pcbUri)?.map((diagnostic) => diagnostic.message)
    ).toEqual(['Board issue']);
    expect(
      aggregator.get(schUri)?.map((diagnostic) => diagnostic.message)
    ).toEqual(['Schematic issue']);

    aggregator.delete(pcbUri);
    expect(aggregator.has(pcbUri)).toBe(false);
    expect(aggregator.get(pcbUri)).toBeUndefined();

    aggregator.clear();
    expect(aggregator.has(schUri)).toBe(false);
    expect(aggregator.get(schUri)).toBeUndefined();
  });

  it('supports collection overloads and forwards collection APIs', () => {
    const backing = createBackingCollection();
    const uri = vscode.Uri.file('/workspace/notes.txt');
    const syntaxDiagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'Syntax issue',
      0
    );
    syntaxDiagnostic.source = 'kicad-syntax';
    const otherDiagnostic = new vscode.Diagnostic(
      new vscode.Range(1, 0, 1, 1),
      'Generic issue',
      0
    );
    const iteratorRows: Array<[vscode.Uri, readonly vscode.Diagnostic[]]> = [
      [uri, [syntaxDiagnostic, otherDiagnostic]]
    ];
    (backing.forEach as jest.Mock).mockImplementation(
      (
        callback: (
          itemUri: vscode.Uri,
          diagnostics: readonly vscode.Diagnostic[]
        ) => void
      ) => callback(uri, [syntaxDiagnostic, otherDiagnostic])
    );
    (backing[Symbol.iterator] as jest.Mock).mockReturnValue(
      iteratorRows[Symbol.iterator]()
    );
    const aggregator = new KiCadDiagnosticsAggregator(backing);
    const thisArg = { called: false };

    aggregator.set([[uri, [syntaxDiagnostic, otherDiagnostic]]]);
    expect(aggregator.name).toBe('kicad');
    expect(
      aggregator.get(uri)?.map((diagnostic) => diagnostic.message)
    ).toEqual(['Syntax issue', 'Generic issue']);

    const callback = jest.fn(function (
      this: typeof thisArg,
      _uri: vscode.Uri,
      _diagnostics: readonly vscode.Diagnostic[],
      collection: vscode.DiagnosticCollection
    ) {
      this.called = true;
      expect(collection).toBe(aggregator);
    });
    aggregator.forEach(callback, thisArg);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(thisArg.called).toBe(true);
    expect([...aggregator]).toEqual(iteratorRows);

    aggregator.set(uri, undefined);
    expect(backing.delete).toHaveBeenCalledWith(uri);

    aggregator.dispose();
    expect(backing.dispose).toHaveBeenCalled();
  });
});
