import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index');
  const workspacePath = path.resolve(__dirname, '..', '..', 'test', 'fixtures');
  const vscodeExecutablePath = await downloadAndUnzipVSCode('1.115.0');
  const userDataDir = await mkdtemp(
    path.join(tmpdir(), 'kicadstudio-vscode-user-')
  );
  const extensionsDir = await mkdtemp(
    path.join(tmpdir(), 'kicadstudio-vscode-extensions-')
  );

  try {
    const args = [
      '--disable-extensions',
      '--folder-uri',
      pathToFileURL(workspacePath).toString(),
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--disable-updates',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      `--extensionTestsPath=${extensionTestsPath}`,
      `--extensionDevelopmentPath=${extensionDevelopmentPath}`
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(vscodeExecutablePath, args, {
        env: process.env,
        stdio: 'inherit',
        shell: false
      });

      child.on('error', reject);
      child.on('close', (code, signal) => {
        console.log(`Exit code:   ${code ?? signal}`);
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`VS Code extension tests failed with ${code ?? signal}`)
          );
        }
      });
    });
  } finally {
    await Promise.all(
      [userDataDir, extensionsDir].map((dir) =>
        rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {
          // VS Code can keep log files briefly locked on Windows after exit.
        })
      )
    );
  }
}

void main().catch((error) => {
  console.error('Failed to run extension tests');
  console.error(error);
  process.exit(1);
});
