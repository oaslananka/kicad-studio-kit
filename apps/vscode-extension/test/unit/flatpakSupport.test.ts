import { KiCadCliDetector } from '../../src/cli/kicadCliDetector';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('vscode');

describe('Flatpak Support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should validate a flatpak command from common-path', async () => {
    const detector = new KiCadCliDetector() as any;
    const flatpakCandidate = 'flatpak run --command=kicad-cli org.kicad.KiCad';

    // Mock fs.existsSync to return false for the whole command string
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    // Mock spawnSync to return a successful version for flatpak
    (childProcess.spawnSync as unknown as jest.Mock).mockImplementation(
      (cmd, args) => {
        if (
          cmd === 'flatpak' &&
          args[0] === 'run' &&
          args.includes('--version')
        ) {
          return { status: 0, stdout: 'kicad-cli 10.0.1', stderr: '' };
        }
        return { status: 1 };
      }
    );

    const result = await detector.validateCandidate(
      flatpakCandidate,
      'common-path'
    );
    expect(result).toBeDefined();
    expect(result.path).toBe('flatpak');
    expect(result.args).toEqual([
      'run',
      '--command=kicad-cli',
      'org.kicad.KiCad'
    ]);
    expect(result.version).toBe('10.0.1');
  });

  it('should handle quoted paths with spaces', async () => {
    const detector = new KiCadCliDetector() as any;
    const quotedCandidate = '"/opt/My KiCad/kicad-cli" --some-arg';

    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (childProcess.spawnSync as unknown as jest.Mock).mockReturnValue({
      status: 0,
      stdout: 'kicad-cli 10.0.1',
      stderr: ''
    });

    const result = await detector.validateCandidate(
      quotedCandidate,
      'settings'
    );
    expect(result).toBeDefined();
    expect(result.path).toBe('/opt/My KiCad/kicad-cli');
    expect(result.args).toEqual(['--some-arg']);
  });

  it('should handle shell metacharacters as literals', async () => {
    const detector = new KiCadCliDetector() as any;
    const metaCandidate = 'kicad-cli --define-var "FOO=BAR; BAZ"';

    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (childProcess.spawnSync as unknown as jest.Mock).mockReturnValue({
      status: 0,
      stdout: 'kicad-cli 10.0.1',
      stderr: ''
    });

    const result = await detector.validateCandidate(metaCandidate, 'settings');
    expect(result).toBeDefined();
    expect(result.args).toEqual(['--define-var', 'FOO=BAR; BAZ']);
  });

  it('should handle malformed quotes gracefully', async () => {
    const detector = new KiCadCliDetector() as any;
    const malformed = 'kicad-cli --arg "unclosed quote';

    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (childProcess.spawnSync as unknown as jest.Mock).mockReturnValue({
      status: 0,
      stdout: 'kicad-cli 10.0.1',
      stderr: ''
    });

    const result = await detector.validateCandidate(malformed, 'settings');
    expect(result).toBeDefined();
    expect(result.args).toEqual(['--arg', 'unclosed quote']);
  });

  it('should handle capability checks with flatpak args', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.detect = jest.fn().mockResolvedValue({
      path: 'flatpak',
      args: ['run', '--command=kicad-cli', 'org.kicad.KiCad'],
      version: '10.0.1',
      versionLabel: 'KiCad 10.0.1',
      source: 'common-path'
    });

    (childProcess.spawnSync as unknown as jest.Mock).mockReturnValue({
      status: 0,
      stdout: 'Usage: ...',
      stderr: ''
    });

    const hasBom = await detector.hasCapability('bom');
    expect(hasBom).toBe(true);

    expect(childProcess.spawnSync).toHaveBeenCalledWith(
      'flatpak',
      [
        'run',
        '--command=kicad-cli',
        'org.kicad.KiCad',
        'sch',
        'export',
        'bom',
        '--help'
      ],
      expect.anything()
    );
  });

  it('should handle help command with flatpak args', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.detect = jest.fn().mockResolvedValue({
      path: 'flatpak',
      args: ['run', '--command=kicad-cli', 'org.kicad.KiCad'],
      version: '10.0.1',
      versionLabel: 'KiCad 10.0.1',
      source: 'common-path'
    });

    (childProcess.spawnSync as unknown as jest.Mock).mockReturnValue({
      status: 0,
      stdout: 'Usage: kicad-cli pcb export 3dpdf [options]',
      stderr: ''
    });

    const help = await detector.getCommandHelp(['pcb', 'export', '3dpdf']);
    expect(help).toContain('3dpdf');

    expect(childProcess.spawnSync).toHaveBeenCalledWith(
      'flatpak',
      [
        'run',
        '--command=kicad-cli',
        'org.kicad.KiCad',
        'pcb',
        'export',
        '3dpdf',
        '--help'
      ],
      expect.anything()
    );
  });
});
