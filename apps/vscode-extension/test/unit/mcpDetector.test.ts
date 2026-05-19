import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import { McpDetector } from '../../src/mcp/mcpDetector';
import { window, workspace } from './vscodeMock';

jest.mock('node:child_process', () => ({
  execFile: jest.fn()
}));

describe('McpDetector.generateMcpJson', () => {
  let tempDir: string;
  let execFileMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-mcp-'));
    workspace.workspaceFolders = [{ uri: { fsPath: tempDir } }];
    execFileMock = childProcess.execFile as unknown as jest.Mock;
    // Default: all commands fail
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        callback(new Error('not found'), '', 'not found');
      }
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a stdio MCP configuration for uvx installs', async () => {
    const detector = new McpDetector();

    await detector.generateMcpJson(
      tempDir,
      {
        found: true,
        command: 'uvx',
        version: '0.5.0',
        source: 'uvx'
      },
      'analysis'
    );

    const configPath = path.join(tempDir, '.vscode', 'mcp.json');
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      servers: {
        kicad: {
          command: string;
          args: string[];
          env: Record<string, string>;
        };
      };
    };

    expect(saved.servers.kicad.command).toBe('uvx');
    expect(saved.servers.kicad.args).toEqual(['kicad-mcp-pro']);
    expect(saved.servers.kicad.env['KICAD_MCP_PROJECT_DIR']).toBe(tempDir);
    expect(saved.servers.kicad.env['KICAD_MCP_PROFILE']).toBe('analysis');
    expect(window.showInformationMessage).toHaveBeenCalled();
  });

  it('keeps an existing file when overwrite is cancelled', async () => {
    const detector = new McpDetector();
    const configDir = path.join(tempDir, '.vscode');
    const configPath = path.join(configDir, 'mcp.json');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, '{"preserve":true}', 'utf8');
    (window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

    await detector.generateMcpJson(tempDir, {
      found: true,
      command: 'kicad-mcp-pro',
      version: '0.5.0',
      source: 'global'
    });

    expect(fs.readFileSync(configPath, 'utf8')).toBe('{"preserve":true}');
  });

  it('overwrites an existing file when the user confirms the prompt', async () => {
    const detector = new McpDetector();
    const configDir = path.join(tempDir, '.vscode');
    const configPath = path.join(configDir, 'mcp.json');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, '{"preserve":true}', 'utf8');
    (window.showWarningMessage as jest.Mock).mockResolvedValue('Overwrite');

    await detector.generateMcpJson(tempDir, {
      found: true,
      command: 'kicad-mcp-pro',
      version: '0.5.0',
      source: 'global'
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      servers: {
        kicad: {
          command: string;
          args: string[];
        };
      };
    };
    expect(saved.servers.kicad.command).toBe('kicad-mcp-pro');
    expect(saved.servers.kicad.args).toEqual([]);
  });

  it('prefers uvx during install detection when it is available', async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        if (command === 'uvx') {
          callback(null, 'kicad-mcp-pro 0.8.0', '');
        } else {
          callback(new Error('missing'), '', 'missing');
        }
      }
    );

    const result = await new McpDetector().detectKicadMcpPro();

    expect(result).toEqual({
      found: true,
      command: 'uvx',
      version: '0.8.0',
      source: 'uvx'
    });
  });

  it('falls back to a global binary and then pip metadata', async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        if (command === 'kicad-mcp-pro') {
          callback(null, 'kicad-mcp-pro 0.9.1', '');
        } else {
          callback(new Error('missing'), '', 'missing');
        }
      }
    );

    const result = await new McpDetector().detectKicadMcpPro();

    expect(result.command).toBe('kicad-mcp-pro');
    expect(result.source).toBe('global');
  });

  it('uses pip metadata when no direct executable is available', async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        if (command === 'pip' && Array.isArray(args) && args[0] === 'show') {
          callback(null, 'Name: kicad-mcp-pro\nVersion: 0.7.4\n', '');
        } else {
          callback(new Error('missing'), '', 'missing');
        }
      }
    );

    const result = await new McpDetector().detectKicadMcpPro();

    expect(result).toEqual({
      found: true,
      command: 'kicad-mcp-pro',
      version: '0.7.4',
      source: 'pip'
    });
  });

  it('reports not found when all detection strategies fail', async () => {
    // Default mock already makes everything fail

    const result = await new McpDetector().detectKicadMcpPro();

    expect(result).toEqual({
      found: false,
      source: 'none'
    });
  });

  it('falls back to pipx metadata when uvx, global binary, and pip are unavailable', async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        if (command === 'pipx') {
          callback(
            null,
            'package kicad-mcp-pro 0.8.4, installed using Python 3.12.0',
            ''
          );
        } else {
          callback(new Error('missing'), '', 'missing');
        }
      }
    );

    const result = await new McpDetector().detectKicadMcpPro();

    expect(result).toEqual({
      found: true,
      command: 'pipx',
      version: '0.8.4',
      source: 'pipx'
    });
  });

  it('does not use mutable Docker image tags as an install fallback', async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        if (
          command === 'docker' &&
          args[0] === 'image' &&
          args[1] === 'inspect'
        ) {
          callback(
            null,
            JSON.stringify([{ RepoTags: [`kicad-mcp-pro:${'latest'}`] }]),
            ''
          );
        } else if (
          command === 'npx' &&
          args.includes('@modelcontextprotocol/inspector')
        ) {
          callback(null, 'mcp inspector 1.0.0', '');
        } else {
          callback(new Error('missing'), '', 'missing');
        }
      }
    );

    const result = await new McpDetector().detectKicadMcpPro();

    expect(result).toEqual(
      expect.objectContaining({
        found: true,
        command: 'npx',
        source: 'inspector'
      })
    );
  });

  it('detects MCP inspector availability as setup guidance', async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        if (
          command === 'npx' &&
          args.includes('@modelcontextprotocol/inspector')
        ) {
          callback(null, 'mcp inspector 1.0.0', '');
        } else {
          callback(new Error('missing'), '', 'missing');
        }
      }
    );

    const result = await new McpDetector().detectKicadMcpPro();

    expect(result).toEqual(
      expect.objectContaining({
        found: true,
        command: 'npx',
        source: 'inspector'
      })
    );
  });

  it('discovers installer candidates in uvx, pipx, then pip order', async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        if (['uvx', 'pipx', 'pip'].includes(command)) {
          callback(null, `${command} version`, '');
        } else {
          callback(new Error('missing'), '', 'missing');
        }
      }
    );

    const candidates = await new McpDetector().detectInstallers();

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'uvx',
      'pipx',
      'pip'
    ]);
    expect(candidates[0]?.args).toEqual(['tool', 'install', 'kicad-mcp-pro']);
  });

  it('discovers python -m pip as installer fallback', async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        if (command === 'python') {
          callback(null, 'pip 25', '');
        } else {
          callback(new Error('missing'), '', 'missing');
        }
      }
    );

    const candidates = await new McpDetector().detectInstallers();

    expect(candidates).toEqual([
      expect.objectContaining({
        id: 'pip',
        command: 'python',
        args: ['-m', 'pip', 'install', '--user', 'kicad-mcp-pro']
      })
    ]);
  });
});

