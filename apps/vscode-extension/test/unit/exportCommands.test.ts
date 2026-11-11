import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  CliExitError,
  KiCadCliCancelledError,
  KiCadCliNotFoundError
} from '../../src/errors';
import {
  buildCliExportCommands,
  discoverGerberLayers,
  KiCadExportService
} from '../../src/cli/exportCommands';
import { BomParser } from '../../src/bom/bomParser';
import { SExpressionParser } from '../../src/language/sExpressionParser';
import { zipDirectory } from '../../src/utils/zipUtils';
import { __setConfiguration } from './vscodeMock';

describe('buildCliExportCommands', () => {
  beforeEach(() => {
    __setConfiguration({
      'kicadstudio.gerber.precision': 6,
      'kicadstudio.ipc2581.version': 'C',
      'kicadstudio.ipc2581.units': 'mm',
      'kicadstudio.viewer.theme': 'kicad',
      'kicadstudio.bom.fields': ['Reference', 'Value', 'Footprint']
    });
  });

  it('builds KiCad 9+ 3D and CAM export commands', () => {
    const pcb = 'C:\\project\\board.kicad_pcb';
    expect(
      buildCliExportCommands('export-brep', pcb, 'fab', { versionMajor: 9 })[0]
    ).toContain('brep');
    expect(
      buildCliExportCommands('export-ply', pcb, 'fab', { versionMajor: 9 })[0]
    ).toContain('ply');
    expect(
      buildCliExportCommands('export-gencad', pcb, 'fab', {
        versionMajor: 9
      })[0]
    ).toContain('gencad');
    expect(
      buildCliExportCommands('export-ipcd356', pcb, 'fab', {
        versionMajor: 9
      })[0]
    ).toContain('ipcd356');
  });

  it('builds Gerber precision for the supported KiCad 8, 9, and 10 lines', () => {
    const pcb = '/project/board.kicad_pcb';
    for (const versionMajor of [8, 9, 10]) {
      expect(
        buildCliExportCommands('export-gerbers', pcb, '/project/fab', {
          versionMajor
        })[0]
      ).toEqual(expect.arrayContaining(['--precision', '6']));
    }
    expect(
      buildCliExportCommands('export-gerbers', pcb, '/project/fab', {
        versionMajor: 7
      })[0]
    ).not.toContain('--precision');
  });

  it('validates command construction across the KiCad support matrix', () => {
    const pcb = '/project/board.kicad_pcb';
    const schematic = '/project/design.kicad_sch';

    for (const versionMajor of [8, 9, 10]) {
      expect(
        buildCliExportCommands('export-gerbers', pcb, '/project/fab', {
          versionMajor
        })[0]
      ).toEqual(
        expect.arrayContaining([
          'pcb',
          'export',
          'gerbers',
          '--output',
          '/project/fab',
          pcb
        ])
      );
      expect(
        buildCliExportCommands('export-pdf-sch', schematic, '/project/fab', {
          versionMajor
        })[0]
      ).toEqual(expect.arrayContaining(['sch', 'export', 'pdf', schematic]));
      expect(
        buildCliExportCommands('export-netlist', schematic, '/project/fab', {
          versionMajor
        })[0]
      ).toEqual(
        expect.arrayContaining([
          'sch',
          'export',
          'netlist',
          '--format',
          'kicadsexpr',
          schematic
        ])
      );
    }
  });

  it('discovers active Gerber layers from the board stackup', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-layers-'));
    const board = path.join(root, 'stackup.kicad_pcb');
    fs.writeFileSync(
      board,
      `(kicad_pcb
        (layers
          (0 "F.Cu" signal)
          (1 "In1.Cu" signal)
          (2 "In2.Cu" signal)
          (31 "B.Cu" signal)
          (36 "B.SilkS" user "B.Silkscreen")
          (44 "Edge.Cuts" user)
        )
      )`,
      'utf8'
    );

    try {
      const gerberLayers = await discoverGerberLayers(board);
      expect(gerberLayers).toEqual([
        'F.Cu',
        'In1.Cu',
        'In2.Cu',
        'B.Cu',
        'B.SilkS',
        'Edge.Cuts'
      ]);
      expect(
        buildCliExportCommands('export-gerbers', board, root, {
          versionMajor: 10,
          gerberLayers
        })[0]
      ).toEqual(
        expect.arrayContaining([
          '--layers',
          'F.Cu,In1.Cu,In2.Cu,B.Cu,B.SilkS,Edge.Cuts'
        ])
      );
      expect(
        buildCliExportCommands('export-pdf-pcb', board, root, {
          versionMajor: 10,
          gerberLayers
        })[0]
      ).toEqual(
        expect.arrayContaining([
          '--layers',
          'F.Cu,In1.Cu,In2.Cu,B.Cu,B.SilkS,Edge.Cuts',
          path.join(root, 'stackup-pcb.pdf')
        ])
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs PCB PDF through real board-layer discovery, not the invalid ALL pseudo-layer', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-pdf-inner-layers-')
    );
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.relative(
        process.cwd(),
        path.join(root, 'fab')
      )
    });
    const board = path.join(root, 'inner.kicad_pcb');
    fs.writeFileSync(
      board,
      `(kicad_pcb
      (layers
        (0 "F.Cu" signal)
        (18 "In18.Cu" signal)
        (21 "In21.Cu" signal)
        (31 "B.Cu" signal)
        (44 "Edge.Cuts" user)
      )
    )`
    );
    const runner = { runWithProgress: jest.fn().mockResolvedValue('Done.') };
    const detector = {
      detect: jest.fn().mockResolvedValue({ version: '10.0.8' })
    };
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );
    try {
      await service.exportPCBPDF(vscode.Uri.file(board));
      expect(runner.runWithProgress).toHaveBeenCalledTimes(1);
      expect(runner.runWithProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.arrayContaining([
            'pcb',
            'export',
            'pdf',
            '--layers',
            'F.Cu,In18.Cu,In21.Cu,B.Cu,Edge.Cuts',
            '--output',
            path.join(root, 'fab', 'inner-pcb.pdf'),
            board
          ])
        })
      );
      const command = (
        runner.runWithProgress.mock.calls[0]?.[0] as { command: string[] }
      ).command;
      expect(command).not.toContain('ALL');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Export completed successfully.',
        'Open Output Folder'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses a valid named PCB PDF fallback when board layer metadata is absent', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-pdf-layers-fallback-')
    );
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.relative(
        process.cwd(),
        path.join(root, 'fab')
      )
    });
    const board = path.join(root, 'legacy.kicad_pcb');
    fs.writeFileSync(board, '(kicad_pcb (version 20211014))');
    const runner = { runWithProgress: jest.fn().mockResolvedValue('Done.') };
    const detector = {
      detect: jest.fn().mockResolvedValue({ version: '10.0.8' })
    };
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );
    try {
      await service.exportPCBPDF(vscode.Uri.file(board));
      expect(runner.runWithProgress).toHaveBeenCalledTimes(1);
      const command = (
        runner.runWithProgress.mock.calls[0]?.[0] as { command: string[] }
      ).command;
      expect(command).toContain(
        'F.Cu,B.Cu,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts,F.Fab,B.Fab'
      );
      expect(command).not.toContain('ALL');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not discover Gerber layers')
      );
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Could not discover board layers. Export will use the default fabrication layer set.'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps Gerber, drill and schematic PDF paths distinct with proper layer discovery', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-pdf-gerber-regression-')
    );
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.relative(
        process.cwd(),
        path.join(root, 'fab')
      )
    });
    const board = path.join(root, 'sample.kicad_pcb');
    const schematic = path.join(root, 'sample.kicad_sch');
    fs.writeFileSync(
      board,
      `(kicad_pcb
       (layers
         (0 "F.Cu" signal)
         (1 "In1.Cu" signal)
         (31 "B.Cu" signal)
         (44 "Edge.Cuts" user)
       )
    )`
    );
    fs.writeFileSync(schematic, '(kicad_sch (version 20250114))');
    const runner = { runWithProgress: jest.fn().mockResolvedValue('Done.') };
    const detector = {
      detect: jest.fn().mockResolvedValue({ version: '10.0.8' })
    };
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );
    try {
      await service.exportGerbers(vscode.Uri.file(board));
      await service.exportGerbersWithDrill(vscode.Uri.file(board));
      await service.exportPDF(vscode.Uri.file(schematic));
      expect(runner.runWithProgress).toHaveBeenCalledTimes(4);
      const commands = runner.runWithProgress.mock.calls.map(
        ([call]: [{ command: string[] }]) => call.command
      );
      expect(commands[0]).toEqual(
        expect.arrayContaining([
          'pcb',
          'export',
          'gerbers',
          '--layers',
          'F.Cu,In1.Cu,B.Cu,Edge.Cuts',
          board
        ])
      );
      expect(commands[1]).toEqual(
        expect.arrayContaining([
          'pcb',
          'export',
          'gerbers',
          '--layers',
          'F.Cu,In1.Cu,B.Cu,Edge.Cuts',
          board
        ])
      );
      expect(commands[2]).toEqual(
        expect.arrayContaining(['pcb', 'export', 'drill', board])
      );
      expect(commands[3]).toEqual(
        expect.arrayContaining([
          'sch',
          'export',
          'pdf',
          '--output',
          path.join(root, 'fab', 'sample.pdf'),
          schematic
        ])
      );
      expect(logger.warn).not.toHaveBeenCalled();
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps schematic SVG output inside its folder and never adds PCB layers', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp-sch-svg-'));
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.relative(
        process.cwd(),
        path.join(root, 'fab')
      )
    });
    const schematic = path.join(root, 'sheet.kicad_sch');
    fs.writeFileSync(schematic, '(kicad_sch (version 20250114))');
    const runner = { runWithProgress: jest.fn().mockResolvedValue('Done.') };
    const detector = {
      detect: jest.fn().mockResolvedValue({ version: '10.0.8' })
    };
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );
    try {
      await service.exportSVG(vscode.Uri.file(schematic));
      expect(runner.runWithProgress).toHaveBeenCalledTimes(1);
      const command = (
        runner.runWithProgress.mock.calls[0]?.[0] as { command: string[] }
      ).command;
      expect(command).toEqual([
        'sch',
        'export',
        'svg',
        '--output',
        path.join(root, 'fab'),
        schematic
      ]);
      expect(logger.warn).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('warns and uses valid SVG layers for legacy boards without layer metadata', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-pcb-svg-fallback-')
    );
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.relative(
        process.cwd(),
        path.join(root, 'fab')
      )
    });
    const board = path.join(root, 'legacy.kicad_pcb');
    fs.writeFileSync(board, '(kicad_pcb (version 20211014))');
    const runner = { runWithProgress: jest.fn().mockResolvedValue('Done.') };
    const detector = {
      detect: jest.fn().mockResolvedValue({ version: '10.0.8' })
    };
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );
    try {
      await service.exportSVG(vscode.Uri.file(board));
      expect(runner.runWithProgress).toHaveBeenCalledTimes(1);
      const command = (
        runner.runWithProgress.mock.calls[0]?.[0] as { command: string[] }
      ).command;
      expect(command).toContain('--mode-multi');
      expect(command).toContain(
        'F.Cu,B.Cu,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts,F.Fab,B.Fab'
      );
      expect(command).not.toContain('ALL');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not discover Gerber layers')
      );
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Could not discover board layers. Export will use the default fabrication layer set.'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs SVG export through genuine board layer discovery without ALL', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-pcb-svg-layers-')
    );
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.relative(
        process.cwd(),
        path.join(root, 'fab')
      )
    });
    const board = path.join(root, 'board.kicad_pcb');
    fs.writeFileSync(
      board,
      `(kicad_pcb
      (layers
        (0 "F.Cu" signal)
        (18 "In18.Cu" signal)
        (21 "In21.Cu" signal)
        (31 "B.Cu" signal)
        (44 "Edge.Cuts" user)
      )
    )`
    );
    const runner = { runWithProgress: jest.fn().mockResolvedValue('Done.') };
    const detector = {
      detect: jest.fn().mockResolvedValue({ version: '10.0.8' })
    };
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );
    try {
      await service.exportSVG(vscode.Uri.file(board));
      expect(runner.runWithProgress).toHaveBeenCalledTimes(1);
      const command = (
        runner.runWithProgress.mock.calls[0]?.[0] as { command: string[] }
      ).command;
      expect(command).toEqual([
        'pcb',
        'export',
        'svg',
        '--output',
        path.join(root, 'fab'),
        '--mode-multi',
        '--layers',
        'F.Cu,In18.Cu,In21.Cu,B.Cu,Edge.Cuts',
        board
      ]);
      expect(command).not.toContain('ALL');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Export completed successfully.',
        'Open Output Folder'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses a safe default Gerber layer set when discovery is unavailable', () => {
    const command = buildCliExportCommands(
      'export-gerbers',
      '/missing/board.kicad_pcb',
      '/project/fab',
      { versionMajor: 10, gerberLayers: [] }
    )[0];

    expect(command).toEqual(
      expect.arrayContaining([
        '--layers',
        'F.Cu,B.Cu,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts,F.Fab,B.Fab'
      ])
    );
  });

  it('uses explicit Gerber layers when provided by capability probing', () => {
    const command = buildCliExportCommands(
      'export-gerbers',
      '/project/board.kicad_pcb',
      '/project/fab',
      {
        versionMajor: 10,
        gerberLayers: ['F.Cu', 'B.Cu', 'User.1']
      }
    )[0];

    expect(command).toEqual(
      expect.arrayContaining(['--layers', 'F.Cu,B.Cu,User.1'])
    );
  });

  it('returns empty commands for BREP and PLY on KiCad 7 and older', () => {
    const pcb = '/project/board.kicad_pcb';
    expect(
      buildCliExportCommands('export-brep', pcb, '/project/fab', {
        versionMajor: 7
      })
    ).toEqual([]);
    expect(
      buildCliExportCommands('export-ply', pcb, '/project/fab', {
        versionMajor: 7
      })
    ).toEqual([]);
  });

  it('builds pick-and-place export as CSV in millimeters', () => {
    const command = buildCliExportCommands(
      'export-pos',
      '/project/board.kicad_pcb',
      '/project/fab'
    )[0];
    expect(command).toEqual(
      expect.arrayContaining([
        'pos',
        '--format',
        'csv',
        '--units',
        'mm',
        '--side',
        'both'
      ])
    );
  });

  it('builds symbol and footprint SVG export commands', () => {
    expect(
      buildCliExportCommands(
        'export-fp-svg',
        '/project/R_0603.kicad_mod',
        '/project/fab'
      )[0]
    ).toEqual([
      'fp',
      'export',
      'svg',
      '--output',
      '/project/fab',
      '/project/R_0603.kicad_mod'
    ]);
    expect(
      buildCliExportCommands(
        'export-sym-svg',
        '/project/lib.kicad_sym',
        '/project/fab'
      )[0]
    ).toEqual([
      'sym',
      'export',
      'svg',
      '--output',
      '/project/fab',
      '--theme',
      'kicad',
      '/project/lib.kicad_sym'
    ]);
  });

  it('resolves configured values through the compatibility wrapper', () => {
    __setConfiguration({
      'kicadstudio.gerber.precision': 7,
      'kicadstudio.ipc2581.version': 'B',
      'kicadstudio.ipc2581.units': 'inch',
      'kicadstudio.viewer.theme': 'kicad-classic',
      'kicadstudio.bom.fields': ['Reference', 'MPN']
    });

    expect(
      buildCliExportCommands(
        'export-gerbers',
        '/project/board.kicad_pcb',
        '/project/fab'
      )[0]
    ).toEqual(expect.arrayContaining(['--precision', '7']));
    expect(
      buildCliExportCommands(
        'export-ipc2581',
        '/project/board.kicad_pcb',
        '/project/fab'
      )[0]
    ).toEqual(expect.arrayContaining(['--version', 'B', '--units', 'inch']));
    expect(
      buildCliExportCommands(
        'export-sym-svg',
        '/project/library.kicad_sym',
        '/project/fab'
      )[0]
    ).toEqual(expect.arrayContaining(['--theme', 'kicad-classic']));
    expect(
      buildCliExportCommands(
        'export-sch-bom',
        '/project/main.kicad_sch',
        '/project/fab'
      )[0]
    ).toEqual(expect.arrayContaining(['--fields', 'Reference,MPN']));
  });
});

