import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type * as vscode from 'vscode';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';

export interface BoardReadyOpsCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const BOARDREADYOPS_TIMEOUT_MS = 5 * 60 * 1000;
const BOARDREADYOPS_OUTPUT_LIMIT_BYTES = 4 * 1024 * 1024;

export function runBoardReadyOpsCommand(
  projectPath: string,
  args: string[],
  token?: vscode.CancellationToken
): Promise<BoardReadyOpsCommandResult> {
  // This is also called by the manufacturing release gate, not only commands.
  if (!isWorkspaceTrusted()) {
    return Promise.reject(
      new Error('BoardReadyOps requires a trusted workspace.')
    );
  }
  if (token?.isCancellationRequested) {
    return Promise.reject(new Error('BoardReadyOps command cancelled.'));
  }

  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(cmd, ['boardreadyops', ...args], {
      cwd: projectPath,
      env: { ...process.env },
      shell: false
    });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let failure: Error | undefined;
    let settled = false;

    const stop = (reason: Error): void => {
      failure ??= reason;
      child.kill();
    };

    const timeout = setTimeout(
      () => stop(new Error('BoardReadyOps command timed out.')),
      BOARDREADYOPS_TIMEOUT_MS
    );
    timeout.unref();
    const disposable = token?.onCancellationRequested(() =>
      stop(new Error('BoardReadyOps command cancelled.'))
    );

    const finish = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      disposable?.dispose();
      complete();
    };

    const append = (chunk: Buffer, stream: 'stdout' | 'stderr'): void => {
      if (failure) return;
      const bytes = Buffer.byteLength(chunk);
      const total = (stream === 'stdout' ? stdoutBytes : stderrBytes) + bytes;
      if (total > BOARDREADYOPS_OUTPUT_LIMIT_BYTES) {
        stop(
          new Error('BoardReadyOps command output exceeded its safety limit.')
        );
        return;
      }
      if (stream === 'stdout') {
        stdoutBytes = total;
        stdout += stdoutDecoder.write(chunk);
      } else {
        stderrBytes = total;
        stderr += stderrDecoder.write(chunk);
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => append(chunk, 'stdout'));
    child.stderr?.on('data', (chunk: Buffer) => append(chunk, 'stderr'));
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code, signal) => {
      finish(() => {
        if (failure) {
          reject(failure);
        } else if (token?.isCancellationRequested || code === null || signal) {
          reject(new Error('BoardReadyOps command was interrupted.'));
        } else {
          resolve({
            stdout: stdout + stdoutDecoder.end(),
            stderr: stderr + stderrDecoder.end(),
            exitCode: code
          });
        }
      });
    });
  });
}
