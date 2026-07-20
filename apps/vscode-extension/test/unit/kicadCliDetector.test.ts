jest.mock('node:child_process', () => ({
  spawnSync: jest.fn()
}));

jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs');
  const realpathSync = Object.assign(jest.fn(actual.realpathSync), {
    native: jest.fn(actual.realpathSync.native)
  });
  return {
    ...actual,
    existsSync: jest.fn(actual.existsSync),
    realpathSync
  };
});

import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import * as vscode from 'vscode';
import { __setConfiguration } from './vscodeMock';
import {
  deriveCommandVersionStatus,
  getCliCandidates,
  KiCadCliDetector
} from '../../src/cli/kicadCliDetector';

describe('KiCadCliDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({
      'kicadstudio.kicadCliPath': 'C:\\KiCad\\bin\\kicad-cli.exe'
    });
  });

  it('detects kicad-cli from settings path', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.validateCandidate = jest.fn().mockResolvedValue({
      path: 'C:\\KiCad\\bin\\kicad-cli.exe',
      version: '9.0.1',
      versionLabel: 'KiCad 9.0.1',
      source: 'settings'
    });

    const result = await detector.detect();
    expect(result?.path).toContain('kicad-cli.exe');
    expect(detector.validateCandidate).toHaveBeenCalled();
  });

  it('falls back to system PATH', async () => {
    __setConfiguration({
      'kicadstudio.kicadCliPath': ''
    });
    const detector = new KiCadCliDetector() as any;
    detector.validateCandidate = jest
      .fn()
      .mockImplementation(async (_candidate: string, source: string) =>
        source === 'path'
          ? {
              path: '/usr/bin/kicad-cli',
              version: '8.0.0',
              versionLabel: 'KiCad 8.0.0',
              source: 'path'
            }
          : undefined
      );
    detector.findOnPath = jest.fn().mockReturnValue('/usr/bin/kicad-cli');

    const result = await detector.detect();
    expect(result?.source).toBe('path');
  });

  it('stores PATH-discovered cli results in cache', async () => {
    __setConfiguration({
      'kicadstudio.kicadCliPath': ''
    });
    const detector = new KiCadCliDetector() as any;
    detector.validateCandidate = jest
      .fn()
      .mockImplementation(async (_candidate: string, source: string) =>
        source === 'path'
          ? {
              path: '/usr/bin/kicad-cli',
              version: '8.0.0',
              versionLabel: 'KiCad 8.0.0',
              source: 'path'
            }
          : undefined
      );
    detector.findOnPath = jest.fn().mockReturnValue('/usr/bin/kicad-cli');

    const detected = await detector.detect();

    expect(detected?.path).toBe('/usr/bin/kicad-cli');
    expect((detector as { detected?: { path: string } }).detected?.path).toBe(
      '/usr/bin/kicad-cli'
    );
  });

  it('returns null when not found', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.validateCandidate = jest.fn().mockResolvedValue(undefined);
    detector.findOnPath = jest.fn().mockReturnValue(undefined);

    const result = await detector.detect();
    expect(result).toBeUndefined();
  });

  it('opens the canonical installation help when kicad-cli is missing (#488)', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.validateCandidate = jest.fn().mockResolvedValue(undefined);
    detector.findOnPath = jest.fn().mockReturnValue(undefined);
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Help');

    await expect(detector.detect(true)).resolves.toBeUndefined();

    expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
    const openedDocumentationUrl = (vscode.env.openExternal as jest.Mock).mock
      .calls[0]?.[0] as vscode.Uri | undefined;
    expect(openedDocumentationUrl?.toString()).toBe(
      'https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/install.md'
    );
  });

  it('builds candidate paths by platform', () => {
    const candidates = getCliCandidates('win32', 'C:\\Custom\\kicad-cli.exe');
    expect(candidates[0]).toBe('C:\\Custom\\kicad-cli.exe');
  });

  it('includes Linux defaults when no configured path is provided', () => {
    expect(getCliCandidates('linux')).toEqual(
      expect.arrayContaining([
        '/usr/bin/kicad-cli',
        '/usr/local/bin/kicad-cli',
        '/snap/bin/kicad-cli'
      ])
    );
  });

  it('includes PROGRAMFILES(X86) and macOS app bundle candidates', () => {
    process.env['PROGRAMFILES(X86)'] = 'C:\\Program Files (x86)';
    expect(getCliCandidates('win32')).toContain(
      'C:\\Program Files (x86)\\KiCad\\9.0\\bin\\kicad-cli.exe'
    );
    expect(getCliCandidates('darwin')).toContain(
      '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli'
    );
  });

  it('clearCache forces a fresh detect call', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.validateCandidate = jest
      .fn()
      .mockResolvedValueOnce({
        path: 'C:\\KiCad\\bin\\kicad-cli.exe',
        version: '9.0.1',
        versionLabel: 'KiCad 9.0.1',
        source: 'settings'
      })
      .mockResolvedValueOnce({
        path: 'C:\\KiCad\\bin\\kicad-cli.exe',
        version: '9.0.2',
        versionLabel: 'KiCad 9.0.2',
        source: 'settings'
      });

    expect((await detector.detect())?.version).toBe('9.0.1');
    detector.clearCache();
    expect((await detector.detect())?.version).toBe('9.0.2');
  });

  it('returns the cached detect result without revalidating', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.validateCandidate = jest.fn().mockResolvedValue({
      path: 'C:\\KiCad\\bin\\kicad-cli.exe',
      version: '9.0.1',
      versionLabel: 'KiCad 9.0.1',
      source: 'settings'
    });

    const first = await detector.detect();
    const second = await detector.detect();

    expect(first).toEqual(second);
    expect(detector.validateCandidate).toHaveBeenCalledTimes(1);
  });

  it('caches capability checks per command', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.detect = jest.fn().mockResolvedValue({
      path: 'C:\\KiCad\\bin\\kicad-cli.exe',
      version: '9.0.1',
      versionLabel: 'KiCad 9.0.1',
      source: 'settings'
    });
    const spawnSyncMock = childProcess.spawnSync as unknown as jest.Mock;
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: ''
    } as never);

    await expect(detector.hasCapability('bom')).resolves.toBe(true);
    await expect(detector.hasCapability('bom')).resolves.toBe(true);

    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'C:\\KiCad\\bin\\kicad-cli.exe',
      expect.any(Array),
      expect.objectContaining({
        timeout: 5000,
        maxBuffer: 1024 * 1024
      })
    );
  });

  it('reads and caches command help for option/format probes', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.detect = jest.fn().mockResolvedValue({
      path: 'C:\\KiCad\\bin\\kicad-cli.exe',
      version: '10.0.1',
      versionLabel: 'KiCad 10.0.1',
      source: 'settings'
    });
    const spawnSyncMock = childProcess.spawnSync as unknown as jest.Mock;
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: 'Usage: kicad-cli pcb import --format pads|altium|geda',
      stderr: ''
    } as never);

    await expect(
      detector.commandHelpIncludes(['pcb', 'import'], /\bgeda\b/i)
    ).resolves.toBe(true);
    await expect(detector.getCommandHelp(['pcb', 'import'])).resolves.toContain(
      '--format'
    );

    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });

  it('validates real candidates and rejects broken binaries gracefully', async () => {
    const detector = new KiCadCliDetector() as any;
    const existsSyncMock = fs.existsSync as unknown as jest.Mock;
    const realpathNativeMock = fs.realpathSync.native as unknown as jest.Mock;
    const spawnSyncMock = childProcess.spawnSync as unknown as jest.Mock;

    existsSyncMock.mockReturnValue(true);
    realpathNativeMock.mockImplementation((value: fs.PathLike) =>
      String(value)
    );
    spawnSyncMock
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'bad' } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'other-tool 1.0',
        stderr: ''
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'kicad-cli 9.0.3',
        stderr: ''
      } as never);

    await expect(
      detector.validateCandidate('C:\\broken.exe', 'settings')
    ).resolves.toBeUndefined();
    await expect(
      detector.validateCandidate('C:\\other.exe', 'settings')
    ).resolves.toBeUndefined();
    await expect(
      detector.validateCandidate('C:\\KiCad\\bin\\kicad-cli.exe', 'settings')
    ).resolves.toEqual(expect.objectContaining({ version: '9.0.3' }));
  });

  it('parses PATH lookup results and opens settings when requested', async () => {
    const detector = new KiCadCliDetector() as any;
    const spawnSyncMock = childProcess.spawnSync as unknown as jest.Mock;
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: 'C:\\KiCad\\bin\\kicad-cli.exe\r\n',
      stderr: ''
    } as never);

    expect(detector.findOnPath()).toBe('C:\\KiCad\\bin\\kicad-cli.exe');

    detector.validateCandidate = jest.fn().mockResolvedValue(undefined);
    detector.findOnPath = jest.fn().mockReturnValue(undefined);
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(
      'Set Manual Path'
    );

    await detector.detect(true);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      'kicadstudio.kicadCliPath'
    );
  });

  it('returns false when capability checks run without a detected cli', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.detect = jest.fn().mockResolvedValue(undefined);

    await expect(detector.hasCapability('bom')).resolves.toBe(false);
  });

  it('builds a status-menu capability snapshot from CLI help probes', async () => {
    const detector = new KiCadCliDetector() as any;
    detector.detect = jest.fn().mockResolvedValue({
      path: '/usr/bin/kicad-cli',
      version: '10.0.3',
      versionLabel: 'KiCad 10.0.3',
      source: 'path'
    });
    detector.hasCapability = jest
      .fn()
      .mockImplementation(async (command: string) => command !== 'odb');
    detector.commandHelpIncludes = jest.fn().mockResolvedValue(true);

    const snapshot = await detector.getCapabilitySnapshot();

    // Existing command booleans
    expect(snapshot).toEqual(
      expect.objectContaining({
        drc: true,
        erc: true,
        gerbers: true,
        pdf3d: true,
        odb: false,
        variantOption: true,
        allegroImport: true
      })
    );
    // New command booleans
    expect(snapshot).toHaveProperty('stpz', true);
    expect(snapshot).toHaveProperty('glb', true);
    expect(snapshot).toHaveProperty('dxf', true);
    expect(snapshot).toHaveProperty('ipc2581', true);
    expect(snapshot).toHaveProperty('fpSvg', true);
    expect(snapshot).toHaveProperty('pcbImport', true);
    expect(detector.hasCapability).toHaveBeenCalledWith('jobset');

    // Per-command metadata enrichment
    expect(snapshot.commandMinVersion).toBeDefined();
    expect(snapshot.commandMinVersion?.drc).toBe(8);
    expect(snapshot.commandMinVersion?.pdf3d).toBe(10);
    expect(snapshot.commandMinVersion?.stpz).toBe(9);
    expect(snapshot.commandVersionStatus).toBeDefined();
    expect(snapshot.commandVersionStatus?.drc).toBe('primary');
    expect(snapshot.commandVersionStatus?.stpz).toBe('primary');
    expect(snapshot.commandVersionStatus?.pdf3d).toBe('primary');

    expect(detector.commandHelpIncludes).toHaveBeenCalledWith(
      ['sch', 'export', 'pdf'],
      /--variant\b/
    );
    expect(detector.commandHelpIncludes).toHaveBeenCalledWith(
      ['pcb', 'import'],
      /\ballegro\b/i
    );
  });

  it('deriveCommandVersionStatus returns correct status strings', () => {
    // detected major 10 (primary line)
    expect(deriveCommandVersionStatus(10, 8)).toBe('primary');
    expect(deriveCommandVersionStatus(10, 9)).toBe('primary');
    expect(deriveCommandVersionStatus(10, 10)).toBe('primary');
    // detected major >= 11 (preview)
    expect(deriveCommandVersionStatus(11, 8)).toBe('preview');
    expect(deriveCommandVersionStatus(12, 9)).toBe('preview');
    // detected major < command minimum -> unsupported
    expect(deriveCommandVersionStatus(8, 10)).toBe('unsupported');
    expect(deriveCommandVersionStatus(9, 10)).toBe('unsupported');
    // detected major 8 or 9 but >= min -> deprecated
    expect(deriveCommandVersionStatus(8, 8)).toBe('deprecated');
    expect(deriveCommandVersionStatus(9, 8)).toBe('deprecated');
    expect(deriveCommandVersionStatus(9, 9)).toBe('deprecated');
    // detected < minimum -> unsupported
    expect(deriveCommandVersionStatus(7, 8)).toBe('unsupported');
    // below KiCad 8 baseline -> unknown
    expect(deriveCommandVersionStatus(7, 7)).toBe('unknown');
  });

  it('handles empty candidates, missing files, and failed PATH lookups', async () => {
    const detector = new KiCadCliDetector() as any;
    const existsSyncMock = fs.existsSync as unknown as jest.Mock;
    const spawnSyncMock = childProcess.spawnSync as unknown as jest.Mock;

    existsSyncMock.mockReturnValue(false);
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: ''
    } as never);

    await expect(
      detector.validateCandidate('', 'settings')
    ).resolves.toBeUndefined();
    await expect(
      detector.validateCandidate('C:\\missing\\kicad-cli.exe', 'settings')
    ).resolves.toBeUndefined();
    expect(detector.findOnPath()).toBeUndefined();
  });

  it('falls back to normalized candidates when realpath fails and warns once for workspace overrides', () => {
    const detector = new KiCadCliDetector() as any;
    const realpathNativeMock = fs.realpathSync.native as unknown as jest.Mock;
    realpathNativeMock.mockImplementation(() => {
      throw new Error('broken symlink');
    });

    const originalGetConfiguration = vscode.workspace.getConfiguration;
    (vscode.workspace as any).getConfiguration = () => ({
      get: <T>(_key: string, fallback?: T): T => fallback as T,
      inspect: <T>() =>
        ({
          key: 'kicadstudio.kicadCliPath',
          workspaceValue: 'C:\\KiCad\\bin\\kicad-cli.exe'
        }) as {
          key: string;
          globalValue?: T;
          workspaceValue?: T;
          workspaceFolderValue?: T;
        },
      has: jest.fn(),
      update: jest.fn()
    });

    try {
      expect(detector.normalizeCandidate(' .\\kicad-cli.exe ')).toContain(
        'kicad-cli.exe'
      );
      detector.warnIfWorkspaceConfiguredPath('C:\\KiCad\\bin\\kicad-cli.exe');
      detector.warnIfWorkspaceConfiguredPath('C:\\KiCad\\bin\\kicad-cli.exe');
      expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    } finally {
      (vscode.workspace as any).getConfiguration = originalGetConfiguration;
    }
  });
});