describe('zipDirectory', () => {
  it('creates a readable zip archive', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-zip-'));
    const sourceDir = path.join(root, 'source');
    const outputFile = path.join(root, 'package.zip');
    fs.mkdirSync(path.join(sourceDir, 'nested'), { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, 'manifest.json'),
      '{"ok":true}',
      'utf8'
    );
    fs.writeFileSync(
      path.join(sourceDir, 'nested', 'board.gbr'),
      'G04 test*',
      'utf8'
    );

    await zipDirectory(sourceDir, outputFile);

    const archive = fs.readFileSync(outputFile);
    expect(archive.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(archive.toString('utf8')).toContain('manifest.json');
    expect(archive.toString('utf8')).toContain('nested/board.gbr');
  });

  it('uses the KiCad 10 BOM preset flag while keeping legacy fallback', () => {
    const modern = buildCliExportCommands(
      'export-sch-bom',
      '/project/main.kicad_sch',
      '/project/fab',
      {
        versionMajor: 10
      }
    )[0];
    const legacy = buildCliExportCommands(
      'export-sch-bom',
      '/project/main.kicad_sch',
      '/project/fab',
      {
        versionMajor: 9
      }
    )[0];

    expect(modern).toEqual(expect.arrayContaining(['--preset', 'CSV']));
    expect(modern).not.toContain('--format-preset');
    expect(legacy).toEqual(expect.arrayContaining(['--format-preset', 'CSV']));
  });
});

