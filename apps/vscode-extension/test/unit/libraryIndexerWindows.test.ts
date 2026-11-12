import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { KiCadLibraryIndexer } from '../../src/library/libraryIndexer';
import { createExtensionContextMock } from './vscodeMock';

describe('installed Windows KiCad library discovery', () => {
  let tempRoot: string;
  let originalProgramFiles: string | undefined;
  let originalSymbolDir: string | undefined;
  let originalFootprintDir: string | undefined;

  beforeEach(() => {
    originalProgramFiles = process.env['PROGRAMFILES'];
    originalSymbolDir = process.env['KICAD_SYMBOL_DIR'];
    originalFootprintDir = process.env['KICAD_FOOTPRINT_DIR'];
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-windows-libs-'));
    process.env['PROGRAMFILES'] = tempRoot;
    delete process.env['KICAD_SYMBOL_DIR'];
    delete process.env['KICAD_FOOTPRINT_DIR'];

    const symbolsDir = path.join(
      tempRoot,
      'KiCad',
      '10.0',
      'share',
      'kicad',
      'symbols'
    );
    const footprintsDir = path.join(
      tempRoot,
      'KiCad',
      '10.0',
      'share',
      'kicad',
      'footprints',
      'QA_Resistors.pretty'
    );
    fs.mkdirSync(symbolsDir, { recursive: true });
    fs.mkdirSync(footprintsDir, { recursive: true });
    fs.writeFileSync(
      path.join(symbolsDir, 'QA_Windows.kicad_sym'),
      '(kicad_symbol_lib\n  (symbol "QA_WindowSymbol"\n    (property "Value" "QA")\n  )\n)\n'
    );
    fs.writeFileSync(
      path.join(footprintsDir, 'QA_WindowFootprint.kicad_mod'),
      '(footprint "QA_WindowFootprint"\n  (descr "Test footprint")\n  (tags "QA")\n)\n'
    );
  });

  afterEach(() => {
    for (const [key, value] of [
      ['PROGRAMFILES', originalProgramFiles],
      ['KICAD_SYMBOL_DIR', originalSymbolDir],
      ['KICAD_FOOTPRINT_DIR', originalFootprintDir]
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('indexes symbol and footprint directories from a versioned KiCad install', async () => {
    const context = createExtensionContextMock();
    const indexer = new KiCadLibraryIndexer(
      context as unknown as vscode.ExtensionContext
    );
    await indexer.indexAll();
    expect(indexer.searchSymbols('QA_WindowSymbol')).toEqual([
      expect.objectContaining({ name: 'QA_WindowSymbol' })
    ]);
    expect(indexer.searchFootprints('QA_WindowFootprint')).toEqual([
      expect.objectContaining({ name: 'QA_WindowFootprint' })
    ]);
  });
});
