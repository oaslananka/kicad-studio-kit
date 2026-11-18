import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams
} from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page
} from '@playwright/test';

import { downloadVsCodeWithRetry } from '../vscodeTestRuntime';
import { installFakeKiCadCli } from './fakeKiCadCli';

const VSCODE_VERSION = '1.122.0';
const execFileAsync = promisify(execFile);

export interface VsCodeSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  logs: string[];
  workspacePath: string;
  close(): Promise<void>;
}

export interface VsCodeLaunchOptions {
  settings?: Record<string, unknown>;
  workspaceSourcePath?: string;
  disableWebgl?: boolean;
  mockKiCadCli?: boolean;
  workspaceName?: string;
  softwareWebgl?: boolean;
}

export async function launchVsCodeWithFixtures(
  options: VsCodeLaunchOptions = {}
): Promise<VsCodeSession> {
  const rootDir = path.resolve(__dirname, '..', '..');
  const fixturesDir =
    options.workspaceSourcePath ?? path.join(rootDir, 'test', 'fixtures');
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kicadstudio-e2e-workspace-')
  );
  const workspacePath = options.workspaceName
    ? path.join(workspaceRoot, options.workspaceName)
    : workspaceRoot;
  if (workspacePath !== workspaceRoot) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kicadstudio-e2e-user-')
  );
  const extensionsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kicadstudio-e2e-ext-')
  );
  const logs: string[] = [];
  copyDirectory(fixturesDir, workspacePath);
  const settings = { ...options.settings };
  if (options.mockKiCadCli) {
    settings['kicadstudio.kicadCliPath'] =
      installFakeKiCadCli(workspacePath).configuredPath;
  }
  writeUserSettings(userDataDir, settings);

  // Reuse an explicitly selected, locally installed VS Code in native QA.
  // CI remains pinned to the release download without this optional setting.
  const localExecutable = process.env['KICADSTUDIO_TEST_VSCODE_EXECUTABLE'];
  if (
    localExecutable &&
    (!path.isAbsolute(localExecutable) || !fs.existsSync(localExecutable))
  ) {
    throw new Error(
      'Local VS Code test executable must be an existing absolute path.'
    );
  }
  const executablePath =
    localExecutable ||
    (await downloadVsCodeWithRetry(VSCODE_VERSION, (version) =>
      downloadAndUnzipVSCode({
        version,
        timeout: 120_000,
        ...(process.platform === 'win32'
          ? { cachePath: path.join(os.tmpdir(), 'kicadstudio-vscode-test') }
          : {})
      })
    ));
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
      '--no-sandbox',
      '--disable-gpu-sandbox',
      ...(options.softwareWebgl
        ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
        : []),
      ...(options.disableWebgl ? ['--disable-webgl', '--disable-3d-apis'] : []),
      '--disable-workspace-trust',
      '--skip-welcome',
      workspacePath
    ],
    {
      cwd: rootDir,
      env,
      // An isolated process group lets teardown terminate VS Code's Electron
      // helpers even when its launcher exits and the children are reparented.
      detached: process.platform !== 'win32',
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
    // Wait for the workbench shell to mount before handing the page to a test.
    // `domcontentloaded` fires while VS Code is still booting; gating on the
    // workbench root gives every test a deterministic ready state instead of
    // racing the editor's first paint (a known source of slow-runner flake).
    await page.waitForSelector('.monaco-workbench', { timeout: 60000 });

    return {
      browser,
      context,
      page,
      logs,
      workspacePath,
      async close() {
        await closeSession(browser, child, [
          workspaceRoot,
          userDataDir,
          extensionsDir
        ]);
      }
    };
  } catch (error) {
    if (browser) {
      await closeBrowserBounded(browser);
    }
    try {
      await cleanupTestProcess(child, userDataDir);
    } finally {
      await cleanupDirectories([workspaceRoot, userDataDir, extensionsDir]);
    }
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
  await closeBrowserBounded(browser);
  try {
    await cleanupTestProcess(child, directories[1]!);
  } finally {
    await cleanupDirectories(directories);
  }
}

