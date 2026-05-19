import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page
} from '@playwright/test';

const VSCODE_VERSION = '1.115.0';

export interface VsCodeSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  logs: string[];
  workspacePath: string;
  close(): Promise<void>;
}

export async function launchVsCodeWithFixtures(): Promise<VsCodeSession> {
  const rootDir = path.resolve(__dirname, '..', '..');
  const fixturesDir = path.join(rootDir, 'test', 'fixtures');
  const workspacePath = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kicadstudio-e2e-workspace-')
  );
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kicadstudio-e2e-user-')
  );
  const extensionsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kicadstudio-e2e-ext-')
  );
  const logs: string[] = [];
  copyDirectory(fixturesDir, workspacePath);
  writeUserSettings(userDataDir);

  const executablePath = await downloadAndUnzipVSCode(VSCODE_VERSION);
  const remoteDebuggingPort = await getFreePort();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(
    executablePath,
    [
      `--remote-debugging-port=${remoteDebuggingPort}`,
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      `--extensionDevelopmentPath=${rootDir}`,
      '--disable-workspace-trust',
      '--skip-welcome',
      workspacePath
    ],
    {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  child.stdout.on('data', (chunk) =>
    logs.push(`[stdout] ${String(chunk).trim()}`)
  );
  child.stderr.on('data', (chunk) =>
    logs.push(`[stderr] ${String(chunk).trim()}`)
  );

  let browser: Browser | undefined;
  try {
    browser = await connectToVsCode(remoteDebuggingPort, logs);
    const context = browser.contexts()[0] ?? browser.contexts().at(0);
    if (!context) {
      throw new Error(
        buildHarnessError('No VS Code browser context became available.', logs)
      );
    }
    const page =
      context.pages()[0] ??
      (await context.waitForEvent('page', { timeout: 30000 }));
    await page.waitForLoadState('domcontentloaded');

    return {
      browser,
      context,
      page,
      logs,
      workspacePath,
      async close() {
        await closeSession(browser, child, [
          workspacePath,
          userDataDir,
          extensionsDir
        ]);
      }
    };
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    await killProcess(child);
    await cleanupDirectories([workspacePath, userDataDir, extensionsDir]);
    throw error;
  }
}

async function connectToVsCode(port: number, logs: string[]): Promise<Browser> {
  const deadline = Date.now() + 60000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(
    buildHarnessError(
      `Timed out connecting to VS Code over CDP on port ${port}. ${
        lastError instanceof Error ? lastError.message : String(lastError ?? '')
      }`.trim(),
      logs
    )
  );
}

async function closeSession(
  browser: Browser,
  child: ChildProcessWithoutNullStreams,
  directories: string[]
): Promise<void> {
  await browser.close().catch(() => undefined);
  await killProcess(child);
  await cleanupDirectories(directories);
}

async function killProcess(
  child: ChildProcessWithoutNullStreams
): Promise<void> {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  child.kill();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function cleanupDirectories(directories: string[]): Promise<void> {
  for (const directory of directories) {
    await removeDirectoryWithRetry(directory);
  }
}

async function removeDirectoryWithRetry(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : undefined;
      if (
        attempt === 4 ||
        (code !== 'EPERM' && code !== 'ENOTEMPTY' && code !== 'EBUSY')
      ) {
        // Cleanup should not turn a passing smoke test into a failure on Windows.
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

function writeUserSettings(userDataDir: string): void {
  const settingsPath = path.join(userDataDir, 'User', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        'git.enabled': false,
        'kicadstudio.mcp.autoDetect': false,
        'workbench.startupEditor': 'none'
      },
      null,
      2
    ),
    'utf8'
  );
}

function copyDirectory(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const nextSource = path.join(source, entry.name);
    const nextDestination = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(nextSource, nextDestination);
    } else {
      fs.copyFileSync(nextSource, nextDestination);
    }
  }
}

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to resolve a free localhost port.'));
        return;
      }
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function buildHarnessError(message: string, logs: string[]): string {
  const tail = logs.slice(-20).join('\n');
  return tail ? `${message}\n\nVS Code logs:\n${tail}` : message;
}
