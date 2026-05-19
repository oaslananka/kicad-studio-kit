import * as vscode from 'vscode';
import { KiCadDiagnosticsProvider } from '../../src/language/diagnosticsProvider';
import { SExpressionParser } from '../../src/language/sExpressionParser';

function createDocument(languageId: string, text: string): vscode.TextDocument {
  return {
    languageId,
    getText: () => text,
    uri: vscode.Uri.file(`/${languageId}`),
    version: 1
  } as vscode.TextDocument;
}

describe('KiCadDiagnosticsProvider', () => {
  it('leaves KiCad project JSON files to JSON validation', () => {
    const collection = {
      set: jest.fn(),
      delete: jest.fn(),
      dispose: jest.fn()
    } as unknown as vscode.DiagnosticCollection;
    const provider = new KiCadDiagnosticsProvider(
      new SExpressionParser(),
      collection
    );

    provider.update(createDocument('kicad-project', '{"board":{}}'));

    expect(collection.set).not.toHaveBeenCalled();
  });

  it('still analyzes S-expression KiCad files', () => {
    const collection = {
      set: jest.fn(),
      delete: jest.fn(),
      dispose: jest.fn()
    } as unknown as vscode.DiagnosticCollection;
    const provider = new KiCadDiagnosticsProvider(
      new SExpressionParser(),
      collection
    );

    provider.update(
      createDocument('kicad-schematic', '(kicad_sch (unknown_node))')
    );

    expect(collection.set).toHaveBeenCalledWith(
      expect.any(vscode.Uri),
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'Unknown KiCad node "unknown_node". Check for typos or version-specific syntax.'
        })
      ])
    );
  });
});
