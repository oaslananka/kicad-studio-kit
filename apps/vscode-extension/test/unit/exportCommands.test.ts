import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  buildCliExportCommands,
  discoverGerberLayers,
  KiCadExportService
} from '../../src/cli/exportCommands';
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

  it('builds gerber precision only for KiCad 9 and newer', () => {
    const pcb = '/project/board.kicad_pcb';
    expect(
      buildCliExportCommands('export-gerbers', pcb, '/project/fab', {
        versionMajor: 9
      })[0]
    ).toEqual(expect.arrayContaining(['--precision', '6']));
    expect(
      buildCliExportCommands('export-gerbers', pcb, '/project/fab', {
        versionMajor: 6
      })[0]
    ).not.toContain('--precision');
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

  it('reads IPC-2581 version and units from settings', () => {
    const command = buildCliExportCommands(
      'export-ipc2581',
      '/project/board.kicad_pcb',
      '/project/fab'
    )[0];
    expect(command).toEqual(
      expect.arrayContaining(['--version', 'C', '--units', 'mm'])
    );
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
        expect.any(Error)
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
