import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildExportCommands,
  type ExportCommandBuildOptions,
  type ExportCommandKind
} from '../../src/cli/exportCommandBuilder';

const PCB = '/project/board.kicad_pcb';
const SCH = '/project/main.kicad_sch';
const OUT = '/project/fab';

const OPTIONS: ExportCommandBuildOptions = {
  versionMajor: 10,
  precision: '7',
  ipcVersion: 'B',
  ipcUnits: 'inch',
  theme: 'kicad',
  bomFields: ['Reference', 'Value'],
  gerberLayers: ['F.Cu', 'B.Cu', 'Edge.Cuts'],
  variant: 'Assembly-A'
};

describe('buildExportCommands', () => {
  it('is a pure deterministic command builder', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/cli/exportCommandBuilder.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/from ['"]vscode['"]/);
    expect(buildExportCommands('export-ipc2581', PCB, OUT, OPTIONS)[0]).toEqual(
      expect.arrayContaining([
        '--version',
        'B',
        '--units',
        'inch',
        '--output',
        path.join(OUT, 'board.xml')
      ])
    );
    expect(
      buildExportCommands(
        'export-sym-svg',
        '/project/lib.kicad_sym',
        OUT,
        OPTIONS
      )[0]
    ).toEqual(expect.arrayContaining(['--theme', 'kicad']));
  });

  it('rejects export formats before their supported KiCad release', () => {
    for (const kind of [
      'export-step',
      'export-stl',
      'export-u3d',
      'export-vrml'
    ] satisfies ExportCommandKind[]) {
      expect(buildExportCommands(kind, PCB, OUT, { versionMajor: 7 })).toEqual(
        []
      );
    }
    for (const kind of [
      'export-stpz',
      'export-xao'
    ] satisfies ExportCommandKind[]) {
      expect(buildExportCommands(kind, PCB, OUT, { versionMajor: 9 })).toEqual(
        []
      );
    }
  });

  it('applies structured 3D options and version-aware variants', () => {
    const modern = buildExportCommands('export-step', PCB, OUT, {
      versionMajor: 10,
      variant: 'Assembly-B',
      includeTracks: false,
      includePads: false,
      includeZones: false,
      includeInnerCopper: false,
      includeSilkscreen: false,
      includeSoldermask: false,
      substModels: false,
      noOptimizeStep: true,
      boardOnly: true,
      translateDNP: true,
      noUnspecified: true
    })[0];

    expect(modern).toEqual(
      expect.arrayContaining([
        '--variant',
        'Assembly-B',
        '--no-optimize-step',
        '--board-only',
        '--translate-dnp',
        '--no-unspecified'
      ])
    );
    expect(modern).not.toEqual(
      expect.arrayContaining([
        '--include-tracks',
        '--include-pads',
        '--include-zones',
        '--include-inner-copper',
        '--include-silkscreen',
        '--include-soldermask',
        '--subst-models'
      ])
    );

    const legacy = buildExportCommands('export-step', PCB, OUT, {
      versionMajor: 9,
      variant: 'Assembly-B',
      boardOnly: true,
      translateDNP: true,
      noUnspecified: true,
      noOptimizeStep: false
    })[0];
    expect(legacy).not.toContain('--variant');
    expect(legacy).not.toContain('--board-only');
    expect(legacy).not.toContain('--translate-dnp');
    expect(legacy).not.toContain('--no-unspecified');
    expect(legacy).not.toContain('--no-optimize-step');
  });

  it('keeps the runtime fallback mapped to schematic BOM export', () => {
    const commands = buildExportCommands(
      'unsupported-export' as ExportCommandKind,
      SCH,
      OUT,
      OPTIONS
    );
    expect(commands[0]).toEqual(
      expect.arrayContaining(['sch', 'export', 'bom', SCH])
    );
  });

  it('builds every declared command kind on its supported release line', () => {
    const cases: Array<[ExportCommandKind, string, string]> = [
      ['export-gerbers', PCB, 'gerbers'],
      ['export-gerbers-with-drill', PCB, 'gerbers'],
      ['export-pdf-sch', SCH, 'pdf'],
      ['export-pdf-pcb', PCB, 'pdf'],
      ['export-3d-pdf', PCB, '3dpdf'],
      ['export-svg', SCH, 'svg'],
      ['export-ipc2581', PCB, 'ipc2581'],
      ['export-odb', PCB, 'odb'],
      ['export-glb', PCB, 'glb'],
      ['export-brep', PCB, 'brep'],
      ['export-ply', PCB, 'ply'],
      ['export-step', PCB, 'step'],
      ['export-stpz', PCB, 'stpz'],
      ['export-xao', PCB, 'xao'],
      ['export-stl', PCB, 'stl'],
      ['export-u3d', PCB, 'u3d'],
      ['export-vrml', PCB, 'vrml'],
      ['export-ps-pcb', PCB, 'ps'],
      ['export-ps-sch', SCH, 'ps'],
      ['export-stats', PCB, 'stats'],
      ['export-gencad', PCB, 'gencad'],
      ['export-ipcd356', PCB, 'ipcd356'],
      ['export-dxf', PCB, 'dxf'],
      ['export-pos', PCB, 'pos'],
      ['export-fp-svg', '/project/R_0603.kicad_mod', 'svg'],
      ['export-sym-svg', '/project/lib.kicad_sym', 'svg'],
      ['export-sch-bom', SCH, 'bom'],
      ['export-netlist', SCH, 'netlist']
    ];

    for (const [kind, file, subcommand] of cases) {
      const commands = buildExportCommands(kind, file, OUT, OPTIONS);
      expect(commands.length).toBeGreaterThan(0);
      expect(commands.flat()).toContain(subcommand);
    }
  });
});
