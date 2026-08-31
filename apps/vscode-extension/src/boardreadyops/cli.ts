import { spawn } from 'node:child_process';
import type * as vscode from 'vscode';

export interface BoardReadyOpsCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runBoardReadyOpsCommand(
  projectPath: string,
  args: string[],
  token?: vscode.CancellationToken
): Promise<BoardReadyOpsCommandResult> {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(cmd, ['boardreadyops', ...args], {
      cwd: projectPath,
      env: { ...process.env },
      shell: false
    });

    let stdout = '';
    let stderr = '';
    const disposable = token?.onCancellationRequested(() => child.kill());

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      disposable?.dispose();
      reject(error);
    });
    child.on('close', (code) => {
      disposable?.dispose();
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}