describe('KiCadExportService.renderViewerSvg', () => {
  it('returns the generated schematic SVG for inline fallback rendering', async () => {
    __setConfiguration({
      'kicadstudio.viewer.theme': 'kicad',
      'kicadstudio.bom.fields': ['Reference']
    });

    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-export-service-')
    );
    const schematicFile = path.join(workspaceRoot, 'sample.kicad_sch');
    fs.writeFileSync(schematicFile, '(kicad_sch (symbol "U1"))', 'utf8');

    const runner = {
      run: jest.fn(async ({ command }: { command: string[] }) => {
        const outputDir = command[command.indexOf('--output') + 1];
        if (!outputDir) {
          throw new Error('Missing output directory.');
        }
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(
          path.join(outputDir, 'sample.svg'),
          '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
          'utf8'
        );
        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
          durationMs: 1
        };
      })
    };
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: 'kicad-cli',
        version: '10.0.1'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );

    const svg = await service.renderViewerSvg(vscode.Uri.file(schematicFile));

    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.arrayContaining(['sch', 'export', 'svg', '--output'])
      })
    );
    expect(svg).toContain('<svg');

    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('uses single-file PCB SVG export for board fallback rendering on KiCad 9+', async () => {
    __setConfiguration({
      'kicadstudio.viewer.theme': 'kicad'
    });

    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-board-export-')
    );
    const boardFile = path.join(workspaceRoot, 'board.kicad_pcb');
    fs.writeFileSync(
      boardFile,
      `(kicad_pcb
        (layers
          (0 "F.Cu" signal)
          (31 "B.Cu" signal)
          (36 "B.SilkS" user "B.Silkscreen")
          (37 "F.SilkS" user "F.Silkscreen")
          (44 "Edge.Cuts" user)
        )
        (footprint "R1")
      )`,
      'utf8'
    );

    const runner = {
      run: jest.fn(async ({ command }: { command: string[] }) => {
        const outputPath = command[command.indexOf('--output') + 1];
        if (!outputPath) {
          throw new Error('Missing output file.');
        }
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(
          outputPath,
          '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>',
          'utf8'
        );
        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
          durationMs: 1
        };
      })
    };
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: 'kicad-cli',
        version: '10.0.1'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );

    const svg = await service.renderViewerSvg(vscode.Uri.file(boardFile));

    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.arrayContaining([
          'pcb',
          'export',
          'svg',
          '--mode-single',
          '--page-size-mode',
          '0'
        ])
      })
    );
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.not.arrayContaining(['--theme'])
      })
    );
    expect(svg).toContain('<svg');

    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('explains PLY export failure from an older OCCT build and offers local alternatives', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-ply-occt-guidance-')
    );
    const board = path.join(root, 'board.kicad_pcb');
    fs.writeFileSync(board, '(kicad_pcb)', 'utf8');
    __setConfiguration({ 'kicadstudio.defaultOutputDir': 'fab' });
    const runner = {
      runWithProgress: jest.fn().mockRejectedValue(
        new CliExitError({
          command: 'pcb export ply --output /private/project/model.ply',
          code: 2,
          stdout: '',
          stderr:
            'KiCad command failed.\nPLY export is not supported before OCCT 7.7.0\n** Error writing PLY file. **'
        })
      )
    };
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.8'
      }),
      hasCapability: jest.fn().mockResolvedValue(true)
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );
    try {
      await service.export3DPLY(vscode.Uri.file(board));
      expect(runner.runWithProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.arrayContaining(['pcb', 'export', 'ply'])
        })
      );
      const messages = (vscode.window.showErrorMessage as jest.Mock).mock.calls;
      expect(messages).toHaveLength(1);
      const message = messages[0]?.[0] as string;
      expect(message).toContain('OCCT 7.7.0');
      expect(message).toContain('STL');
      expect(message).toContain('GLB');
      expect(message).not.toContain('/private/project/');
      expect(message).not.toContain('confirm kicad-cli is installed');
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(
        'Export completed successfully.',
        'Open Output Folder'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('stops failed exports without showing a false success action', async () => {
    jest.clearAllMocks();
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.join(
        process.cwd(),
        '.tmp-export-failure'
      ),
      'kicadstudio.viewer.theme': 'kicad'
    });
    const workspaceRoot = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-kicadstudio-export-failure-')
    );
    const schematicFile = path.join(workspaceRoot, 'failed.kicad_sch');
    fs.writeFileSync(schematicFile, '(kicad_sch (symbol "U1"))', 'utf8');
    const runner = {
      runWithProgress: jest.fn().mockRejectedValue(new Error('cli failed'))
    };
    const detector = {
      detect: jest.fn()
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );

    try {
      await expect(
        service.exportSVG(vscode.Uri.file(schematicFile))
      ).resolves.toBeUndefined();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'cli failed\nWhat happened: the export command failed.\nHow to fix: confirm kicad-cli is installed and the target file opens in KiCad.'
      );
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(
        'Export completed successfully.',
        'Open Output Folder'
      );
      expect(vscode.env.openExternal).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      fs.rmSync(path.join(process.cwd(), '.tmp-export-failure'), {
        recursive: true,
        force: true
      });
    }
  });

  it('reports unsafe output directories without running exports', async () => {
    jest.clearAllMocks();
    const workspaceRoot = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-kicadstudio-output-root-')
    );
    const outsideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-outside-output-')
    );
    const schematicFile = path.join(workspaceRoot, 'unsafe.kicad_sch');
    fs.writeFileSync(schematicFile, '(kicad_sch (symbol "U1"))', 'utf8');
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.join(outsideRoot, 'fab'),
      'kicadstudio.viewer.theme': 'kicad'
    });

    const runner = {
      runWithProgress: jest.fn()
    };
    const detector = {
      detect: jest.fn()
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never
    );

    try {
      await expect(
        service.exportSVG(vscode.Uri.file(schematicFile))
      ).resolves.toBeUndefined();
      expect(runner.runWithProgress).not.toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining(
          'What happened: output directory validation failed.'
        )
      );
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(
        'Export completed successfully.',
        'Open Output Folder'
      );
      expect(vscode.env.openExternal).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'Resolving output directory failed',
        'validation-error'
      );
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('does not attach unrelated workspace schematics to a PCB package', async () => {
    jest.clearAllMocks();
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-schematic-match-')
    );
    const pcbFile = path.join(workspaceRoot, 'controller.kicad_pcb');
    const unrelatedSchematic = path.join(workspaceRoot, 'power.kicad_sch');
    const matchingSchematic = path.join(workspaceRoot, 'controller.kicad_sch');
    const service = new KiCadExportService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    ) as unknown as {
      findSiblingSchematic(pcbFile: string): Promise<string | undefined>;
    };

    try {
      (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
        vscode.Uri.file(unrelatedSchematic)
      ]);
      await expect(service.findSiblingSchematic(pcbFile)).resolves.toBe(
        undefined
      );
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Could not determine the matching schematic for this PCB. Place the schematic next to the PCB with the same base name, or run BOM export explicitly.'
      );

      (vscode.window.showWarningMessage as jest.Mock).mockClear();
      (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
        vscode.Uri.file(unrelatedSchematic),
        vscode.Uri.file(matchingSchematic)
      ]);
      await expect(service.findSiblingSchematic(pcbFile)).resolves.toBe(
        matchingSchematic
      );
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    } finally {
      (vscode.workspace.findFiles as jest.Mock).mockReset();
      (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

describe('KiCadExportService source selection for visible custom editors', () => {
  it('uses the foreground schematic tab rather than a stale text editor when exporting', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-export-tab-'));
    const foreground = path.join(root, 'foreground.kicad_sch');
    const stale = path.join(root, 'stale.kicad_sch');
    fs.writeFileSync(foreground, '(kicad_sch)', 'utf8');
    fs.writeFileSync(stale, '(kicad_sch)', 'utf8');
    const mockWindow = vscode.window as unknown as {
      activeTextEditor: { document: { uri: vscode.Uri } } | undefined;
      tabGroups: {
        activeTabGroup: {
          activeTab: { input: { uri: vscode.Uri } } | undefined;
        };
      };
    };
    const previousEditor = mockWindow.activeTextEditor;
    const previousTab = mockWindow.tabGroups.activeTabGroup.activeTab;
    const service = new KiCadExportService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    try {
      mockWindow.activeTextEditor = {
        document: { uri: vscode.Uri.file(stale) }
      };
      mockWindow.tabGroups.activeTabGroup.activeTab = {
        input: { uri: vscode.Uri.file(foreground) }
      };
      const resolved = await (
        service as unknown as {
          resolveTargetFile(
            resource: vscode.Uri | undefined,
            expectedExtensions: string[]
          ): Promise<string | undefined>;
        }
      ).resolveTargetFile(undefined, ['.kicad_sch']);
      expect(resolved).toBe(foreground);
    } finally {
      mockWindow.activeTextEditor = previousEditor;
      mockWindow.tabGroups.activeTabGroup.activeTab = previousTab;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('KiCadExportService complete BOM source and failure handling', () => {
  const load = (service: KiCadExportService, file: string) =>
    (
      service as unknown as {
        loadBomEntries: (
          file: string
        ) => Promise<Array<{ references: string[] }>>;
      }
    ).loadBomEntries(file);

  it('keeps flat schematics available without requiring a native BOM capability', async () => {
    __setConfiguration({});
    const file = path.resolve(__dirname, '..', 'fixtures', 'sample.kicad_sch');
    const detector = { hasCapability: jest.fn() };
    const service = new KiCadExportService(
      {} as never,
      detector as never,
      new BomParser(new SExpressionParser()),
      {} as never,
      {} as never,
      {} as never
    );
    const result = await load(service, file);
    expect(result.flatMap((entry) => entry.references).sort()).toEqual([
      'C1',
      'R1',
      'R2'
    ]);
    expect(detector.hasCapability).not.toHaveBeenCalled();
  });

  it('fails closed on hierarchical schematics without KiCad BOM support', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-bom-guard-'));
    const file = path.join(root, 'parent.kicad_sch');
    fs.writeFileSync(
      file,
      '(kicad_sch (sheet (property "Sheetfile" "child.kicad_sch")))',
      'utf8'
    );
    const detector = { hasCapability: jest.fn().mockResolvedValue(false) };
    const runner = { runWithProgress: jest.fn() };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      new BomParser(new SExpressionParser()),
      {} as never,
      {} as never,
      {} as never
    );
    try {
      await expect(load(service, file)).rejects.toThrow(
        'A complete multi-sheet BOM needs a compatible KiCad CLI'
      );
      expect(detector.hasCapability).toHaveBeenCalledWith('bom');
      expect(runner.runWithProgress).not.toHaveBeenCalled();
      expect(fs.readdirSync(root)).toEqual(['parent.kicad_sch']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads the native hierarchical BOM and removes the temporary CLI output', async () => {
    __setConfiguration({});
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-bom-native-'));
    const file = path.join(root, 'parent.kicad_sch');
    fs.writeFileSync(
      file,
      '(kicad_sch (sheet (property "Sheetfile" "child.kicad_sch")))',
      'utf8'
    );
    let temporaryCsv: string | undefined;
    const runner = {
      runWithProgress: jest.fn().mockImplementation(async ({ command }) => {
        const outputIndex = command.indexOf('--output');
        temporaryCsv = command[outputIndex + 1];
        fs.writeFileSync(
          temporaryCsv!,
          '"Reference","Value","Footprint","Quantity","DNP","MPN","Manufacturer","LCSC","Description"\n' +
            '"R1","10k","R_0603","1","","","","",""\n',
          'utf8'
        );
      })
    };
    const service = new KiCadExportService(
      runner as never,
      { hasCapability: jest.fn().mockResolvedValue(true) } as never,
      new BomParser(new SExpressionParser()),
      {} as never,
      {} as never,
      {} as never
    );
    try {
      expect((await load(service, file)).flatMap((e) => e.references)).toEqual([
        'R1'
      ]);
      expect(temporaryCsv).toBeDefined();
      expect(fs.existsSync(temporaryCsv!)).toBe(false);
      expect(runner.runWithProgress).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses an empty native hierarchical BOM and removes its temporary file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-bom-empty-'));
    const file = path.join(root, 'parent.kicad_sch');
    fs.writeFileSync(
      file,
      '(kicad_sch (sheet (property "Sheetfile" "child.kicad_sch")))',
      'utf8'
    );
    let temporaryCsv: string | undefined;
    const runner = {
      runWithProgress: jest.fn().mockImplementation(async ({ command }) => {
        temporaryCsv = command[command.indexOf('--output') + 1];
        fs.writeFileSync(
          temporaryCsv!,
          '"Reference","Value","Footprint","Quantity","DNP","MPN","Manufacturer","LCSC","Description"\n',
          'utf8'
        );
      })
    };
    const service = new KiCadExportService(
      runner as never,
      { hasCapability: jest.fn().mockResolvedValue(true) } as never,
      new BomParser(new SExpressionParser()),
      {} as never,
      {} as never,
      {} as never
    );
    try {
      await expect(load(service, file)).rejects.toThrow(
        'KiCad returned an empty multi-sheet BOM; export stopped.'
      );
      expect(temporaryCsv).toBeDefined();
      expect(fs.existsSync(temporaryCsv!)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('KiCadExportService BOM user export outcomes', () => {
  const makeFixture = () => {
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-studio-bom-user-flow-')
    );
    const file = path.join(root, 'real.kicad_sch');
    fs.writeFileSync(
      file,
      '(kicad_sch (sheet (property "Sheetfile" "child.kicad_sch")))',
      'utf8'
    );
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.join(path.basename(root), 'fab'),
      'kicadstudio.bom.groupIdentical': false
    });
    return { root, file, outputDir: path.join(root, 'fab') };
  };

  afterEach(() => {
    jest.clearAllMocks();
    __setConfiguration({});
  });

  it('publishes CSV and XLSX completion only after each export succeeds', async () => {
    const { root, file, outputDir } = makeFixture();
    const entries = [
      {
        references: ['R1'],
        value: '10k',
        footprint: 'R_0603',
        quantity: 1,
        mpn: '',
        manufacturer: '',
        lcsc: '',
        description: '',
        dnp: false
      }
    ];
    const bomExporter = {
      exportCsv: jest.fn().mockResolvedValue(undefined),
      exportXlsx: jest.fn().mockResolvedValue(undefined)
    };
    const state = { begin: jest.fn(), complete: jest.fn(), fail: jest.fn() };
    const logger = { error: jest.fn() };
    const service = new KiCadExportService(
      {} as never,
      {} as never,
      {} as never,
      bomExporter as never,
      {} as never,
      logger as never,
      state as never
    );
    Object.defineProperty(service, 'loadBomEntries', {
      value: jest.fn().mockResolvedValue(entries)
    });
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(
      undefined
    );
    try {
      await service.exportBOMCSV(vscode.Uri.file(file));
      await service.exportBOMXLSX(vscode.Uri.file(file));
      expect(bomExporter.exportCsv).toHaveBeenCalledWith(
        entries,
        path.join(outputDir, 'real-bom.csv')
      );
      expect(bomExporter.exportXlsx).toHaveBeenCalledWith(
        entries,
        path.join(outputDir, 'real-bom.xlsx')
      );
      expect(state.begin).toHaveBeenCalledTimes(2);
      expect(state.complete).toHaveBeenCalledTimes(2);
      expect(state.fail).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('shows a recoverable error instead of claiming success when KiCad CLI is unavailable', async () => {
    const { root, file } = makeFixture();
    const detector = { hasCapability: jest.fn().mockResolvedValue(false) };
    const bomExporter = { exportCsv: jest.fn() };
    const state = { begin: jest.fn(), complete: jest.fn(), fail: jest.fn() };
    const logger = { error: jest.fn() };
    const runner = { runWithProgress: jest.fn() };
    const service = new KiCadExportService(
      runner as never,
      detector as never,
      new BomParser(new SExpressionParser()),
      bomExporter as never,
      {} as never,
      logger as never,
      state as never
    );
    try {
      await expect(
        service.exportBOMCSV(vscode.Uri.file(file))
      ).resolves.toBeUndefined();
      expect(detector.hasCapability).toHaveBeenCalledWith('bom');
      expect(runner.runWithProgress).not.toHaveBeenCalled();
      expect(bomExporter.exportCsv).not.toHaveBeenCalled();
      expect(state.fail).toHaveBeenCalledWith(
        'bom',
        vscode.Uri.file(file),
        'A complete multi-sheet BOM needs a compatible KiCad CLI. Configure KiCad and try again.'
      );
      expect(state.complete).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'BOM export failed',
        'A complete multi-sheet BOM needs a compatible KiCad CLI. Configure KiCad and try again.'
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'BOM export failed. A complete multi-sheet BOM needs a compatible KiCad CLI. Configure KiCad and retry.'
      );
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not export when there is no schematic or output would escape the workspace', async () => {
    const { root, file } = makeFixture();
    const bomExporter = { exportCsv: jest.fn() };
    const logger = { error: jest.fn() };
    const service = new KiCadExportService(
      {} as never,
      {} as never,
      {} as never,
      bomExporter as never,
      {} as never,
      logger as never
    );
    try {
      (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);
      await service.exportBOMCSV();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('No .kicad_sch file')
      );
      const outside = fs.mkdtempSync(
        path.join(os.tmpdir(), 'studio-bom-outside-')
      );
      try {
        __setConfiguration({
          'kicadstudio.defaultOutputDir': path.join(outside, 'fab')
        });
        await service.exportBOMCSV(vscode.Uri.file(file));
        expect(logger.error).toHaveBeenCalledWith(
          'Resolving output directory failed',
          'validation-error'
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining('output directory validation failed')
        );
        expect(bomExporter.exportCsv).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      (vscode.workspace.findFiles as jest.Mock)
        .mockReset()
        .mockResolvedValue([]);
    }
  });
});

describe('KiCadExportService blocked local BOM output recovery', () => {
  it('protects a user file, gives actionable private-safe guidance and succeeds on retry', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-studio-bom-output-recovery-')
    );
    const file = path.join(root, 'controller.kicad_sch');
    const outputDir = path.join(root, 'fab');
    fs.writeFileSync(file, '(kicad_sch)', 'utf8');
    fs.writeFileSync(outputDir, 'Keep my file!', 'utf8');
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.join(path.basename(root), 'fab')
    });
    const bomExporter = { exportCsv: jest.fn().mockResolvedValue(undefined) };
    const logger = { error: jest.fn() };
    const service = new KiCadExportService(
      {} as never,
      {} as never,
      {} as never,
      bomExporter as never,
      {} as never,
      logger as never
    );
    const entries = [{ references: ['R1'], quantity: 1 }];
    Object.defineProperty(service, 'loadBomEntries', {
      value: jest.fn().mockResolvedValue(entries)
    });
    try {
      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(fs.readFileSync(outputDir, 'utf8')).toBe('Keep my file!');
      expect(bomExporter.exportCsv).not.toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('How to fix: rename or move the blocking file')
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Resolving output directory failed',
        'EEXIST'
      );
      const message = (vscode.window.showErrorMessage as jest.Mock).mock
        .calls[0]?.[0] as string;
      expect(message).not.toContain(root);
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(
        'Export completed successfully.',
        'Open Output Folder'
      );

      fs.unlinkSync(outputDir);
      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(bomExporter.exportCsv).toHaveBeenCalledWith(
        entries,
        path.join(outputDir, 'controller-bom.csv')
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Export completed successfully.',
        'Open Output Folder'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      __setConfiguration({});
    }
  });
});

describe('KiCadExportService real BOM permission failures', () => {
  it('identifies output EACCES without revealing the folder and succeeds after repair', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-studio-bom-permission-')
    );
    const file = path.join(root, 'controller.kicad_sch');
    const outDir = path.join(root, 'fab');
    const outFile = path.join(outDir, 'controller-bom.csv');
    fs.writeFileSync(file, '(kicad_sch)', 'utf8');
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.join(path.basename(root), 'fab')
    });
    const denied = Object.assign(
      new Error('EACCES: permission denied, open ' + outFile),
      {
        code: 'EACCES',
        path: outFile
      }
    );
    const bomExporter = {
      exportCsv: jest
        .fn()
        .mockRejectedValueOnce(denied)
        .mockResolvedValue(undefined)
    };
    const state = { begin: jest.fn(), complete: jest.fn(), fail: jest.fn() };
    const logger = { error: jest.fn() };
    const service = new KiCadExportService(
      {} as never,
      {} as never,
      {} as never,
      bomExporter as never,
      {} as never,
      logger as never,
      state as never
    );
    Object.defineProperty(service, 'loadBomEntries', {
      value: jest.fn().mockResolvedValue([{ references: ['R1'], quantity: 1 }])
    });
    try {
      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(state.complete).not.toHaveBeenCalled();
      expect(state.fail).toHaveBeenCalledWith(
        'bom',
        vscode.Uri.file(file),
        'The BOM output folder is not writable.'
      );
      expect(logger.error).toHaveBeenCalledWith('BOM export failed', 'EACCES');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('How to fix: choose a writable folder')
      );
      const notification = (vscode.window.showErrorMessage as jest.Mock).mock
        .calls[0][0] as string;
      expect(notification).not.toContain(root);
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();

      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(bomExporter.exportCsv).toHaveBeenCalledTimes(2);
      expect(state.complete).toHaveBeenCalledTimes(1);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Export completed successfully.',
        'Open Output Folder'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      __setConfiguration({});
    }
  });

  it('does not confuse a schematic source read denial with an output write denial', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-studio-bom-source-denied-')
    );
    const file = path.join(root, 'controller.kicad_sch');
    fs.writeFileSync(file, '(kicad_sch)', 'utf8');
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.join(path.basename(root), 'fab')
    });
    const sourceError = Object.assign(new Error('EACCES while reading input'), {
      code: 'EACCES',
      path: file
    });
    const bomExporter = { exportCsv: jest.fn() };
    const logger = { error: jest.fn() };
    const service = new KiCadExportService(
      {} as never,
      {} as never,
      {} as never,
      bomExporter as never,
      {} as never,
      logger as never
    );
    Object.defineProperty(service, 'loadBomEntries', {
      value: jest.fn().mockRejectedValue(sourceError)
    });
    try {
      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'BOM export failed. Verify that the complete project opens in KiCad and retry.'
      );
      expect(bomExporter.exportCsv).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      __setConfiguration({});
    }
  });
});