describe('McpDetector.generateHttpConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-http-'));
    workspace.workspaceFolders = [{ uri: { fsPath: tempDir } }];
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes a tasks.json task and an HTTP mcp.json for uvx installs', async () => {
    (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    const detector = new McpDetector();

    await detector.generateHttpConfig(
      tempDir,
      { found: true, command: 'uvx', version: '0.5.0', source: 'uvx' },
      'full',
      27185
    );

    const tasksPath = path.join(tempDir, '.vscode', 'tasks.json');
    const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8')) as {
      tasks: Array<{ label: string; command: string; args: string[] }>;
    };
    const task = tasks.tasks.find(
      (t) => t.label === 'Start kicad-mcp-pro (HTTP)'
    );
    expect(task).toBeDefined();
    expect(task?.command).toBe('uvx');
    expect(task?.args).toContain('--transport');
    expect(task?.args).toContain('http');
    expect(task?.args).toContain('--port');
    expect(task?.args).toContain('27185');

    const mcpPath = path.join(tempDir, '.vscode', 'mcp.json');
    const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as {
      servers: { kicad: { type: string; url: string } };
    };
    expect(mcp.servers.kicad.type).toBe('http');
    expect(mcp.servers.kicad.url).toBe('http://localhost:27185/mcp');
  });

  it('merges into an existing tasks.json and replaces a stale task', async () => {
    (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    const vscodeDir = path.join(tempDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    const tasksPath = path.join(vscodeDir, 'tasks.json');
    fs.writeFileSync(
      tasksPath,
      JSON.stringify({
        version: '2.0.0',
        tasks: [
          { label: 'Start kicad-mcp-pro (HTTP)', command: 'old', args: [] },
          { label: 'other-task', command: 'other', args: [] }
        ]
      }),
      'utf8'
    );

    await new McpDetector().generateHttpConfig(
      tempDir,
      {
        found: true,
        command: 'kicad-mcp-pro',
        version: '1.0.0',
        source: 'global'
      },
      'pcb_only'
    );

    const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8')) as {
      tasks: Array<{ label: string; command: string }>;
    };
    // stale entry replaced, other-task preserved
    const httpTasks = tasks.tasks.filter(
      (t) => t.label === 'Start kicad-mcp-pro (HTTP)'
    );
    expect(httpTasks).toHaveLength(1);
    expect(httpTasks[0]?.command).toBe('kicad-mcp-pro');
    const otherTask = tasks.tasks.find((t) => t.label === 'other-task');
    expect(otherTask).toBeDefined();
  });

  it('offers to run the task immediately when user clicks "Run Task Now"', async () => {
    const commands = await import('./vscodeMock');
    (window.showInformationMessage as jest.Mock).mockResolvedValue(
      'Run Task Now'
    );

    await new McpDetector().generateHttpConfig(
      tempDir,
      { found: true, command: 'uvx', version: '0.5.0', source: 'uvx' },
      'full'
    );

    expect(commands.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.tasks.runTask',
      'Start kicad-mcp-pro (HTTP)'
    );
  });

  it('recovers from a malformed tasks.json by overwriting it', async () => {
    (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    const vscodeDir = path.join(tempDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(path.join(vscodeDir, 'tasks.json'), 'NOT JSON{{', 'utf8');

    await new McpDetector().generateHttpConfig(
      tempDir,
      {
        found: true,
        command: 'kicad-mcp-pro',
        version: '1.0.0',
        source: 'global'
      },
      'full'
    );

    const tasks = JSON.parse(
      fs.readFileSync(path.join(vscodeDir, 'tasks.json'), 'utf8')
    ) as { tasks: Array<{ label: string }> };
    expect(
      tasks.tasks.some((t) => t.label === 'Start kicad-mcp-pro (HTTP)')
    ).toBe(true);
  });

  it('recovers when tasks field is not an array', async () => {
    (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    const vscodeDir = path.join(tempDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'tasks.json'),
      JSON.stringify({ version: '2.0.0', tasks: 'bad' }),
      'utf8'
    );

    await new McpDetector().generateHttpConfig(
      tempDir,
      {
        found: true,
        command: 'kicad-mcp-pro',
        version: '1.0.0',
        source: 'global'
      },
      'full'
    );

    const tasks = JSON.parse(
      fs.readFileSync(path.join(vscodeDir, 'tasks.json'), 'utf8')
    ) as { tasks: Array<{ label: string }> };
    expect(Array.isArray(tasks.tasks)).toBe(true);
    expect(
      tasks.tasks.some((t) => t.label === 'Start kicad-mcp-pro (HTTP)')
    ).toBe(true);
  });

  it('merges into an existing mcp.json preserving other servers', async () => {
    (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    const vscodeDir = path.join(tempDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'mcp.json'),
      JSON.stringify({
        servers: { other: { type: 'stdio', command: 'other' } }
      }),
      'utf8'
    );

    await new McpDetector().generateHttpConfig(
      tempDir,
      { found: true, command: 'uvx', version: '0.5.0', source: 'uvx' },
      'full'
    );

    const mcp = JSON.parse(
      fs.readFileSync(path.join(vscodeDir, 'mcp.json'), 'utf8')
    ) as { servers: Record<string, unknown> };
    expect(mcp.servers['other']).toBeDefined();
    expect((mcp.servers['kicad'] as { type: string })?.type).toBe('http');
  });

  it('buildHttpTaskArgs returns global binary args for pip installs', () => {
    const detector = new McpDetector();
    const { command, args } = detector.buildHttpTaskArgs(
      {
        found: true,
        command: 'kicad-mcp-pro',
        version: '1.0.0',
        source: 'pip'
      },
      'full',
      27185,
      tempDir
    );
    expect(command).toBe('kicad-mcp-pro');
    expect(args).toContain('--transport');
    expect(args).toContain('http');
  });
});
