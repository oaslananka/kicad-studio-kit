jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
import { CliExitError, KiCadCliNotFoundError } from '../../src/errors';
import { KiCadCliRunner } from '../../src/cli/kicadCliRunner';
import { __setConfiguration } from './vscodeMock';

function createChildProcessMock() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe('KiCadCliRunner', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-runner-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('prepends define-vars from settings and the sibling project file', async () => {
    const boardFile = path.join(tempDir, 'sample.kicad_pcb');
    const projectFile = path.join(tempDir, 'sample.kicad_pro');
    fs.writeFileSync(boardFile, '', 'utf8');
    fs.writeFileSync(
      projectFile,
      JSON.stringify({ text_variables: { PROJECT_VAR: '123' } }, null, 2),
      'utf8'
    );
    __setConfiguration({
      'kicadstudio.cli.defineVars': {
        USER_VAR: 'abc'
      }
    });

    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const child = createChildProcessMock();
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('ok'));
        child.emit('close', 0);
      });
      expect(args).toEqual(
        expect.arrayContaining([
          '--define-var',
          'PROJECT_VAR=123',
          '--define-var',
          'USER_VAR=abc',
          'pcb',
          'export',
          'gerbers'
        ])
      );
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);
    const result = await runner.run({
      command: ['pcb', 'export', 'gerbers', '--output', tempDir, boardFile],
      cwd: tempDir,
      progressTitle: 'Exporting'
    });

    expect(result.exitCode).toBe(0);
    expect(detector.detect).toHaveBeenCalled();
  });

  it('raises CliExitError when kicad-cli exits non-zero', async () => {
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementation(() => {
      const child = createChildProcessMock();
      queueMicrotask(() => {
        child.stderr.emit('data', Buffer.from('fatal error'));
        child.emit('close', 2);
      });
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);

    await expect(
      runner.run({
        command: ['pcb', 'drc', 'board.kicad_pcb'],
        cwd: tempDir,
        progressTitle: 'DRC'
      })
    ).rejects.toBeInstanceOf(CliExitError);
  });

  it('reuses an identical in-flight command instead of spawning twice', async () => {
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    let child: ReturnType<typeof createChildProcessMock> | undefined;
    spawnMock.mockImplementation(() => {
      child = createChildProcessMock();
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);
    const first = runner.run({
      command: ['sch', 'erc', 'sample.kicad_sch'],
      cwd: tempDir,
      progressTitle: 'ERC'
    });
    const second = runner.run({
      command: ['sch', 'erc', 'sample.kicad_sch'],
      cwd: tempDir,
      progressTitle: 'ERC'
    });

    while (spawnMock.mock.calls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    child?.stdout.emit('data', Buffer.from('same'));
    child?.emit('close', 0);

    await expect(first).resolves.toEqual(
      expect.objectContaining({ stdout: 'same' })
    );
    await expect(second).resolves.toEqual(
      expect.objectContaining({ stdout: 'same' })
    );
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('applies each caller parseOutput after de-duplicated execution', async () => {
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    let child: ReturnType<typeof createChildProcessMock> | undefined;
    spawnMock.mockImplementation(() => {
      child = createChildProcessMock();
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);
    const firstSuffix = 'first';
    const secondSuffix = 'second';
    const first = runner.run({
      command: ['sch', 'erc', 'sample.kicad_sch'],
      cwd: tempDir,
      progressTitle: 'ERC',
      parseOutput: (stdout) => `${stdout}-${firstSuffix}`
    });
    const second = runner.run({
      command: ['sch', 'erc', 'sample.kicad_sch'],
      cwd: tempDir,
      progressTitle: 'ERC',
      parseOutput: (stdout) => `${stdout}-${secondSuffix}`
    });

    while (spawnMock.mock.calls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    child?.stdout.emit('data', Buffer.from('same'));
    child?.emit('close', 0);

    await expect(first).resolves.toEqual(
      expect.objectContaining({ parsed: 'same-first' })
    );
    await expect(second).resolves.toEqual(
      expect.objectContaining({ parsed: 'same-second' })
    );
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('does not de-duplicate identical arguments from different working directories', async () => {
    __setConfiguration({});
    const firstCwd = path.join(tempDir, 'project-a');
    const secondCwd = path.join(tempDir, 'project-b');
    fs.mkdirSync(firstCwd);
    fs.mkdirSync(secondCwd);
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    const children: Array<ReturnType<typeof createChildProcessMock>> = [];
    spawnMock.mockImplementation(() => {
      const child = createChildProcessMock();
      children.push(child);
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);
    const first = runner.run({
      command: ['pcb', 'drc', 'board.kicad_pcb'],
      cwd: firstCwd,
      progressTitle: 'DRC'
    });
    const second = runner.run({
      command: ['pcb', 'drc', 'board.kicad_pcb'],
      cwd: secondCwd,
      progressTitle: 'DRC'
    });

    while (spawnMock.mock.calls.length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(spawnMock).toHaveBeenCalledTimes(2);
    children[0]?.stdout.emit('data', Buffer.from('project-a'));
    children[0]?.emit('close', 0);
    children[1]?.stdout.emit('data', Buffer.from('project-b'));
    children[1]?.emit('close', 0);

    await expect(first).resolves.toEqual(
      expect.objectContaining({ stdout: 'project-a' })
    );
    await expect(second).resolves.toEqual(
      expect.objectContaining({ stdout: 'project-b' })
    );

    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('redacts define variables and token-like values from logs and progress', async () => {
    const boardFile = path.join(tempDir, 'secret.kicad_pcb');
    fs.writeFileSync(boardFile, '', 'utf8');
    __setConfiguration({
      'kicadstudio.cli.defineVars': {
        CUSTOMER: 'confidential-customer'
      }
    });
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const onProgress = jest.fn();
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementation(() => {
      const child = createChildProcessMock();
      queueMicrotask(() => {
        child.stdout.emit(
          'data',
          Buffer.from('Bearer sk-123456789 api_token=raw-secret')
        );
        child.emit('close', 0);
      });
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);
    await runner.run({
      command: ['pcb', 'drc', boardFile],
      cwd: tempDir,
      progressTitle: 'DRC',
      onProgress
    });

    const logOutput = logger.info.mock.calls.flat().join('\n');
    const progressOutput = onProgress.mock.calls.flat().join('\n');
    expect(logOutput).toContain('CUSTOMER=***');
    expect(logOutput).not.toContain('confidential-customer');
    expect(logOutput).not.toContain('sk-123456789');
    expect(logOutput).not.toContain('raw-secret');
    expect(progressOutput).toContain('Bearer ***');
    expect(progressOutput).toContain('api_token=***');
  });

  it('fails fast when no kicad-cli installation can be detected', async () => {
    __setConfiguration({});
    const runner = new KiCadCliRunner(
      { detect: jest.fn().mockResolvedValue(undefined) } as never,
      {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      } as never
    );

    await expect(
      runner.run({
        command: ['pcb', 'drc', 'board.kicad_pcb'],
        cwd: tempDir,
        progressTitle: 'DRC'
      })
    ).rejects.toBeInstanceOf(KiCadCliNotFoundError);
  });

  it('rejects unsafe child-process arguments before spawning', async () => {
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    const runner = new KiCadCliRunner(detector as never, logger as never);

    await expect(
      runner.run({
        command: ['pcb', 'drc', 'board.kicad_pcb\n--delete'],
        cwd: tempDir,
        progressTitle: 'DRC'
      })
    ).rejects.toThrow('control-line characters');
    await expect(
      runner.run({
        command: ['pcb', 'drc', 'board.kicad_pcb'],
        cwd: path.join(tempDir, 'missing'),
        progressTitle: 'DRC'
      })
    ).rejects.toThrow('existing absolute path');

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('normalizes ENOENT child-process errors into KiCadCliNotFoundError', async () => {
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementation(() => {
      const child = createChildProcessMock();
      queueMicrotask(() => {
        child.emit('error', new Error('spawn ENOENT'));
      });
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);

    await expect(
      runner.run({
        command: ['pcb', 'export', 'gerbers', 'board.kicad_pcb'],
        cwd: tempDir,
        progressTitle: 'Export'
      })
    ).rejects.toBeInstanceOf(KiCadCliNotFoundError);
  });

  it('returns parsed output from runWithProgress and forwards progress text', async () => {
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const onProgress = jest.fn();
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementation(() => {
      const child = createChildProcessMock();
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('payload'));
        child.emit('close', 0);
      });
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);
    const result = await runner.runWithProgress<string>({
      command: ['pcb', 'export', 'gerbers', 'board.kicad_pcb'],
      cwd: tempDir,
      progressTitle: 'Export',
      parseOutput: (stdout) => `${stdout}-parsed`,
      onProgress
    });

    expect(result).toBe('payload-parsed');
    expect(onProgress).toHaveBeenCalledWith('payload');
  });

  it('truncates large stdout and stderr buffers while preserving command completion', async () => {
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementation(() => {
      const child = createChildProcessMock();
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.alloc(10 * 1024 * 1024 + 4096, 'a'));
        child.stderr.emit('data', Buffer.alloc(10 * 1024 * 1024 + 4096, 'b'));
        child.emit('close', 0);
      });
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);
    const result = await runner.run({
      command: ['pcb', 'drc', 'board.kicad_pcb'],
      cwd: tempDir,
      progressTitle: 'DRC'
    });

    expect(result.stdout.length).toBeLessThan(10 * 1024 * 1024 + 4096);
    expect(result.stderr.length).toBeLessThan(10 * 1024 * 1024 + 4096);
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stderrTruncated).toBe(true);
    expect(result.truncatedOutputBytes).toBeGreaterThan(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('truncated')
    );
  });

  it('uses file-not-found wording for missing input files and ignores broken project JSON', async () => {
    const boardFile = path.join(tempDir, 'broken.kicad_pcb');
    const projectFile = path.join(tempDir, 'broken.kicad_pro');
    fs.writeFileSync(boardFile, '', 'utf8');
    fs.writeFileSync(projectFile, '{invalid-json', 'utf8');
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      expect(args).not.toContain('--define-var');
      const child = createChildProcessMock();
      queueMicrotask(() => {
        child.stderr.emit('data', Buffer.from('No such file or directory'));
        child.emit('close', 1);
      });
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);

    await expect(
      runner.run({
        command: ['pcb', 'export', 'gerbers', boardFile],
        cwd: tempDir,
        progressTitle: 'Export'
      })
    ).rejects.toThrow('required file was not found');
  });

  it('maps ENOENT stderr output on process exit to the not-found guidance', async () => {
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementation(() => {
      const child = createChildProcessMock();
      queueMicrotask(() => {
        child.stderr.emit('data', Buffer.from('spawn ENOENT'));
        child.emit('close', 1);
      });
      return child;
    });

    const runner = new KiCadCliRunner(detector as never, logger as never);

    await expect(
      runner.run({
        command: ['pcb', 'export', 'gerbers', 'board.kicad_pcb'],
        cwd: tempDir,
        progressTitle: 'Export'
      })
    ).rejects.toThrow('kicad-cli not found');
  });

  it('returns an abort reason when an external signal is already aborted', async () => {
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const externalAbort = new AbortController();
    externalAbort.abort(new Error('external cancel'));
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementation(
      (_command: string, _args: string[], options: { signal: AbortSignal }) => {
        const child = createChildProcessMock();
        queueMicrotask(() => {
          child.emit(
            'error',
            Object.assign(new Error('aborted'), {
              name: 'AbortError',
              cause: options.signal.reason
            })
          );
        });
        return child;
      }
    );

    const runner = new KiCadCliRunner(detector as never, logger as never);

    await expect(
      runner.run({
        command: ['pcb', 'export', 'gerbers', 'board.kicad_pcb'],
        cwd: tempDir,
        progressTitle: 'Export',
        signal: externalAbort.signal
      })
    ).rejects.toThrow('external cancel');
  });

  it('cancels all tracked commands when cancelAll is invoked', async () => {
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    let abortSignal: AbortSignal | undefined;
    spawnMock.mockImplementation(
      (_command: string, _args: string[], options: { signal: AbortSignal }) => {
        abortSignal = options.signal;
        const child = createChildProcessMock();
        options.signal.addEventListener('abort', () => {
          child.emit(
            'error',
            Object.assign(new Error('aborted'), {
              name: 'AbortError',
              cause: options.signal.reason
            })
          );
        });
        return child;
      }
    );

    const runner = new KiCadCliRunner(detector as never, logger as never);
    const pending = runner.run({
      command: ['pcb', 'export', 'gerbers', 'board.kicad_pcb'],
      cwd: tempDir,
      progressTitle: 'Export'
    });
    while (!abortSignal) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    runner.cancelAll();

    await expect(pending).rejects.toThrow('KiCad commands cancelled.');
  });
});
