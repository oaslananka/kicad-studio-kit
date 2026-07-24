import * as path from 'node:path';

export type ExportCommandKind =
  | 'export-gerbers'
  | 'export-gerbers-with-drill'
  | 'export-pdf-sch'
  | 'export-pdf-pcb'
  | 'export-3d-pdf'
  | 'export-svg'
  | 'export-ipc2581'
  | 'export-odb'
  | 'export-glb'
  | 'export-brep'
  | 'export-ply'
  | 'export-step'
  | 'export-stpz'
  | 'export-xao'
  | 'export-stl'
  | 'export-u3d'
  | 'export-vrml'
  | 'export-ps-pcb'
  | 'export-ps-sch'
  | 'export-stats'
  | 'export-gencad'
  | 'export-ipcd356'
  | 'export-dxf'
  | 'export-pos'
  | 'export-fp-svg'
  | 'export-sym-svg'
  | 'export-sch-bom'
  | 'export-netlist';

const DEFAULT_GERBER_LAYERS = [
  'F.Cu',
  'B.Cu',
  'F.SilkS',
  'B.SilkS',
  'F.Mask',
  'B.Mask',
  'Edge.Cuts',
  'F.Fab',
  'B.Fab'
];

export interface ExportCommandBuildOptions {
  versionMajor?: number;
  precision?: string;
  ipcVersion?: string;
  ipcUnits?: string;
  theme?: string;
  bomFields?: string[];
  gerberLayers?: string[];
  variant?: string;
  /** 3D export: include tracks (default true) */
  includeTracks?: boolean;
  /** 3D export: include pads (default true) */
  includePads?: boolean;
  /** 3D export: include zones (default true) */
  includeZones?: boolean;
  /** 3D export: include inner copper layers (default true) */
  includeInnerCopper?: boolean;
  /** 3D export: include silkscreen (default true) */
  includeSilkscreen?: boolean;
  /** 3D export: include soldermask (default true) */
  includeSoldermask?: boolean;
  /** 3D export: substitute 3D models (default true) */
  substModels?: boolean;
  /** 3D STEP export: disable STEP optimisation (KiCad 8+) */
  noOptimizeStep?: boolean;
  /** 3D export: board-only mode (KiCad 10+) */
  boardOnly?: boolean;
  /** 3D export: translate Do Not Populate (KiCad 10+) */
  translateDNP?: boolean;
  /** 3D export: leave unspecified fields empty (KiCad 10+) */
  noUnspecified?: boolean;
}

