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

interface ExportCommandBuildContext {
  file: string;
  outputDir: string;
  options: ExportCommandBuildOptions;
  precision: string;
  ipcVersion: string;
  ipcUnits: string;
  theme: string;
  bomFields: string[];
  versionMajor: number;
  bomPresetFlag: '--preset' | '--format-preset';
}

type ExportCommandBuilder = (context: ExportCommandBuildContext) => string[][];

export function buildExportCommands(
  kind: ExportCommandKind,
  file: string,
  outputDir: string,
  options: ExportCommandBuildOptions = {}
): string[][] {
  const context = resolveExportCommandBuildContext(file, outputDir, options);
  const builder = COMMAND_BUILDERS[kind] ?? buildExportSchBom;
  return builder(context);
}

const COMMAND_BUILDERS: Partial<
  Record<ExportCommandKind, ExportCommandBuilder>
> = {
  'export-gerbers': buildExportGerbers,
  'export-gerbers-with-drill': buildExportGerbersWithDrill,
  'export-pdf-sch': buildExportPdfSch,
  'export-pdf-pcb': buildExportPdfPcb,
  'export-3d-pdf': buildExport3dPdf,
  'export-svg': buildExportSvg,
  'export-ipc2581': buildExportIpc2581,
  'export-odb': buildExportOdb,
  'export-glb': buildExportGlb,
  'export-brep': buildExportBrep,
  'export-ply': buildExportPly,
  'export-step': buildExportStep,
  'export-stpz': buildExportStpz,
  'export-xao': buildExportXao,
  'export-stl': buildExportStl,
  'export-u3d': buildExportU3d,
  'export-vrml': buildExportVrml,
  'export-ps-pcb': buildExportPsPcb,
  'export-ps-sch': buildExportPsSch,
  'export-stats': buildExportStats,
  'export-gencad': buildExportGencad,
  'export-ipcd356': buildExportIpcd356,
  'export-dxf': buildExportDxf,
  'export-pos': buildExportPos,
  'export-fp-svg': buildExportFpSvg,
  'export-sym-svg': buildExportSymSvg,
  'export-sch-bom': buildExportSchBom,
  'export-netlist': buildExportNetlist
};
function resolveExportCommandBuildContext(
  file: string,
  outputDir: string,
  options: ExportCommandBuildOptions
): ExportCommandBuildContext {
  const versionMajor = options.versionMajor ?? 9;
  return {
    file,
    outputDir,
    options,
    precision: options.precision ?? '6',
    ipcVersion: options.ipcVersion ?? 'C',
    ipcUnits: options.ipcUnits ?? 'mm',
    theme: options.theme ?? 'dark',
    bomFields: options.bomFields ?? [],
    versionMajor,
    bomPresetFlag: versionMajor >= 10 ? '--preset' : '--format-preset'
  };
}

function buildExportGerbers(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, options, precision, versionMajor } = context;
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

function buildExportGerbersWithDrill(
  context: ExportCommandBuildContext
): string[][] {
  const { file, outputDir, options } = context;
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
}

function buildExportPdfSch(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, theme } = context;
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
}

function buildExportPdfPcb(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
}

function buildExport3dPdf(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, options, versionMajor } = context;
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
}

function buildExportSvg(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
}

function buildExportIpc2581(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, ipcVersion, ipcUnits } = context;
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
}

function buildExportOdb(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
}

function buildExportGlb(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
}

function buildExportBrep(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, versionMajor } = context;
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
}

function buildExportPly(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, options, versionMajor } = context;
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
}

function buildExportStep(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, options, versionMajor } = context;
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
}

function buildExportStpz(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, options, versionMajor } = context;
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
}

function buildExportXao(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, options, versionMajor } = context;
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
}

function buildExportStl(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, options, versionMajor } = context;
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
}

function buildExportU3d(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, options, versionMajor } = context;
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
}

function buildExportVrml(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, options, versionMajor } = context;
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
}

function buildExportPsPcb(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
}

function buildExportPsSch(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, theme } = context;
  return [
    ['sch', 'export', 'ps', '--output', outputDir, '--theme', theme, file]
  ];
}

function buildExportStats(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
}

function buildExportGencad(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
}

function buildExportIpcd356(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
}

function buildExportDxf(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
}

function buildExportPos(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
}

function buildExportFpSvg(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
  return [['fp', 'export', 'svg', '--output', outputDir, file]];
}

function buildExportSymSvg(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, theme } = context;
  return [
    ['sym', 'export', 'svg', '--output', outputDir, '--theme', theme, file]
  ];
}

function buildExportSchBom(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir, bomFields, bomPresetFlag } = context;
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
}

function buildExportNetlist(context: ExportCommandBuildContext): string[][] {
  const { file, outputDir } = context;
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
