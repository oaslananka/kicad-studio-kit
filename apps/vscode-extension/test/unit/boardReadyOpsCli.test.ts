jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
import { runBoardReadyOpsCommand } from '../../src/boardreadyops/cli';

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
  beforeEach(() => jest.clearAllMocks());

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
    await expect(result).resolves.toEqual({
      stdout: '',
      stderr: '',
      exitCode: 0
    });
    expect(dispose).toHaveBeenCalledTimes(1);
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