describe('KiCadExportService vanished CLI after successful detection', () => {
  it('explains the missing executable and retries without changing user files', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-studio-vanished-cli-')
    );
    const file = path.join(root, 'controller.kicad_sch');
    fs.writeFileSync(file, '(kicad_sch)', 'utf8');
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.join(path.basename(root), 'fab')
    });
    const entries = [{ references: ['R1'], quantity: 1 }];
    const bomExporter = { exportCsv: jest.fn().mockResolvedValue(undefined) };
    const state = { begin: jest.fn(), complete: jest.fn(), fail: jest.fn() };
    const logger = { error: jest.fn() };
    const service = new KiCadExportService(
      {} as never,
      {} as never,
      {} as never,
      bomExporter as never,
      {} as never,
      logger as never,
      state as never
    );
    const read = jest
      .fn()
      .mockRejectedValueOnce(new KiCadCliNotFoundError())
      .mockResolvedValueOnce(entries);
    Object.defineProperty(service, 'loadBomEntries', { value: read });
    try {
      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(bomExporter.exportCsv).not.toHaveBeenCalled();
      expect(state.fail).toHaveBeenCalledWith(
        'bom',
        vscode.Uri.file(file),
        'Configured KiCad CLI executable is unavailable.'
      );
      expect(state.complete).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'BOM export failed',
        'CLI_NOT_FOUND'
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining(
          'How to fix: restore the configured KiCad CLI path'
        )
      );
      const message = (vscode.window.showErrorMessage as jest.Mock).mock
        .calls[0]?.[0] as string;
      expect(message).not.toContain(root);
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();

      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(read).toHaveBeenCalledTimes(2);
      expect(bomExporter.exportCsv).toHaveBeenCalledWith(
        entries,
        path.join(root, 'fab', 'controller-bom.csv')
      );
      expect(state.complete).toHaveBeenCalledTimes(1);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Export completed successfully.',
        'Open Output Folder'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      __setConfiguration({});
    }
  });

  it('cleans failed partial CLI results and succeeds after the user retries', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-studio-partial-cli-')
    );
    const file = path.join(root, 'controller.kicad_sch');
    fs.writeFileSync(file, '(kicad_sch)', 'utf8');
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.join(path.basename(root), 'fab')
    });
    const exporter = { exportCsv: jest.fn().mockResolvedValue(undefined) };
    const state = { begin: jest.fn(), complete: jest.fn(), fail: jest.fn() };
    const logger = { error: jest.fn() };
    const entries = [{ references: ['R1'], quantity: 1 }];
    const service = new KiCadExportService(
      {} as never,
      {} as never,
      {} as never,
      exporter as never,
      {} as never,
      logger as never,
      state as never
    );
    const read = jest
      .fn()
      .mockRejectedValueOnce(
        new CliExitError({
          command:
            'sch export bom --output ' + path.join(root, 'sensitive.csv'),
          code: 19,
          stdout: 'partial',
          stderr: 'interrupted'
        })
      )
      .mockResolvedValueOnce(entries);
    Object.defineProperty(service, 'loadBomEntries', { value: read });
    try {
      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(exporter.exportCsv).not.toHaveBeenCalled();
      expect(state.complete).not.toHaveBeenCalled();
      expect(state.fail).toHaveBeenCalledWith(
        'bom',
        vscode.Uri.file(file),
        'KiCad CLI stopped before completing the BOM export.'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'BOM export failed',
        'CLI_EXIT_19'
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('No final BOM file was saved.')
      );
      const message = (vscode.window.showErrorMessage as jest.Mock).mock
        .calls[0]?.[0] as string;
      expect(message).not.toContain(root);
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();

      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(exporter.exportCsv).toHaveBeenCalledWith(
        entries,
        path.join(root, 'fab', 'controller-bom.csv')
      );
      expect(state.complete).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      __setConfiguration({});
    }
  });

  it('treats user cancellation as neutral and allows a successful retry', async () => {
    jest.clearAllMocks();
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.tmp-studio-user-cancel-')
    );
    const file = path.join(root, 'controller.kicad_sch');
    fs.writeFileSync(file, '(kicad_sch)', 'utf8');
    __setConfiguration({
      'kicadstudio.defaultOutputDir': path.join(path.basename(root), 'fab')
    });
    const exporter = { exportCsv: jest.fn().mockResolvedValue(undefined) };
    const state = {
      begin: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
      cancel: jest.fn()
    };
    const logger = { error: jest.fn(), info: jest.fn() };
    const entries = [{ references: ['R1'], quantity: 1 }];
    const service = new KiCadExportService(
      {} as never,
      {} as never,
      {} as never,
      exporter as never,
      {} as never,
      logger as never,
      state as never
    );
    Object.defineProperty(service, 'loadBomEntries', {
      value: jest
        .fn()
        .mockRejectedValueOnce(new KiCadCliCancelledError())
        .mockResolvedValueOnce(entries)
    });
    try {
      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(exporter.exportCsv).not.toHaveBeenCalled();
      expect(state.fail).not.toHaveBeenCalled();
      expect(state.complete).not.toHaveBeenCalled();
      expect(state.cancel).toHaveBeenCalledWith(
        'bom',
        vscode.Uri.file(file),
        'BOM export cancelled by user.'
      );
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('BOM export cancelled by user.');
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'BOM export cancelled. No new BOM file was saved. You can retry.'
      );

      await service.exportBOMCSV(vscode.Uri.file(file));
      expect(exporter.exportCsv).toHaveBeenCalledWith(
        entries,
        path.join(root, 'fab', 'controller-bom.csv')
      );
      expect(state.complete).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      __setConfiguration({});
    }
  });
});
