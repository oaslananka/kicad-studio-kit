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
      runWithProgress: jest.fn().mockResolvedValue('ok'),
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
      expect.stringContaining('does not advertise pads PCB import support')
    );
    expect(window.showOpenDialog).not.toHaveBeenCalled();
    expect(runner.runWithProgress).not.toHaveBeenCalled();
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
      progressTitle: 'Importing pads board'
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
});
