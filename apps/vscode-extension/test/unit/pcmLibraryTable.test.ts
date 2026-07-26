import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PcmLibraryTablePersistence } from '../../src/library/pcmLibraryTable';
import type { PcmPackage } from '../../src/library/pcmCatalog';

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-pcm-table-'));
}

function packageFixture(
  identifier = 'com.example.precision-symbols',
  name = 'Precision Symbols'
): PcmPackage {
  return {
    repositoryId: 'fixture',
    repositoryName: 'Fixture Repository',
    repositoryUrl: 'https://example.com/repository.json',
    metadata: {
      identifier,
      name,
      description: 'Fixture',
      descriptionFull: 'Fixture package',
      type: 'library',
      tags: [],
      resources: {},
      versions: [],
      raw: {}
    },
    contentTypes: ['symbols', 'footprints'],
    state: 'available'
  };
}

function read(root: string, fileName: string): string {
  return fs.readFileSync(path.join(root, fileName), 'utf8');
}

function escapeTableValue(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

describe('PCM KiCad library-table boundary', () => {
  it('discovers nested symbol files and footprint library directories', () => {
    const root = tempRoot();
    const configDir = path.join(root, 'config');
    const installDir = path.join(root, '3rdparty', 'fixture');
    const symbolPath = path.join(
      installDir,
      'symbols',
      'Nested',
      'Precision.kicad_sym'
    );
    const footprintDir = path.join(
      installDir,
      'footprints',
      'Precision.pretty'
    );
    fs.mkdirSync(path.dirname(symbolPath), { recursive: true });
    fs.mkdirSync(footprintDir, { recursive: true });
    fs.writeFileSync(symbolPath, '(kicad_symbol_lib)\n');
    fs.writeFileSync(
      path.join(footprintDir, 'Precision.kicad_mod'),
      '(footprint)\n'
    );

    const tables = new PcmLibraryTablePersistence(() => configDir);
    tables.refresh(packageFixture(), installDir);

    expect(read(configDir, 'sym-lib-table')).toContain(
      `PCM_com_example_precision-symbols_Precision`
    );
    expect(read(configDir, 'sym-lib-table')).toContain(
      escapeTableValue(symbolPath)
    );
    expect(read(configDir, 'fp-lib-table')).toContain(
      `PCM_com_example_precision-symbols_Precision`
    );
    expect(read(configDir, 'fp-lib-table')).toContain(
      escapeTableValue(footprintDir)
    );
  });

  it('preserves foreign entries and replaces stale managed entries', () => {
    const root = tempRoot();
    const configDir = path.join(root, 'config');
    const installDir = path.join(root, 'install');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(path.join(installDir, 'symbols'), { recursive: true });
    fs.writeFileSync(
      path.join(installDir, 'symbols', 'Current.kicad_sym'),
      '(kicad_symbol_lib)\n'
    );
    fs.writeFileSync(
      path.join(configDir, 'sym-lib-table'),
      '(sym_lib_table\n  (lib (name "Foreign")(type "KiCad")(uri "/foreign.kicad_sym")(options "")(descr "foreign"))\n  (lib (name "PCM_com_example_precision-symbols_Stale")(type "KiCad")(uri "/stale.kicad_sym")(options "")(descr "stale"))\n)\n'
    );

    const tables = new PcmLibraryTablePersistence(() => configDir);
    tables.refresh(packageFixture(), installDir);

    const table = read(configDir, 'sym-lib-table');
    expect(table).toContain('(name "Foreign")');
    expect(table).not.toContain('Stale');
    expect(
      table.match(/PCM_com_example_precision-symbols_Current/gu)
    ).toHaveLength(1);
  });

  it('removes only the selected managed package entries', () => {
    const root = tempRoot();
    const configDir = path.join(root, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    for (const [fileName, rootName] of [
      ['sym-lib-table', 'sym_lib_table'],
      ['fp-lib-table', 'fp_lib_table']
    ] as const) {
      fs.writeFileSync(
        path.join(configDir, fileName),
        `(${rootName}\n  (lib (name "Foreign")(type "KiCad")(uri "/foreign")(options "")(descr "foreign"))\n  (lib (name "PCM_com_example_precision-symbols_Managed")(type "KiCad")(uri "/managed")(options "")(descr "managed"))\n)\n`
      );
    }

    const tables = new PcmLibraryTablePersistence(() => configDir);
    tables.remove('com.example.precision-symbols');

    expect(read(configDir, 'sym-lib-table')).toContain('(name "Foreign")');
    expect(read(configDir, 'sym-lib-table')).not.toContain('Managed');
    expect(read(configDir, 'fp-lib-table')).toContain('(name "Foreign")');
    expect(read(configDir, 'fp-lib-table')).not.toContain('Managed');
  });

  it('escapes filesystem paths and package descriptions', () => {
    const root = tempRoot();
    const configDir = path.join(root, 'config');
    const installDir = path.join(root, 'VendorFolder');
    const symbolPath = path.join(installDir, 'QuotedPart.kicad_sym');
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(symbolPath, '(kicad_symbol_lib)\n');

    const tables = new PcmLibraryTablePersistence(() => configDir);
    tables.refresh(
      packageFixture('com.example.quoted', 'Quoted "Vendor\\Name'),
      installDir
    );

    const table = read(configDir, 'sym-lib-table');
    expect(table).toContain('PCM_com_example_quoted_QuotedPart');
    expect(table).toContain(escapeTableValue(symbolPath));
    expect(table).toContain(
      escapeTableValue('Installed by KiCad Studio PCM: Quoted "Vendor\\Name')
    );
  });

  it('creates valid empty tables when the install root is absent', () => {
    const root = tempRoot();
    const configDir = path.join(root, 'config');
    const tables = new PcmLibraryTablePersistence(() => configDir);

    tables.refresh(packageFixture(), path.join(root, 'missing'));

    expect(read(configDir, 'sym-lib-table')).toBe('(sym_lib_table\n)\n');
    expect(read(configDir, 'fp-lib-table')).toBe('(fp_lib_table\n)\n');
  });
});
