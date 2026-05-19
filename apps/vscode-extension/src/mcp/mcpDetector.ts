import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import type { McpInstallStatus } from '../types';

export interface McpInstallerCandidate {
  id: 'uvx' | 'pipx' | 'pip';
  label: string;
  description: string;
  command: string;
  args: string[];
}

function runExecFile(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', timeout: timeoutMs },
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
  args: string[]
): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await runExecFile(command, args, 8_000);
    const output = `${stdout}\n${stderr}`.trim();
    return { ok: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, output: message };
  }
}

export class McpDetector {
  async detectKicadMcpPro(): Promise<McpInstallStatus> {
    const uvxResult = await this.tryUvx();
    if (uvxResult.found) {
      return {
        found: true,
        command: 'uvx',
        version: uvxResult.version,
        source: 'uvx'
      };
    }

    const binaryResult = await this.tryBinary();
    if (binaryResult.found) {
      return {
        found: true,
        command: 'kicad-mcp-pro',
        version: binaryResult.version,
        source: 'global'
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

    const inspectorResult = await this.tryInspector();
    if (inspectorResult.found) {
      return {
        found: true,
        command: 'npx',
        version: inspectorResult.version,
        source: 'inspector'
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
    profile = 'full'
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
      status.command === 'uvx'
        ? 'uvx'
        : status.command === 'npx'
          ? 'npx'
          : 'kicad-mcp-pro';
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
            KICAD_MCP_PROFILE: profile
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

  async detectInstallers(): Promise<McpInstallerCandidate[]> {
    const candidates: McpInstallerCandidate[] = [];
    if (
      (await run('uvx', ['--version'])).ok ||
      (await run('uv', ['--version'])).ok
    ) {
      candidates.push({
        id: 'uvx',
        label: 'uv tool install kicad-mcp-pro',
        description: 'Recommended isolated Python tool install',
        command: 'uv',
        args: ['tool', 'install', 'kicad-mcp-pro']
      });
    }
    if ((await run('pipx', ['--version'])).ok) {
      candidates.push({
        id: 'pipx',
        label: 'pipx install kicad-mcp-pro',
        description: 'Install as an isolated Python app with pipx',
        command: 'pipx',
        args: ['install', 'kicad-mcp-pro']
      });
    }
    for (const command of ['pip', 'pip3', 'python', 'python3']) {
      const result = await run(
        command,
        command.startsWith('python')
          ? ['-m', 'pip', '--version']
          : ['--version']
      );
      if (result.ok) {
        candidates.push({
          id: 'pip',
          label: `${command} install --user kicad-mcp-pro`,
          description: 'Fallback user-site Python install',
          command,
          args: command.startsWith('python')
            ? ['-m', 'pip', 'install', '--user', 'kicad-mcp-pro']
            : ['install', '--user', 'kicad-mcp-pro']
        });
        break;
      }
    }
    return candidates;
  }

  private async tryUvx(): Promise<{ found: boolean; version?: string }> {
    const result = await run('uvx', ['kicad-mcp-pro', '--version']);
    if (!result.ok) {
      return { found: false };
    }
    const version = extractVersion(result.output);
    return {
      found: true,
      ...(version ? { version } : {})
    };
  }

  private async tryBinary(): Promise<{ found: boolean; version?: string }> {
    const result = await run('kicad-mcp-pro', ['--version']);
    if (!result.ok) {
      return { found: false };
    }
    const version = extractVersion(result.output);
    return {
      found: true,
      ...(version ? { version } : {})
    };
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

  private async tryInspector(): Promise<{ found: boolean; version?: string }> {
    const result = await run('npx', [
      '--yes',
      '@modelcontextprotocol/inspector',
      '--version'
    ]);
    if (!result.ok) {
      return { found: false };
    }
    const version = extractVersion(result.output);
    return {
      found: true,
      ...(version ? { version } : {})
    };
  }
}

function extractVersion(output: string): string | undefined {
  return output.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1];
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
  // global binary / pip / pipx
  return {
    command: 'kicad-mcp-pro',
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
