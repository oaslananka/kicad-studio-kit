import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import type { McpInstallStatus } from '../types';
import { isMcpVersionSupported } from './compat';

export interface McpInstallerCandidate {
  id: 'uvx' | 'pipx' | 'pip';
  label: string;
  description: string;
  command: string;
  args: string[];
}

export interface McpDoctorResult {
  ok: boolean;
  status?: string | undefined;
  recentErrors: string[];
  output: string;
  error?: string | undefined;
}

const MCP_MINIMUM_PYTHON = { major: 3, minor: 13 } as const;
const PYTHON_RUNTIME_SCRIPT =
  'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}"); print(sys.executable)';

interface PythonRuntimeProbe {
  command: string;
  prefixArgs: string[];
}

interface CompatiblePythonRuntime {
  executable: string;
  version: string;
}

const PYTHON_RUNTIME_PROBES: readonly PythonRuntimeProbe[] = [
  { command: 'python3.13', prefixArgs: [] },
  { command: 'python3.14', prefixArgs: [] },
  { command: 'python3', prefixArgs: [] },
  { command: 'python', prefixArgs: [] },
  { command: 'py', prefixArgs: ['-3.13'] },
  { command: 'py', prefixArgs: ['-3.14'] },
  { command: 'py', prefixArgs: ['-3'] }
];

function runExecFile(
  command: string,
  args: string[],
  timeoutMs: number,
  env?: Record<string, string>
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        ...(env ? { env: { ...process.env, ...env } } : {})
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
        }
      }
    );
  });
}

async function run(
  command: string,
  args: string[],
  options: { timeoutMs?: number; env?: Record<string, string> } = {}
): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await runExecFile(
      command,
      args,
      options.timeoutMs ?? 8_000,
      options.env
    );
    const output = `${stdout}\n${stderr}`.trim();
    return { ok: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, output: message };
  }
}

function isCompatiblePythonVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    return false;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (
    major > MCP_MINIMUM_PYTHON.major ||
    (major === MCP_MINIMUM_PYTHON.major && minor >= MCP_MINIMUM_PYTHON.minor)
  );
}

async function detectCompatiblePythonRuntime(): Promise<
  CompatiblePythonRuntime | undefined
> {
  for (const probe of PYTHON_RUNTIME_PROBES) {
    const result = await run(probe.command, [
      ...probe.prefixArgs,
      '-c',
      PYTHON_RUNTIME_SCRIPT
    ]);
    if (!result.ok) {
      continue;
    }

    const [version, executable] = result.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!version || !executable || !isCompatiblePythonVersion(version)) {
      continue;
    }
    return { executable, version };
  }
  return undefined;
}

export class McpDetector {
  async detectKicadMcpPro(): Promise<McpInstallStatus> {
    // Verify installed uv-tool executables before PATH-resolved global CLI.
    // A legacy pip installation may shadow a compatible uv tool on Windows.
    const uvToolResult = await this.tryUvTool();
    if (uvToolResult.found && isMcpVersionSupported(uvToolResult.version)) {
      return {
        found: true,
        command: 'kicad-mcp-pro',
        version: uvToolResult.version,
        source: 'uv-tool',
        executablePath: uvToolResult.executablePath
      };
    }

    // The actual installed executable is authoritative. Never run uvx during
    // detection: it may download a package or hide a missing installation.
    const binaryResult = await this.tryBinary();
    if (binaryResult.found) {
      return {
        found: true,
        command: 'kicad-mcp-pro',
        version: binaryResult.version,
        source: 'global',
        ...(binaryResult.executablePath
          ? { executablePath: binaryResult.executablePath }
          : {})
      };
    }

    const pipResult = await this.tryPip();
    if (pipResult.found) {
      return {
        found: true,
        command: 'kicad-mcp-pro',
        version: pipResult.version,
        source: 'pip'
      };
    }

    const pipxResult = await this.tryPipx();
    if (pipxResult.found) {
      return {
        found: true,
        command: 'pipx',
        version: pipxResult.version,
        source: 'pipx'
      };
    }

    // Preserve incompatible installed-version evidence if no other binary
    // was found; the UI can display an actionable compatibility warning.
    if (uvToolResult.found) {
      return {
        found: true,
        command: 'kicad-mcp-pro',
        version: uvToolResult.version,
        source: 'uv-tool',
        executablePath: uvToolResult.executablePath
      };
    }
    return {
      found: false,
      source: 'none'
    };
  }

