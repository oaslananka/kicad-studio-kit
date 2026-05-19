import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  launchDetached,
  resolveKiCadExecutable
} from '../../src/commands/kicadLauncher';
import { __setConfiguration } from './vscodeMock';

jest.mock('node:child_process', () => ({
  ...jest.requireActual<typeof import('node:child_process')>(
    'node:child_process'
  ),
  spawn: jest.fn(),
  spawnSync: jest.fn()
}));

jest.mock('node:fs', () => ({
  ...jest.requireActual<typeof import('node:fs')>('node:fs'),
  existsSync: jest.fn(),
  statSync: jest.fn()
}));

describe('kicadLauncher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({
      'kicadstudio.kicadPath': '/broken/kicad'
    });
  });

  const executableNames =
    process.platform === 'win32'
      ? {
          schematic: 'eeschema.exe',
          pcb: 'pcbnew.exe',
          project: 'kicad.exe'
        }
      : process.platform === 'darwin'
        ? {
            schematic: 'kicad',
            pcb: 'kicad',
            project: 'kicad'
          }
        : {
            schematic: 'eeschema',
            pcb: 'pcbnew',
            project: 'kicad'
          };

  it('uses an existing configured executable before probing PATH', () => {
    const configured = path.normalize('/custom/bin/kicad');
    __setConfiguration({
      'kicadstudio.kicadPath': configured
    });
    (fs.statSync as unknown as jest.Mock).mockReturnValue({
      isDirectory: () => false
    });
    (fs.existsSync as unknown as jest.Mock).mockImplementation(
      (candidate: string) => candidate === configured
    );

    expect(resolveKiCadExecutable('/project/board.kicad_pcb')).toEqual({
      command: configured,
      args: []
    });
    expect(childProcess.spawnSync).not.toHaveBeenCalled();
  });

  it.each([
    ['schematic', '/project/main.kicad_sch', executableNames.schematic],
    ['pcb', '/project/board.kicad_pcb', executableNames.pcb],
    ['project', '/project/main.kicad_pro', executableNames.project]
  ])(
    'expands a configured KiCad directory using the %s executable name',
    (_label, filePath, executableName) => {
      const configured = path.normalize('/opt/KiCad/bin');
      const expected = path.join(configured, executableName);
      __setConfiguration({
        'kicadstudio.kicadPath': configured
      });
      (fs.statSync as unknown as jest.Mock).mockReturnValue({
        isDirectory: () => true
      });
      (fs.existsSync as unknown as jest.Mock).mockImplementation(
        (candidate: string) => candidate === expected
      );

      expect(resolveKiCadExecutable(filePath)).toEqual({
        command: expected,
        args: []
      });
    }
  );

  it('continues to PATH probing when the configured path cannot be statted', () => {
    const fallback =
      process.platform === 'win32'
        ? 'C:\\KiCad\\bin\\kicad.exe'
        : '/usr/bin/kicad';
    (fs.statSync as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('broken symlink');
    });
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(false);
    (childProcess.spawnSync as unknown as jest.Mock).mockReturnValue({
      status: 0,
      stdout: `${fallback}\n`,
      stderr: ''
    });

    expect(resolveKiCadExecutable('/project/board.kicad_pcb')).toEqual({
      command: fallback,
      args: []
    });
    expect(fs.statSync).toHaveBeenCalledWith(path.normalize('/broken/kicad'));
    expect(childProcess.spawnSync).toHaveBeenCalledWith(
      process.platform === 'win32' ? 'where' : 'which',
      [executableNames.pcb],
      {
        encoding: 'utf8',
        timeout: 5_000,
        maxBuffer: 1024 * 1024
      }
    );
  });

  it('throws an actionable error when configured, common, and PATH probes all fail', () => {
    (fs.statSync as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('missing');
    });
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(false);
    (childProcess.spawnSync as unknown as jest.Mock).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'not found'
    });

    expect(() => resolveKiCadExecutable('/project/board.kicad_pcb')).toThrow(
      'No KiCad executable was found for board.kicad_pcb'
    );
  });

  it('launches KiCad detached and unrefs after spawn', async () => {
    const unref = jest.fn();
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    (childProcess.spawn as unknown as jest.Mock).mockReturnValue({
      once: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
        callbacks.set(event, callback);
      }),
      unref
    });

    const promise = launchDetached('/usr/bin/kicad', ['board.kicad_pcb']);
    callbacks.get('spawn')?.();

    await expect(promise).resolves.toBeUndefined();
    expect(childProcess.spawn).toHaveBeenCalledWith(
      '/usr/bin/kicad',
      ['board.kicad_pcb'],
      {
        detached: true,
        stdio: 'ignore'
      }
    );
    expect(unref).toHaveBeenCalled();
  });

  it('rejects detached launch when the child process fails to spawn', async () => {
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    (childProcess.spawn as unknown as jest.Mock).mockReturnValue({
      once: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
        callbacks.set(event, callback);
      }),
      unref: jest.fn()
    });

    const promise = launchDetached('/missing/kicad', []);
    callbacks.get('error')?.(new Error('spawn failed'));

    await expect(promise).rejects.toThrow('spawn failed');
  });
});