async function closeBrowserBounded(browser: Browser): Promise<void> {
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 2000))
  ]);
}

async function cleanupTestProcess(
  child: ChildProcessWithoutNullStreams,
  userDataDir: string
): Promise<void> {
  try {
    await killProcess(child);
  } finally {
    // The VS Code launcher can detach and reparent a second Electron process
    // after its original PID has exited. Isolated process-group teardown alone
    // cannot see that process. Sweep by this session's unique user-data-dir.
    await terminateSessionByProfile(userDataDir);
  }
}

async function terminateSessionByProfile(userDataDir: string): Promise<void> {
  if (process.platform === 'win32') {
    const script =
      '$profilePath = $env:KICADSTUDIO_TEST_PROFILE; ' +
      'Get-CimInstance Win32_Process | Where-Object { ' +
      '$_.CommandLine -and $_.CommandLine.Contains($profilePath) -and ' +
      '$_.CommandLine.Contains("--user-data-dir") ' +
      '} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        windowsHide: true,
        timeout: 10000,
        env: { ...process.env, KICADSTUDIO_TEST_PROFILE: userDataDir }
      }
    );
    return;
  }
  if (process.platform !== 'linux') return;

  const findSessionPids = (): number[] => {
    const expected = Buffer.from(`--user-data-dir=${userDataDir}`);
    const crashpad = Buffer.from(`${userDataDir}/Crashpad`);
    const pids: number[] = [];
    for (const item of fs.readdirSync('/proc', { withFileTypes: true })) {
      if (!item.isDirectory() || !/^\d+$/u.test(item.name)) continue;
      const pid = Number(item.name);
      if (pid === process.pid || pid === process.ppid) continue;
      try {
        const commandLine = fs.readFileSync(`/proc/${pid}/cmdline`);
        if (
          !commandLine.includes(expected) &&
          !commandLine.includes(crashpad)
        ) {
          continue;
        }
        const executable = path.basename(fs.readlinkSync(`/proc/${pid}/exe`));
        if (
          executable === 'code' ||
          executable === 'code-insiders' ||
          executable === 'chrome_crashpad_handler'
        ) {
          pids.push(pid);
        }
      } catch {
        // Processes can exit while /proc is being enumerated.
      }
    }
    return pids;
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pids = findSessionPids();
    if (!pids.length) return;
    for (const pid of pids) {
      try {
        process.kill(pid, attempt === 0 ? 'SIGTERM' : 'SIGKILL');
      } catch (error) {
        if (!isMissingProcess(error)) throw error;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
  }
  const remaining = findSessionPids();
  if (remaining.length) {
    throw new Error(
      `VS Code test profile still has running processes: ${remaining.join(', ')}`
    );
  }
}

async function killProcess(
  child: ChildProcessWithoutNullStreams
): Promise<void> {
  const pid = child.pid;
  if (!pid) return;

  if (process.platform === 'win32') {
    // Unlike child.kill(), taskkill /T also terminates VS Code's Electron
    // helpers. The PID is from this session's own spawned process only.
    await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 5000
    }).catch(() => undefined);
    return;
  }

  // Even if the launcher has already exited, its reparented Electron workers
  // can remain in the isolated process group. Never return just because the
  // child exited; close the entire group owned by this session.
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if (!isMissingProcess(error)) throw error;
    return;
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if (!isMissingProcess(error)) throw error;
  }
}

function isMissingProcess(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ESRCH'
  );
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

function writeUserSettings(
  userDataDir: string,
  overrides: Record<string, unknown> = {}
): void {
  const settingsPath = path.join(userDataDir, 'User', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        'git.enabled': false,
        'kicadstudio.mcp.autoDetect': false,
        'workbench.startupEditor': 'none',
        ...overrides
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