  async generateMcpJson(
    projectDir: string,
    status: McpInstallStatus,
    profile = 'review'
  ): Promise<void> {
    const root =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? projectDir;
    const mcpJsonPath = path.join(root, '.vscode', 'mcp.json');

    if (fs.existsSync(mcpJsonPath)) {
      const choice = await vscode.window.showWarningMessage(
        '.vscode/mcp.json already exists. Overwrite it?',
        'Overwrite',
        'Cancel'
      );
      if (choice !== 'Overwrite') {
        return;
      }
    }

    const command =
      status.executablePath ??
      (status.command === 'uvx'
        ? 'uvx'
        : status.command === 'npx'
          ? 'npx'
          : 'kicad-mcp-pro');
    const args =
      status.command === 'uvx'
        ? ['kicad-mcp-pro']
        : status.command === 'npx'
          ? ['@modelcontextprotocol/inspector', 'kicad-mcp-pro']
          : [];
    const config = {
      servers: {
        kicad: {
          type: 'stdio',
          command,
          args,
          env: {
            KICAD_MCP_PROJECT_DIR: projectDir,
            KICAD_MCP_PROFILE: profile,
            // Least-privilege default: read-only until the user opts into
            // write/manufacturing tools.
            KICAD_MCP_OPERATING_MODE: 'readonly'
          }
        }
      }
    };

    fs.mkdirSync(path.dirname(mcpJsonPath), { recursive: true });
    fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2), 'utf8');

    void vscode.window.showInformationMessage(
      'kicad-mcp-pro was detected and .vscode/mcp.json was created. You can now use it from Claude Code, Cursor, or another MCP client.'
    );
  }

  /**
   * Generate an HTTP-transport configuration:
   *  - .vscode/tasks.json  — background task that starts kicad-mcp-pro with --transport http
   *  - .vscode/mcp.json    — Streamable HTTP entry so VS Code and MCP clients can connect over HTTP
   */
  async generateHttpConfig(
    projectDir: string,
    status: McpInstallStatus,
    profile = 'full',
    port = 27185
  ): Promise<void> {
    const root =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? projectDir;
    const vscodeDirPath = path.join(root, '.vscode');
    fs.mkdirSync(vscodeDirPath, { recursive: true });

    // ── tasks.json ────────────────────────────────────────────────────────────
    const tasksJsonPath = path.join(vscodeDirPath, 'tasks.json');
    const newTask = buildHttpTask(status, profile, port, projectDir);

    let tasksConfig: { version: string; tasks: unknown[] } = {
      version: '2.0.0',
      tasks: []
    };
    if (fs.existsSync(tasksJsonPath)) {
      try {
        tasksConfig = JSON.parse(
          fs.readFileSync(tasksJsonPath, 'utf8')
        ) as typeof tasksConfig;
        if (!Array.isArray(tasksConfig.tasks)) {
          tasksConfig.tasks = [];
        }
        // Remove stale kicad-mcp-pro HTTP task if present
        tasksConfig.tasks = tasksConfig.tasks.filter(
          (t) =>
            !(
              typeof t === 'object' &&
              t !== null &&
              'label' in t &&
              (t as { label: string }).label === newTask.label
            )
        );
      } catch {
        // malformed — overwrite
        tasksConfig = { version: '2.0.0', tasks: [] };
      }
    }
    tasksConfig.tasks.push(newTask);
    fs.writeFileSync(
      tasksJsonPath,
      JSON.stringify(tasksConfig, null, 2),
      'utf8'
    );

    // ── mcp.json (Streamable HTTP entry for VS Code / MCP clients) ─────────────
    const mcpJsonPath = path.join(vscodeDirPath, 'mcp.json');
    let mcpConfig: { servers: Record<string, unknown> } = { servers: {} };
    if (fs.existsSync(mcpJsonPath)) {
      try {
        mcpConfig = JSON.parse(
          fs.readFileSync(mcpJsonPath, 'utf8')
        ) as typeof mcpConfig;
        if (
          typeof mcpConfig.servers !== 'object' ||
          mcpConfig.servers === null
        ) {
          mcpConfig.servers = {};
        }
      } catch {
        mcpConfig = { servers: {} };
      }
    }
    mcpConfig.servers['kicad'] = {
      type: 'http',
      url: `http://localhost:${port}/mcp`
    };
    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), 'utf8');

    const action = await vscode.window.showInformationMessage(
      `HTTP task added to .vscode/tasks.json and mcp.json updated with Streamable HTTP entry (port ${port}). ` +
        'Run "Start kicad-mcp-pro (HTTP)" via Terminal → Run Task to start the server.',
      'Run Task Now'
    );
    if (action === 'Run Task Now') {
      await vscode.commands.executeCommand(
        'workbench.action.tasks.runTask',
        newTask.label
      );
    }
  }

  /** Build the VS Code task definition for HTTP transport. */
  buildHttpTaskArgs(
    status: McpInstallStatus,
    profile: string,
    port: number,
    projectDir: string
  ): { command: string; args: string[] } {
    return buildHttpTaskArgs(status, profile, port, projectDir);
  }

  async runDoctor(
    status: McpInstallStatus,
    projectDir?: string
  ): Promise<McpDoctorResult> {
    const invocation = doctorInvocation(status);
    if (!invocation) {
      return {
        ok: false,
        recentErrors: [],
        output: '',
        error:
          'kicad-mcp-pro doctor is unavailable for this installation source.'
      };
    }

    const result = await run(invocation.command, invocation.args, {
      timeoutMs: 12_000,
      ...(projectDir ? { env: { KICAD_MCP_PROJECT_DIR: projectDir } } : {})
    });
    if (!result.ok) {
      return {
        ok: false,
        recentErrors: [],
        output: result.output,
        error: result.output
      };
    }

    const parsed = parseDoctorOutput(result.output);
    return {
      ok: true,
      status: parsed.status,
      recentErrors: parsed.recentErrors,
      output: result.output
    };
  }

  async detectInstallers(): Promise<McpInstallerCandidate[]> {
    const candidates: McpInstallerCandidate[] = [];
    if ((await run('uv', ['--version'])).ok) {
      candidates.push({
        id: 'uvx',
        label: 'uv tool install kicad-mcp-pro',
        description: 'Recommended isolated Python tool install',
        command: 'uv',
        args: ['tool', 'install', '--python', '3.13', 'kicad-mcp-pro']
      });
    }

    const pythonRuntime = await detectCompatiblePythonRuntime();
    if ((await run('pipx', ['--version'])).ok && pythonRuntime) {
      candidates.push({
        id: 'pipx',
        label: 'pipx install kicad-mcp-pro',
        description: `Install with Python ${pythonRuntime.version}`,
        command: 'pipx',
        args: ['install', '--python', pythonRuntime.executable, 'kicad-mcp-pro']
      });
    }

    if (pythonRuntime) {
      const pipResult = await run(pythonRuntime.executable, [
        '-m',
        'pip',
        '--version'
      ]);
      if (pipResult.ok) {
        candidates.push({
          id: 'pip',
          label: `${pythonRuntime.executable} -m pip install --user kicad-mcp-pro`,
          description: `Fallback user-site install with Python ${pythonRuntime.version}`,
          command: pythonRuntime.executable,
          args: ['-m', 'pip', 'install', '--user', 'kicad-mcp-pro']
        });
      }
    }
    return candidates;
  }

  private async tryUvTool(): Promise<{
    found: boolean;
    version?: string;
    executablePath?: string;
  }> {
    // Both uv commands are read-only. Do not use uvx: it can fetch packages.
    const installed = await run('uv', ['tool', 'list']);
    const version = installed.output.match(
      /^kicad-mcp-pro\s+v(\d+\.\d+\.\d+)(?:\s|$)/im
    )?.[1];
    if (!installed.ok || !version) {
      return { found: false };
    }
    const bin = await run('uv', ['tool', 'dir', '--bin']);
    const binDir = bin.output.trim();
    if (!bin.ok || !path.isAbsolute(binDir)) {
      return { found: false };
    }
    const executablePath = path.join(
      binDir,
      process.platform === 'win32' ? 'kicad-mcp-pro.exe' : 'kicad-mcp-pro'
    );
    if (!fs.existsSync(executablePath)) {
      return { found: false };
    }
    const probed = await run(executablePath, ['version']);
    if (!probed.ok || extractVersion(probed.output) !== version) {
      return { found: false };
    }
    return { found: true, version, executablePath };
  }

  private async tryBinary(): Promise<{
    found: boolean;
    version?: string;
    executablePath?: string;
  }> {
    // GUI-launched VS Code commonly omits ~/.local/bin from PATH, even when
    // uv/pipx installed the tool there. Probe the actual executable by an
    // absolute path rather than misreporting a valid install as missing.
    const name =
      process.platform === 'win32' ? 'kicad-mcp-pro.exe' : 'kicad-mcp-pro';
    const commands = [
      'kicad-mcp-pro',
      path.join(os.homedir(), '.local', 'bin', name),
      ...(process.platform === 'win32' && process.env['APPDATA']
        ? [path.join(process.env['APPDATA'], 'Python', 'Scripts', name)]
        : [])
    ];
    for (const command of commands) {
      const result = await run(command, ['version']);
      if (!result.ok) {
        continue;
      }
      const version = extractVersion(result.output);
      if (!version) {
        continue;
      }
      return {
        found: true,
        version,
        ...(path.isAbsolute(command) ? { executablePath: command } : {})
      };
    }
    return { found: false };
  }

  private async tryPip(): Promise<{ found: boolean; version?: string }> {
    for (const command of ['pip', 'pip3', 'python', 'python3']) {
      const args = command.startsWith('python')
        ? ['-m', 'pip', 'show', 'kicad-mcp-pro']
        : ['show', 'kicad-mcp-pro'];
      const result = await run(command, args);
      if (!result.ok) {
        continue;
      }
      const versionLine = result.output
        .split(/\r?\n/)
        .find((line) => line.toLowerCase().startsWith('version:'));
      const version = versionLine?.split(':')[1]?.trim();
      return {
        found: true,
        ...(version ? { version } : {})
      };
    }
    return { found: false };
  }

  private async tryPipx(): Promise<{ found: boolean; version?: string }> {
    const result = await run('pipx', ['list']);
    if (!result.ok || !/\bkicad-mcp-pro\b/i.test(result.output)) {
      return { found: false };
    }

    const version = result.output.match(
      /kicad-mcp-pro[^0-9]*(\d+\.\d+(?:\.\d+)?)/i
    )?.[1];
    return {
      found: true,
      ...(version ? { version } : {})
    };
  }
}

