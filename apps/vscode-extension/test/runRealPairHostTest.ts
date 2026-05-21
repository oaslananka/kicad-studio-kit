import * as path from 'node:path';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
  const extensionTestsPath = path.resolve(__dirname, 'realPairSuite', 'index');
  const fixturePath = path.resolve(
    extensionDevelopmentPath,
    'test',
    'fixtures',
    'benchmark_projects',
    'pass_minimal_mcu_board'
  );
  const vscodeExecutablePath = await downloadAndUnzipVSCode('1.115.0');
  const userDataDir = await mkdtemp(
    path.join(tmpdir(), 'kicadstudio-real-pair-user-')
  );
  const extensionsDir = await mkdtemp(
    path.join(tmpdir(), 'kicadstudio-real-pair-extensions-')
  );
  const workspacePath = await mkdtemp(
    path.join(tmpdir(), 'kicadstudio-real-pair-workspace-')
  );
  await cp(fixturePath, workspacePath, { recursive: true });

  try {
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspacePath,
        '--disable-extensions',
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--disable-updates',
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`
      ]
    });
  } finally {
    await Promise.all(
      [userDataDir, extensionsDir, workspacePath].map((dir) =>
        rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {
          // VS Code can keep log files briefly locked after exit.
        })
      )
    );
  }
}

void main().catch((error) => {
  console.error('Failed to run real-pair extension host tests');
  console.error(error);
  process.exit(1);
});