export function buildExportCommands(
  kind: ExportCommandKind,
  file: string,
  outputDir: string,
  options: ExportCommandBuildOptions = {}
): string[][] {
  const precision = options.precision ?? '6';
  const ipcVersion = options.ipcVersion ?? 'C';
  const ipcUnits = options.ipcUnits ?? 'mm';
  const theme = options.theme ?? 'dark';
  const bomFields = options.bomFields ?? [];
  const versionMajor = options.versionMajor ?? 9;
  const bomPresetFlag = versionMajor >= 10 ? '--preset' : '--format-preset';

  switch (kind) {
    case 'export-gerbers': {
      const layers = options.gerberLayers?.length
        ? options.gerberLayers
        : DEFAULT_GERBER_LAYERS;
      return [
        [
          'pcb',
          'export',
          'gerbers',
          '--output',
          outputDir,
          '--layers',
          layers.join(','),
          ...(versionMajor >= 8 ? ['--precision', precision] : []),
          file
        ]
      ];
    }
    case 'export-gerbers-with-drill':
      return [
        ...buildExportCommands('export-gerbers', file, outputDir, options),
        [
          'pcb',
          'export',
          'drill',
          '--output',
          outputDir,
          '--format',
          'excellon',
          '--drill-origin',
          'absolute',
          '--excellon-separate-th',
          '--generate-map',
          '--map-format',
          'gerberx2',
          file
        ]
      ];
    case 'export-pdf-sch':
      return [
        [
          'sch',
          'export',
          'pdf',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.pdf'),
          '--theme',
          theme,
          file
        ]
      ];
    case 'export-pdf-pcb':
      return [
        [
          'pcb',
          'export',
          'pdf',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.pdf'),
          '--layers',
          'ALL',
          file
        ]
      ];
    case 'export-3d-pdf':
      return [
        [
          'pcb',
          'export',
          '3dpdf',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.pdf'),
          ...buildCommon3dExportArgs(options, versionMajor),
          file
        ]
      ];
    case 'export-svg':
      return [
        [
          file.endsWith('.kicad_sch') ? 'sch' : 'pcb',
          'export',
          'svg',
          '--output',
          outputDir,
          ...(file.endsWith('.kicad_pcb') ? ['--layers', 'ALL'] : []),
          file
        ]
      ];
    case 'export-ipc2581':
      return [
        [
          'pcb',
          'export',
          'ipc2581',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.xml'),
          '--version',
          ipcVersion,
          '--units',
          ipcUnits,
          '--compress',
          '--bom-col-mfg-pn',
          'MPN',
          '--bom-col-mfg',
          'Manufacturer',
          '--bom-col-dist-pn',
          'LCSC',
          '--bom-col-dist',
          'LCSC',
          file
        ]
      ];
    case 'export-odb':
      return [
        [
          'pcb',
          'export',
          'odb',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.zip'),
          '--units',
          'mm',
          '--compression',
          'zip',
          file
        ]
      ];
    case 'export-glb':
      return [
        [
          'pcb',
          'export',
          'glb',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.glb'),
          '--include-tracks',
          '--include-zones',
          '--subst-models',
          file
        ]
      ];
    case 'export-brep':
      if (versionMajor < 8) {
        return [];
      }
      return [
        [
          'pcb',
          'export',
          'brep',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.brep'),
          '--subst-models',
          file
        ]
      ];
    case 'export-ply':
      if (versionMajor < 8) {
        return [];
      }
      return [
        [
          'pcb',
          'export',
          'ply',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.ply'),
          ...buildCommon3dExportArgs(options, versionMajor),
          file
        ]
      ];
    case 'export-step':
      if (versionMajor < 8) {
        return [];
      }
      return [
        [
          'pcb',
          'export',
          'step',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.step'),
          ...buildCommon3dExportArgs(options, versionMajor),
          ...build3dVariantArgs('export-step', options.variant, versionMajor),
          ...((options.noOptimizeStep ?? true) && versionMajor >= 8
            ? ['--no-optimize-step']
            : []),
          file
        ]
      ];
    case 'export-stpz':
      if (versionMajor < 10) {
        return [];
      }
      return [
        [
          'pcb',
          'export',
          'stpz',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.stpz'),
          ...buildCommon3dExportArgs(options, versionMajor),
          ...build3dVariantArgs('export-stpz', options.variant, versionMajor),
          file
        ]
      ];
    case 'export-xao':
      if (versionMajor < 10) {
        return [];
      }
      return [
        [
          'pcb',
          'export',
          'xao',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.xao'),
          ...buildCommon3dExportArgs(options, versionMajor),
          ...build3dVariantArgs('export-xao', options.variant, versionMajor),
          file
        ]
      ];
    case 'export-stl':
      if (versionMajor < 8) {
        return [];
      }
      return [
        [
          'pcb',
          'export',
          'stl',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.stl'),
          ...buildCommon3dExportArgs(options, versionMajor),
          ...build3dVariantArgs('export-stl', options.variant, versionMajor),
          file
        ]
      ];
    case 'export-u3d':
      if (versionMajor < 8) {
        return [];
      }
      return [
        [
          'pcb',
          'export',
          'u3d',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.u3d'),
          ...buildCommon3dExportArgs(options, versionMajor),
          ...build3dVariantArgs('export-u3d', options.variant, versionMajor),
          file
        ]
      ];
    case 'export-vrml':
      if (versionMajor < 8) {
        return [];
      }
      return [
        [
          'pcb',
          'export',
          'vrml',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.wrl'),
          ...buildCommon3dExportArgs(options, versionMajor),
          ...build3dVariantArgs('export-vrml', options.variant, versionMajor),
          file
        ]
      ];
    case 'export-ps-pcb':
      return [
        [
          'pcb',
          'export',
          'ps',
          '--output',
          outputDir,
          '--layers',
          'F.Cu,B.Cu,Edge.Cuts,F.SilkS,B.SilkS,F.Mask,B.Mask,F.Fab,B.Fab',
          file
        ]
      ];
    case 'export-ps-sch':
      return [
        ['sch', 'export', 'ps', '--output', outputDir, '--theme', theme, file]
      ];
    case 'export-stats':
      return [
        [
          'pcb',
          'export',
          'stats',
          '--output',
          inferExportOutputPath(file, outputDir, '-stats', '.json'),
          '--format',
          'json',
          '--units',
          'mm',
          file
        ]
      ];
    case 'export-gencad':
      return [
        [
          'pcb',
          'export',
          'gencad',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.cad'),
          file
        ]
      ];
    case 'export-ipcd356':
      return [
        [
          'pcb',
          'export',
          'ipcd356',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.d356'),
          file
        ]
      ];
    case 'export-dxf':
      return [
        [
          file.endsWith('.kicad_sch') ? 'sch' : 'pcb',
          'export',
          'dxf',
          '--output',
          outputDir,
          ...(file.endsWith('.kicad_pcb')
            ? ['--layers', 'F.Cu,B.Cu,Edge.Cuts,F.Fab,B.Fab']
            : []),
          file
        ]
      ];
    case 'export-pos':
      return [
        [
          'pcb',
          'export',
          'pos',
          '--output',
          inferExportOutputPath(file, outputDir, '-pos', '.csv'),
          '--format',
          'csv',
          '--units',
          'mm',
          '--side',
          'both',
          file
        ]
      ];
    case 'export-fp-svg':
      return [['fp', 'export', 'svg', '--output', outputDir, file]];
    case 'export-sym-svg':
      return [
        ['sym', 'export', 'svg', '--output', outputDir, '--theme', theme, file]
      ];
    case 'export-sch-bom':
      return [
        [
          'sch',
          'export',
          'bom',
          '--output',
          inferExportOutputPath(file, outputDir, '-bom', '.csv'),
          '--fields',
          bomFields.join(','),
          '--group-by',
          'Value,Footprint',
          '--sort-field',
          'Reference',
          '--ref-range-delimiter',
          '',
          bomPresetFlag,
          'CSV',
          file
        ]
      ];
    case 'export-netlist':
      return [
        [
          'sch',
          'export',
          'netlist',
          '--output',
          inferExportOutputPath(file, outputDir, '', '.net'),
          '--format',
          'kicadsexpr',
          file
        ]
      ];
    default:
      return buildExportCommands('export-sch-bom', file, outputDir, options);
  }
}

