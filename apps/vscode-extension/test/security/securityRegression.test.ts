jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KiCadCliRunner } from '../../src/cli/kicadCliRunner';
import { registerSecretCommands } from '../../src/commands/secretCommands';
import { COMMANDS, OCTOPART_SECRET_KEY, SETTINGS } from '../../src/constants';
import { McpClient } from '../../src/mcp/mcpClient';
import { createKiCanvasViewerHtml } from '../../src/providers/viewerHtml';
import { resolveWorkspaceOutputDir } from '../../src/utils/pathUtils';
import {
  __setConfiguration,
  commands,
  createExtensionContextMock,
  window,
  workspace
} from '../unit/vscodeMock';

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

function createChildProcessMock(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

const extensionRoot = fs.existsSync(
  path.join(process.cwd(), 'apps', 'vscode-extension', 'package.json')
)
  ? path.join(process.cwd(), 'apps', 'vscode-extension')
  : process.cwd();

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(extensionRoot, relativePath), 'utf8')
  ) as T;
}

describe('OASLANA-45 security regression gates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
    __setConfiguration({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    workspace.isTrusted = true;
  });

  const originalFetch = global.fetch;

  it('declares limited Workspace Trust and restricts settings that can drive execution, files, or endpoints', () => {
    const manifest = readJson<{
      capabilities?: {
        untrustedWorkspaces?: {
          supported?: unknown;
          restrictedConfigurations?: string[];
        };
      };
    }>('package.json');

    const untrusted = manifest.capabilities?.untrustedWorkspaces;
    expect(untrusted?.supported).toBe('limited');
    expect(untrusted?.restrictedConfigurations).toEqual(
      expect.arrayContaining([
        SETTINGS.cliPath,
        SETTINGS.kicadPath,
        SETTINGS.outputDir,
        SETTINGS.cliDefineVars,
        SETTINGS.mcpEndpoint,
        SETTINGS.mcpAllowRemoteEndpoint,
        SETTINGS.mcpAllowLegacySse,
        SETTINGS.pcmRepositoryUrls,
        SETTINGS.pcmConfigDir,
        SETTINGS.pcmThirdPartyDir
      ])
    );
  });

  it('keeps webview CSPs local and rejects remote script execution primitives', () => {
    const generatedHtml = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });
    const htmlFiles = [
      generatedHtml,
      ...[
        'media/viewer/bom.html',
        'media/viewer/diff.html',
        'media/viewer/netlist.html',
        'media/viewer/pcb.html',
        'media/viewer/schematic.html'
      ].map((filePath) =>
        fs.readFileSync(path.join(extensionRoot, filePath), 'utf8')
      )
    ];

    for (const html of htmlFiles) {
      expect(html).toContain("default-src 'none'");
      expect(html).not.toMatch(
        /script-src[^">]*(?:https?:|unsafe-inline|unsafe-eval)/i
      );
      expect(html).toContain('nonce-');
    }
  });

  it('keeps viewer message handlers behind an allowlist and payload-specific parsers', () => {
    const providerSource = fs.readFileSync(
      path.join(extensionRoot, 'src/providers/baseKiCanvasEditorProvider.ts'),
      'utf8'
    );

    expect(providerSource).toContain(
      'if (!hasType(message, VIEWER_OUTBOUND_MESSAGE_TYPES))'
    );
    expect(providerSource).toContain('readViewerState(message.payload)');
    expect(providerSource).toContain('readViewerSelection(message.payload)');
    expect(providerSource).toContain('parsePngDataUrl(dataUrl)');
    expect(providerSource).toContain('PNG_SIGNATURE');
    expect(providerSource).toContain('MAX_PNG_EXPORT_BYTES');
  });

  it('rejects output directories that escape the workspace through traversal, absolute paths, or symlinks', () => {
    const workspaceFile = path.join(process.cwd(), 'package.json');
    const externalDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-security-outside-')
    );
    const link = path.join(process.cwd(), '.tmp-oaslana45-outside-link');

    try {
      expect(() => resolveWorkspaceOutputDir(workspaceFile, '..')).toThrow(
        'Output directory must stay inside the workspace'
      );
      expect(() =>
        resolveWorkspaceOutputDir(workspaceFile, externalDir)
      ).toThrow('Output directory must stay inside the workspace');

      try {
        fs.symlinkSync(
          externalDir,
          link,
          process.platform === 'win32' ? 'junction' : 'dir'
        );
        expect(() =>
          resolveWorkspaceOutputDir(workspaceFile, path.basename(link))
        ).toThrow('Output directory must stay inside the workspace');
      } catch {
        // Symlink creation is not always permitted on developer machines.
      }
    } finally {
      fs.rmSync(link, { recursive: true, force: true });
      fs.rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it('runs shell-looking project paths as argv entries without enabling a shell', async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-security path ; touch blocked-')
    );
    const boardFile = path.join(projectRoot, 'board;rm -rf nope.kicad_pcb');
    fs.writeFileSync(boardFile, '', 'utf8');
    __setConfiguration({});
    const detector = {
      detect: jest.fn().mockResolvedValue({
        path: '/usr/bin/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      })
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementation(
      (_command: string, _args: string[], options: { shell?: boolean }) => {
        const child = createChildProcessMock();
        expect(options.shell).not.toBe(true);
        queueMicrotask(() => {
          child.stdout.emit('data', Buffer.from('ok'));
          child.emit('close', 0);
        });
        return child;
      }
    );

    try {
      const runner = new KiCadCliRunner(detector as never, logger as never);
      await expect(
        runner.run({
          command: ['pcb', 'drc', boardFile],
          cwd: projectRoot,
          progressTitle: 'DRC'
        })
      ).resolves.toEqual(expect.objectContaining({ exitCode: 0 }));

      expect(spawnMock.mock.calls[0]?.[1]).toEqual(
        expect.arrayContaining([boardFile])
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects remote MCP endpoints by default and does not send network traffic', async () => {
    __setConfiguration({
      [SETTINGS.mcpEndpoint]: 'https://mcp.example.com',
      [SETTINGS.mcpAllowRemoteEndpoint]: false,
      [SETTINGS.mcpAllowLegacySse]: false,
      [SETTINGS.mcpPushContext]: true
    });
    global.fetch = jest.fn() as typeof fetch;
    const client = new McpClient(
      createExtensionContextMock() as never,
      {
        detectKicadMcpPro: jest
          .fn()
          .mockResolvedValue({ found: true, source: 'uvx' })
      } as never,
      {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      } as never
    );

    await expect(client.testConnection()).rejects.toThrow(
      'Refusing remote MCP endpoint'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never prints plaintext stored secrets in the disclosure command', async () => {
    const context = createExtensionContextMock();
    await context.secrets.store(OCTOPART_SECRET_KEY, 'octopart-secret-value');
    const services = {
      context,
      aiProviders: {
        getApiKey: jest
          .fn()
          .mockImplementation(async (provider: string) =>
            provider === 'openai' ? 'sk-secret-openai-token' : undefined
          ),
        clearApiKey: jest.fn(),
        clearAllApiKeys: jest.fn(),
        setApiKey: jest.fn()
      }
    };

    registerSecretCommands(services as never);
    const handler = (commands.registerCommand as jest.Mock).mock.calls.find(
      ([command]) => command === COMMANDS.showStoredSecrets
    )?.[1] as () => Promise<void>;
    await handler();

    const rendered = (window.showInformationMessage as jest.Mock).mock.calls
      .flat()
      .join('\n');
    expect(rendered).toContain('OpenAI (sk-s...oken)');
    expect(rendered).toContain('Octopart/Nexar key');
    expect(rendered).not.toContain('sk-secret-openai-token');
    expect(rendered).not.toContain('octopart-secret-value');
  });
});
