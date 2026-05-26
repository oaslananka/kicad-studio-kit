import fs from 'fs';
import path from 'path';

interface FixtureManifest {
  fixtureCount: number;
  root: string;
  expectedRoot: string;
  expectedFiles: string[];
  fixtures: Array<{
    id: string;
    semanticName: string;
    path: string;
    projectFile: string;
    schematicFiles: string[];
    boardFile: string | null;
    designRulesFile: string | null;
    expectedPath: string;
    expectedFiles: string[];
    expectedOutcome: 'pass' | 'warn' | 'fail';
    tags: string[];
    regressionCoverage?: {
      kicadVersion: string;
      cli: string[];
      importers: string[];
      pcb: string[];
    };
  }>;
}

const manifestPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'kicad-fixtures',
  'manifest.json'
);
const repoRoot = path.join(__dirname, '..', '..', '..', '..');
const manifest = JSON.parse(
  fs.readFileSync(manifestPath, 'utf8')
) as FixtureManifest;
const fixturesBySemanticName = new Map(
  manifest.fixtures.map((fixture) => [fixture.semanticName, fixture])
);

describe('KiCad fixture corpus manifest', () => {
  it('exposes the required fixtures by semantic name', () => {
    expect(manifest.fixtureCount).toBe(15);
    expect(manifest.root).toBe('packages/kicad-fixtures/fixtures');
    expect(manifest.expectedRoot).toBe('packages/kicad-fixtures/expected');
    expect([...fixturesBySemanticName.keys()]).toEqual([
      'clean-led-kicad10',
      'stale-diagnostics-kicad10',
      'kicad-10-0-3-regressions',
      'erc-power-pin-error',
      'drc-courtyard-error',
      'unconnected-pcb',
      'missing-netlist',
      'empty-board',
      'no-dru-file',
      'multi-sheet-schematic',
      'large-board',
      'malformed-sch',
      'malformed-pcb',
      'paths-with-spaces',
      'unicode-path-çöğü'
    ]);
  });

  it('points every fixture to project files and golden outputs that exist', () => {
    for (const fixture of manifest.fixtures) {
      const fixtureDir = path.join(repoRoot, fixture.path);
      const expectedDir = path.join(repoRoot, fixture.expectedPath);

      expect(fs.existsSync(path.join(fixtureDir, fixture.projectFile))).toBe(
        true
      );
      for (const schematicFile of fixture.schematicFiles) {
        expect(fs.existsSync(path.join(fixtureDir, schematicFile))).toBe(true);
      }
      if (fixture.boardFile) {
        expect(fs.existsSync(path.join(fixtureDir, fixture.boardFile))).toBe(
          true
        );
      }
      if (fixture.designRulesFile) {
        expect(
          fs.existsSync(path.join(fixtureDir, fixture.designRulesFile))
        ).toBe(true);
      }
      for (const expectedFile of manifest.expectedFiles) {
        expect(fs.existsSync(path.join(expectedDir, expectedFile))).toBe(true);
      }
      expect(fixture.expectedFiles).toEqual(manifest.expectedFiles);
    }
  });

  it('covers Windows path edge cases for spaces and non-ASCII paths', () => {
    const spaces = fixturesBySemanticName.get('paths-with-spaces');
    const unicode = fixturesBySemanticName.get('unicode-path-çöğü');

    expect(spaces?.projectFile).toBe('path case.kicad_pro');
    expect(unicode?.path).toContain('unicode-path-çöğü');
    expect(unicode?.projectFile).toBe('unicode-çöğü.kicad_pro');
  });

  it('exposes KiCad 10.0.3 regression metadata for extension consumers', () => {
    const regression = fixturesBySemanticName.get('kicad-10-0-3-regressions');

    expect(regression?.tags).toEqual(
      expect.arrayContaining([
        'kicad10.0.3',
        'pdf-property-popups',
        'pads-import',
        'allegro-capability'
      ])
    );
    expect(regression?.regressionCoverage?.kicadVersion).toBe('10.0.3');
    expect(regression?.regressionCoverage?.cli).toContain(
      'pcb_export_pdf_property_popup_suppression_probe'
    );
    expect(regression?.regressionCoverage?.importers).toEqual([
      'pads_import_edge_case_fixture',
      'allegro_import_capability_probe'
    ]);
    expect(regression?.regressionCoverage?.pcb).toEqual([
      'custom_padstack_non_copper_layer_fixture'
    ]);
  });
});
