jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
import { runBoardReadyOpsCommand } from '../../src/boardreadyops/cli';
import { workspace } from './vscodeMock';

function createChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  return child;
}

describe('runBoardReadyOpsCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
  });

  it('runs BoardReadyOps without a shell and collects process output', async () => {
    const child = createChild();
    (childProcess.spawn as unknown as jest.Mock).mockReturnValue(child);
    const result = runBoardReadyOpsCommand('/project', [
      'doctor',
      '--format',
      'json'
    ]);
    child.stdout.emit('data', Buffer.from('{"ok":'));
    child.stdout.emit('data', Buffer.from('true}'));
    child.stderr.emit('data', Buffer.from('warning'));
    child.emit('close', 1);

    await expect(result).resolves.toEqual({
      stdout: '{"ok":true}',
      stderr: 'warning',
      exitCode: 1
    });
    expect(childProcess.spawn).toHaveBeenCalledWith(
      expect.stringMatching(/^npx(?:\.cmd)?$/),
      ['boardreadyops', 'doctor', '--format', 'json'],
      expect.objectContaining({ cwd: '/project', shell: false })
    );
  });

  it('decodes UTF-8 across stdout and stderr chunk boundaries', async () => {
    const child = createChild();
    (childProcess.spawn as unknown as jest.Mock).mockReturnValue(child);
    const result = runBoardReadyOpsCommand('/project', ['doctor']);

    const expected = 'Şema / Ölçüm / 測試';
    const payload = Buffer.from(expected, 'utf8');
    // Split every byte to exercise multibyte boundaries, not just ASCII.
    for (const byte of payload) {
      child.stdout.emit('data', Buffer.from([byte]));
      child.stderr.emit('data', Buffer.from([byte]));
    }
    child.emit('close', 0);

    await expect(result).resolves.toEqual({
      stdout: expected,
      stderr: expected,
      exitCode: 0
    });
  });

  it('kills the child on cancellation and disposes the listener on close', async () => {
    const child = createChild();
    (childProcess.spawn as unknown as jest.Mock).mockReturnValue(child);
    let cancel: (() => void) | undefined;
    const dispose = jest.fn();
    const token = {
      onCancellationRequested: jest.fn((handler: () => void) => {
        cancel = handler;
        return { dispose };
      })
    };

    const result = runBoardReadyOpsCommand('/project', ['run'], token as never);
    cancel?.();
    child.emit('close', null);

    expect(child.kill).toHaveBeenCalledTimes(1);
    await expect(result).rejects.toThrow('cancelled');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('never spawns a process from an untrusted workspace', async () => {
    workspace.isTrusted = false;
    await expect(
      runBoardReadyOpsCommand('/project', ['doctor'])
    ).rejects.toThrow('trusted workspace');
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it('rejects an already cancelled command before spawning', async () => {
    await expect(
      runBoardReadyOpsCommand('/project', ['run'], {
        isCancellationRequested: true
      } as never)
    ).rejects.toThrow('cancelled');
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it('rejects a process terminated without an exit code', async () => {
    const child = createChild();
    (childProcess.spawn as unknown as jest.Mock).mockReturnValue(child);
    const result = runBoardReadyOpsCommand('/project', ['run']);
    child.emit('close', null);
    await expect(result).rejects.toThrow('interrupted');
  });

  it('limits stdout and terminates the process without consuming more output', async () => {
    const child = createChild();
    (childProcess.spawn as unknown as jest.Mock).mockReturnValue(child);
    const result = runBoardReadyOpsCommand('/project', ['run']);
    child.stdout.emit('data', Buffer.alloc(4 * 1024 * 1024 + 1));
    expect(child.kill).toHaveBeenCalledTimes(1);
    child.emit('close', null);
    await expect(result).rejects.toThrow('safety limit');
  });

  it('terminates a command that exceeds its timeout', async () => {
    jest.useFakeTimers();
    try {
      const child = createChild();
      (childProcess.spawn as unknown as jest.Mock).mockReturnValue(child);
      const result = runBoardReadyOpsCommand('/project', ['run']);
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(child.kill).toHaveBeenCalledTimes(1);
      child.emit('close', null);
      await expect(result).rejects.toThrow('timed out');
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects spawn errors and disposes the cancellation listener', async () => {
    const child = createChild();
    (childProcess.spawn as unknown as jest.Mock).mockReturnValue(child);
    const dispose = jest.fn();
    const token = {
      onCancellationRequested: jest.fn(() => ({ dispose }))
    };

    const result = runBoardReadyOpsCommand(
      '/project',
      ['doctor'],
      token as never
    );
    child.emit('error', new Error('spawn failed'));

    await expect(result).rejects.toThrow('spawn failed');
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