function extractVersion(output: string): string | undefined {
  return output.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1];
}

function doctorInvocation(
  status: McpInstallStatus
): { command: string; args: string[] } | undefined {
  if (!status.found) {
    return undefined;
  }
  if (status.executablePath) {
    return { command: status.executablePath, args: ['doctor', '--json'] };
  }
  if (status.command === 'uvx') {
    return { command: 'uvx', args: ['kicad-mcp-pro', 'doctor', '--json'] };
  }
  if (
    status.command === 'kicad-mcp-pro' ||
    status.command === 'pipx' ||
    status.command === 'pip' ||
    status.source === 'global' ||
    status.source === 'pipx' ||
    status.source === 'pip'
  ) {
    return { command: 'kicad-mcp-pro', args: ['doctor', '--json'] };
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseDoctorOutput(output: string): {
  status?: string | undefined;
  recentErrors: string[];
} {
  try {
    const payload: unknown = JSON.parse(output);
    if (!isRecord(payload)) {
      return { recentErrors: [] };
    }
    const status =
      typeof payload['status'] === 'string' ? payload['status'] : undefined;
    const errors = Array.isArray(payload['recent_errors'])
      ? payload['recent_errors'].filter(
          (entry): entry is string => typeof entry === 'string'
        )
      : [];
    return { status, recentErrors: errors };
  } catch {
    return { recentErrors: [] };
  }
}

function buildHttpTaskArgs(
  status: McpInstallStatus,
  _profile: string,
  port: number,
  _projectDir: string
): { command: string; args: string[] } {
  const httpFlags = ['--transport', 'http', '--port', String(port)];

  if (status.command === 'uvx') {
    return {
      command: 'uvx',
      args: ['kicad-mcp-pro', ...httpFlags]
    };
  }
  // global binary / pip / pipx (including a user-local CLI outside GUI PATH)
  return {
    command: status.executablePath ?? 'kicad-mcp-pro',
    args: [...httpFlags]
  };
}

function buildHttpTask(
  status: McpInstallStatus,
  profile: string,
  port: number,
  projectDir: string
): {
  label: string;
  type: string;
  command: string;
  args: string[];
  isBackground: boolean;
  problemMatcher: string[];
  options?: { env: Record<string, string> };
  presentation: { reveal: string; panel: string };
} {
  const { command, args } = buildHttpTaskArgs(
    status,
    profile,
    port,
    projectDir
  );
  const base = {
    label: 'Start kicad-mcp-pro (HTTP)',
    type: 'shell',
    command,
    args,
    isBackground: true,
    problemMatcher: [] as string[],
    presentation: {
      reveal: 'always',
      panel: 'dedicated'
    }
  };
  return {
    ...base,
    options: {
      env: {
        KICAD_MCP_PROFILE: profile,
        KICAD_MCP_PROJECT_DIR: projectDir
      }
    }
  };
}
