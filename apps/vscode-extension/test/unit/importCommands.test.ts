import { KiCadImportService } from '../../src/cli/importCommands';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { commands, Uri, window } from './vscodeMock';

describe('KiCadImportService', () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function createService(
    overrides: {
      runner?: Record<string, unknown>;
      detector?: Record<string, unknown>;
      logger?: Record<string, unknown>;
    } = {}
  ) {
    const runner = {
      // Stub an actual output file: a successful process alone is not a
      // successful import if the expected KiCad artifact was never written.
      runWithProgress: jest
        .fn()
        .mockImplementation(async ({ command }: { command: string[] }) => {
          const outputIndex = command.indexOf('--output');
          if (outputIndex >= 0) {
            const target = command[outputIndex + 1];
            if (target) {
              fs.writeFileSync(
                target,
                command[1] === 'import'
                  ? '(kicad_pcb (layers (0 "F.Cu" signal)))'
                  : '<svg xmlns="http://www.w3.org/2000/svg"><rect width="200" height="200"/></svg>'
              );
            }
          }
          return 'ok';
        }),
      ...overrides.runner
    };
    const detector = {
      hasCapability: jest.fn().mockResolvedValue(true),
      getCommandHelp: jest
        .fn()
        .mockResolvedValue(
          'Usage: kicad-cli pcb import --format pads|altium|geda'
        ),
      ...overrides.detector
    };
    const logger = {
      show: jest.fn(),
      error: jest.fn(),
      ...overrides.logger
    };

    return {
      runner,
      detector,
      logger,
      service: new KiCadImportService(
        runner as never,
        detector as never,
        logger as never
      )
    };
  }

  it('guards gEDA imports unless kicad-cli help advertises the format', async () => {
    const detector = {
      hasCapability: jest.fn().mockResolvedValue(true),
      getCommandHelp: jest
        .fn()
        .mockResolvedValue('Usage: kicad-cli pcb import --format pads|altium')
    };
    const service = new KiCadImportService(
      {} as never,
      detector as never,
      { error: jest.fn() } as never
    ) as unknown as {
      isImportFormatSupported(format: string): Promise<boolean>;
    };

    await expect(service.isImportFormatSupported('geda')).resolves.toBe(false);

    detector.getCommandHelp.mockResolvedValue(
      'Usage: kicad-cli pcb import --format pads|altium|geda'
    );
    await expect(service.isImportFormatSupported('geda')).resolves.toBe(true);
  });

  it('shows a warning and does not open a file picker for unsupported import formats', async () => {
    const { service, runner } = createService({
      detector: {
        hasCapability: jest.fn().mockResolvedValue(false),
        getCommandHelp: jest.fn()
      }
    });

    await service.importBoard('pads');

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('does not advertise PADS PCB import support')
    );
    expect(window.showOpenDialog).not.toHaveBeenCalled();
    expect(runner.runWithProgress).not.toHaveBeenCalled();
  });

  it('keeps Allegro hidden behind the kicad-cli import format probe', async () => {
    const { service, runner } = createService({
      detector: {
        hasCapability: jest.fn().mockResolvedValue(true),
        getCommandHelp: jest
          .fn()
          .mockResolvedValue(
            'Usage: kicad-cli pcb import --format pads|altium|solidworks'
          )
      }
    });

    await service.importBoard('allegro');

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('does not advertise Allegro PCB import support')
    );
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining(
        'KiCad 10 PCB Editor supports Allegro .brd import'
      )
    );
    expect(window.showOpenDialog).not.toHaveBeenCalled();
    expect(runner.runWithProgress).not.toHaveBeenCalled();
  });

  it('reports per-format import support from kicad-cli help', async () => {
    const { service } = createService({
      detector: {
        hasCapability: jest.fn().mockResolvedValue(true),
        getCommandHelp: jest
          .fn()
          .mockResolvedValue(
            'Usage: kicad-cli pcb import --format pads|altium|allegro'
          )
      }
    });

    await expect(
      service.getImportFormatSupportSnapshot(['pads', 'allegro', 'geda'])
    ).resolves.toEqual({
      pads: true,
      allegro: true,
      geda: false
    });
  });

  it('fails closed when an import support snapshot probe rejects', async () => {
    const error = new Error('probe failed');
    const { service, logger } = createService({
      detector: {
        hasCapability: jest.fn().mockRejectedValue(error),
        getCommandHelp: jest.fn()
      }
    });

    await expect(
      service.getImportFormatSupportSnapshot(['allegro'])
    ).resolves.toEqual({
      allegro: false
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Import support probe for allegro failed',
      error
    );
  });

  it('stops without running kicad-cli when the import picker is cancelled', async () => {
    const { service, runner } = createService();
    (window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);

    await service.importBoard('pads');

    expect(runner.runWithProgress).not.toHaveBeenCalled();
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('imports a selected board, creates a matching project file, and opens it', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-import-'));
    const inputFile = path.join(tempDir, 'legacy-board.asc');
    fs.writeFileSync(inputFile, 'legacy board', 'utf8');
    const outputFile = path.join(tempDir, 'legacy-board.kicad_pcb');
    const projectFile = path.join(tempDir, 'legacy-board.kicad_pro');
    const { service, runner } = createService();
    (window.showOpenDialog as jest.Mock).mockResolvedValue([
      Uri.file(inputFile)
    ]);

    await service.importBoard('pads');

    expect(runner.runWithProgress).toHaveBeenCalledWith({
      command: [
        'pcb',
        'import',
        '--format',
        'pads',
        '--output',
        outputFile,
        inputFile
      ],
      cwd: tempDir,
      progressTitle: 'Importing PADS board',
      onProgress: expect.any(Function)
    });
    expect(JSON.parse(fs.readFileSync(projectFile, 'utf8'))).toEqual({
      meta: {
        filename: 'legacy-board',
        version: 1
      },
      board: {
        file: 'legacy-board.kicad_pcb'
      }
    });
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'vscode.open',
      expect.objectContaining({ fsPath: projectFile })
    );
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Imported legacy-board.asc as legacy-board.kicad_pcb.'
    );
  });

  it('warns about missing source-layer mappings after a successful Fabmaster import (#1029)', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-import-'));
    const source = path.join(tempDir, 'real-fabmaster.txt');
    const project = path.join(tempDir, 'real-fabmaster.kicad_pro');
    fs.writeFileSync(source, 'Fabmaster fixture', 'utf8');
    const { service, runner, logger } = createService({
      detector: {
        hasCapability: jest.fn().mockResolvedValue(true),
        getCommandHelp: jest
          .fn()
          .mockResolvedValue('Usage: kicad-cli pcb import --format fabmaster')
      },
      runner: {
        runWithProgress: jest
          .fn()
          .mockImplementation(
            async ({
              command,
              onProgress
            }: {
              command: string[];
              onProgress?: (output: string) => void;
            }) => {
              fs.writeFileSync(
                command[command.indexOf('--output') + 1]!,
                '(kicad_pcb (version 20240108))'
              );
              onProgress?.('Warning: No user layer to put layer SIG1_IN3\n');
              onProgress?.('Warning: No user layer to put layer GND_IN2\n');
              return 'Successfully saved imported board';
            }
          )
      }
    });
    (window.showOpenDialog as jest.Mock).mockResolvedValue([Uri.file(source)]);
    (window.showWarningMessage as jest.Mock).mockResolvedValue(
      'View Import Log'
    );

    await service.importBoard('fabmaster');
    await Promise.resolve();

    expect(runner.runWithProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.arrayContaining(['--format', 'fabmaster']),
        onProgress: expect.any(Function)
      })
    );
    expect(fs.existsSync(project)).toBe(true);
    expect(fs.readFileSync(source, 'utf8')).toBe('Fabmaster fixture');
    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringMatching(/2 unmapped source layers.*verify the board/i),
      'View Import Log'
    );
    expect(logger.show).toHaveBeenCalled();
  });

  it('shows other CLI warnings without mislabeling them as unmapped layers (#1029)', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-import-'));
    const source = path.join(tempDir, 'pcb.asc');
    fs.writeFileSync(source, 'PADS test', 'utf8');
    const { service, runner } = createService({
      runner: {
        runWithProgress: jest
          .fn()
          .mockImplementation(
            async ({
              command,
              onProgress
            }: {
              command: string[];
              onProgress?: (output: string) => void;
            }) => {
              fs.writeFileSync(
                command[command.indexOf('--output') + 1]!,
                '(kicad_pcb (version 20240108))'
              );
              onProgress?.('Warning: unknown component attribute\n');
              return 'ok';
            }
          )
      }
    });
    (window.showOpenDialog as jest.Mock).mockResolvedValue([Uri.file(source)]);

    await service.importBoard('pads');

    expect(runner.runWithProgress).toHaveBeenCalled();
    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringMatching(/1 warning.*verify the board/i),
      'View Import Log'
    );
  });

  it('keeps an existing generated project file intact during import', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-import-'));
    const inputFile = path.join(tempDir, 'legacy-board.asc');
    const projectFile = path.join(tempDir, 'legacy-board.kicad_pro');
    fs.writeFileSync(inputFile, 'legacy board', 'utf8');
    fs.writeFileSync(projectFile, '{"existing":true}\n', 'utf8');
    const { service } = createService();
    (window.showOpenDialog as jest.Mock).mockResolvedValue([
      Uri.file(inputFile)
    ]);

    await service.importBoard('pads');

    expect(fs.readFileSync(projectFile, 'utf8')).toBe('{"existing":true}\n');
  });

  it('imports Allegro boards when kicad-cli advertises the format', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-import-'));
    const inputFile = path.join(tempDir, 'legacy-allegro.brd');
    fs.writeFileSync(inputFile, 'legacy board', 'utf8');
    const outputFile = path.join(tempDir, 'legacy-allegro.kicad_pcb');
    const { service, runner } = createService({
      detector: {
        hasCapability: jest.fn().mockResolvedValue(true),
        getCommandHelp: jest
          .fn()
          .mockResolvedValue(
            'Usage: kicad-cli pcb import --format pads|altium|allegro'
          )
      }
    });
    (window.showOpenDialog as jest.Mock).mockResolvedValue([
      Uri.file(inputFile)
    ]);

    await service.importBoard('allegro');

    expect(runner.runWithProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        command: [
          'pcb',
          'import',
          '--format',
          'allegro',
          '--output',
          outputFile,
          inputFile
        ],
        cwd: tempDir,
        progressTitle: 'Importing Allegro board'
      })
    );
  });

  it('logs the failed import and shows the underlying error message once', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-import-'));
    const inputFile = path.join(tempDir, 'legacy-board.asc');
    const error = new Error('kicad-cli import failed');
    fs.writeFileSync(inputFile, 'legacy board', 'utf8');
    const { service, logger } = createService({
      runner: {
        runWithProgress: jest.fn().mockRejectedValue(error)
      }
    });
    (window.showOpenDialog as jest.Mock).mockResolvedValue([
      Uri.file(inputFile)
    ]);

    await service.importBoard('pads');

    expect(logger.error).toHaveBeenCalledWith('Import pads failed', error);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'kicad-cli import failed'
    );
    expect(window.showErrorMessage).toHaveBeenCalledTimes(1);
    expect(commands.executeCommand).not.toHaveBeenCalled();
    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });

  const undefinedGraphics =
    '(kicad_pcb (footprint "A" (fp_line (start 1 2) (end 3 4) (layer "UNDEFINED"))))';

  function prepareEagleImport(contents: string) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-eagle-repair-'));
    const input = path.join(tempDir, 'prototype.brd');
    const output = path.join(tempDir, 'prototype.kicad_pcb');
    fs.writeFileSync(input, '<eagle/>');
    const runWithProgress = jest
      .fn()
      .mockImplementation(async ({ command }: { command: string[] }) => {
        if (command[1] === 'import') {
          fs.writeFileSync(output, contents);
        } else if (command[1] === 'export') {
          const file = command[command.indexOf('--output') + 1];
          if (!file) throw new Error('Missing expected SVG output path');
          fs.writeFileSync(file, '<svg>' + ' '.repeat(180) + '</svg>');
        }
        return 'ok';
      });
    const { service } = createService({
      runner: { runWithProgress },
      detector: {
        hasCapability: jest.fn().mockResolvedValue(true),
        getCommandHelp: jest
          .fn()
          .mockResolvedValue('Usage: pcb import --format pads|eagle')
      }
    });
    (window.showOpenDialog as jest.Mock).mockResolvedValue([Uri.file(input)]);
    return { service, input, output, runWithProgress };
  }

  it('offers optional graphic-only repair, preserves the original import and verifies using KiCad CLI', async () => {
    const { service, output, runWithProgress } =
      prepareEagleImport(undefinedGraphics);
    (window.showWarningMessage as jest.Mock).mockResolvedValue(
      'Repair drawing layers'
    );

    await service.importBoard('eagle');

    expect(runWithProgress).toHaveBeenCalledTimes(2);
    expect(runWithProgress).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        command: expect.arrayContaining(['pcb', 'export', 'svg']),
        progressTitle: 'Validating imported PCB drawings'
      })
    );
    expect(fs.readFileSync(output, 'utf8')).toContain('(layer "Dwgs.User")');
    expect(fs.readFileSync(output + '.unmapped-original', 'utf8')).toBe(
      undefinedGraphics
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'vscode.open',
      expect.objectContaining({
        fsPath: path.join(tempDir!, 'prototype.kicad_pro')
      })
    );
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Review the layers and run DRC')
    );
  });

  it('does not modify unmapped graphic imports when the user declines repair', async () => {
    const { service, output, runWithProgress } =
      prepareEagleImport(undefinedGraphics);
    (window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

    await service.importBoard('eagle');

    expect(fs.readFileSync(output, 'utf8')).toBe(undefinedGraphics);
    expect(fs.existsSync(output + '.unmapped-original')).toBe(false);
    expect(runWithProgress).toHaveBeenCalledTimes(1);
    expect(commands.executeCommand).not.toHaveBeenCalled();
    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('refuses automatic repair for undefined copper or unknown layer contexts', async () => {
    const dangerous = '(kicad_pcb (segment (start 1 2) (layer "UNDEFINED")))';
    const { service, output, runWithProgress } = prepareEagleImport(dangerous);
    await service.importBoard('eagle');
    expect(fs.readFileSync(output, 'utf8')).toBe(dangerous);
    expect(runWithProgress).toHaveBeenCalledTimes(1);
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('cannot safely be remapped')
    );
    expect(commands.executeCommand).not.toHaveBeenCalled();
    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('leaves the imported bytes unchanged when repaired-board CLI validation fails', async () => {
    const { service, output, runWithProgress } =
      prepareEagleImport(undefinedGraphics);
    runWithProgress.mockImplementation(
      async ({ command }: { command: string[] }) => {
        if (command[1] === 'import') {
          fs.writeFileSync(output, undefinedGraphics);
          return 'ok';
        }
        throw new Error('KiCad validation failed');
      }
    );
    (window.showWarningMessage as jest.Mock).mockResolvedValue(
      'Repair drawing layers'
    );

    await service.importBoard('eagle');

    expect(fs.readFileSync(output, 'utf8')).toBe(undefinedGraphics);
    expect(fs.existsSync(output + '.unmapped-original')).toBe(false);
    expect(commands.executeCommand).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'KiCad validation failed'
    );
  });

  it('does not misreport success when the CLI process created no output', async () => {
    const { service } = prepareEagleImport('(kicad_pcb)');
    (
      service as unknown as { runner: { runWithProgress: jest.Mock } }
    ).runner.runWithProgress.mockResolvedValue('ok');

    await service.importBoard('eagle');

    expect(commands.executeCommand).not.toHaveBeenCalled();
    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'KiCad reported an import, but no nonempty PCB file was created.'
    );
  });

  it('protects an existing KiCad PCB against a new import overwrite', async () => {
    const { service, output, runWithProgress } =
      prepareEagleImport('(kicad_pcb)');
    const previous = '(kicad_pcb (board_original yes))';
    fs.writeFileSync(output, previous, 'utf8');

    await service.importBoard('eagle');

    expect(fs.readFileSync(output, 'utf8')).toBe(previous);
    expect(runWithProgress).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('already exists')
    );
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });
});
