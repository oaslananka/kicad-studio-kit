import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { KiCadLibraryIndexer } from '../../src/library/libraryIndexer';
import { createExtensionContextMock } from './vscodeMock';

describe('installed Windows KiCad library discovery', () => {
  let tempRoot: string;
  let originalProgramFiles: string | undefined;
  let originalProgramFilesX86: string | undefined;
  let originalSymbolDir: string | undefined;
  let originalFootprintDir: string | undefined;

  beforeEach(() => {
    originalProgramFiles = process.env['PROGRAMFILES'];
    originalProgramFilesX86 = process.env['ProgramFiles(x86)'];
    originalSymbolDir = process.env['KICAD_SYMBOL_DIR'];
    originalFootprintDir = process.env['KICAD_FOOTPRINT_DIR'];
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-windows-libs-'));
    process.env['PROGRAMFILES'] = tempRoot;
    delete process.env['ProgramFiles(x86)'];
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
      ['ProgramFiles(x86)', originalProgramFilesX86],
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

  it('discovers libraries in Program Files (x86) when the primary install root is missing', async () => {
    const x86Root = path.join(tempRoot, 'x86');
    const symbolsDir = path.join(
      x86Root,
      'KiCad',
      '9.0',
      'share',
      'kicad',
      'symbols'
    );
    fs.mkdirSync(symbolsDir, { recursive: true });
    fs.writeFileSync(
      path.join(symbolsDir, 'QA_Legacy.kicad_sym'),
      '(kicad_symbol_lib\n  (symbol "QA_x86Only"\n  )\n)\n'
    );
    fs.rmSync(path.join(tempRoot, 'KiCad'), { recursive: true, force: true });
    process.env['ProgramFiles(x86)'] = x86Root;

    const indexer = new KiCadLibraryIndexer(
      createExtensionContextMock() as unknown as vscode.ExtensionContext
    );
    await indexer.indexAll();
    expect(indexer.searchSymbols('QA_x86Only')).toEqual([
      expect.objectContaining({ name: 'QA_x86Only' })
    ]);
  });

  it('returns no results when neither Windows install root exists', async () => {
    fs.rmSync(path.join(tempRoot, 'KiCad'), { recursive: true, force: true });
    delete process.env['PROGRAMFILES'];
    delete process.env['ProgramFiles(x86)'];
    const indexer = new KiCadLibraryIndexer(
      createExtensionContextMock() as unknown as vscode.ExtensionContext
    );
    await indexer.indexAll();
    expect(indexer.searchSymbols('QA_WindowSymbol')).toEqual([]);
    expect(indexer.searchFootprints('QA_WindowFootprint')).toEqual([]);
  });
});