/** Kinds that support the `--variant` CLI flag (KiCad 10+). */
const VARIANT_AWARE_KINDS: ReadonlySet<ExportCommandKind> = new Set([
  'export-step',
  'export-stpz',
  'export-xao',
  'export-stl',
  'export-u3d',
  'export-vrml'
]);

/**
 * Build common 3D export CLI arguments from structured options.
 *
 * Each include-* flag defaults to `true` to preserve the existing
 * behaviour. Newer flags (`--no-optimize-step`, `--board-only`,
 * `--translate-dnp`, `--no-unspecified`) are only emitted when
 * explicitly set and when the CLI version supports them.
 */
function buildCommon3dExportArgs(
  options: ExportCommandBuildOptions,
  versionMajor: number
): string[] {
  const args: string[] = [];
  if (options.includeTracks !== false) args.push('--include-tracks');
  if (options.includePads !== false) args.push('--include-pads');
  if (options.includeZones !== false) args.push('--include-zones');
  if (options.includeInnerCopper !== false) args.push('--include-inner-copper');
  if (options.includeSilkscreen !== false) args.push('--include-silkscreen');
  if (options.includeSoldermask !== false) args.push('--include-soldermask');
  if (options.substModels !== false) args.push('--subst-models');
  if (options.noOptimizeStep) args.push('--no-optimize-step');
  if (options.boardOnly && versionMajor >= 10) args.push('--board-only');
  if (options.translateDNP && versionMajor >= 10) args.push('--translate-dnp');
  if (options.noUnspecified && versionMajor >= 10)
    args.push('--no-unspecified');
  return args;
}

function build3dVariantArgs(
  kind: ExportCommandKind,
  variant?: string,
  versionMajor?: number
): string[] {
  if (!variant || (versionMajor ?? 0) < 10 || !VARIANT_AWARE_KINDS.has(kind)) {
    return [];
  }
  return ['--variant', variant];
}

function inferExportOutputPath(
  sourceFile: string,
  outputDir: string,
  suffix: string,
  extname: string
): string {
  const parsed = path.parse(sourceFile);
  return path.join(outputDir, `${parsed.name}${suffix}${extname}`);
}
