import * as vscode from 'vscode';
import { COMMANDS, SETTINGS } from '../../src/constants';
import { KiCadSettingsPanel } from '../../src/settings/settingsPanel';
import { buildSettingsHtml } from '../../src/settings/settingsHtml';
import { createExtensionContextMock } from './vscodeMock';

function createPanelMock() {
  let messageHandler: ((message: unknown) => void) | undefined;
  let disposeHandler: (() => void) | undefined;
  const webview = {
    html: '',
    cspSource: 'vscode-resource:',
    postMessage: jest.fn().mockResolvedValue(true),
    onDidReceiveMessage: jest.fn((callback: (message: unknown) => void) => {
      messageHandler = callback;
      return { dispose: jest.fn() };
    }),
    asWebviewUri: jest.fn((value) => value)
  };
  const panel = {
    webview,
    reveal: jest.fn(),
    dispose: jest.fn(() => disposeHandler?.()),
    onDidDispose: jest.fn((callback: () => void) => {
      disposeHandler = callback;
      return { dispose: jest.fn() };
    })
  };
  return {
    panel,
    send: async (message: unknown) => messageHandler?.(message)
  };
}

function createServices() {
  const cli = {
    path: 'C:/KiCad/bin/kicad-cli.exe',
    version: '10.0.0',
    versionLabel: 'KiCad 10.0.0',
    source: 'settings' as const
  };
  return {
    cliDetector: { detect: jest.fn(async () => cli) },
    statusBar: {
      update: jest.fn(),
      getSnapshot: jest.fn(() => ({
        cli: undefined,
        drc: undefined,
        erc: undefined,
        aiConfigured: false,
        aiHealthy: undefined,
        mcpAvailable: false,
        mcpConnected: false,
        mcpKind: 'Disconnected',
        mcpCompat: undefined,
        mcpVersion: undefined,
        mcpProfile: undefined
      }))
    },
    aiProviders: {
      getSelection: jest.fn(() => ({
        provider: 'claude',
        model: '',
        openAIApiMode: 'responses'
      })),
      hasApiKey: jest.fn(async () => true),
      clearApiKey: jest.fn(async () => undefined)
    },
    setAiHealthy: jest.fn(),
    mcpToolsProvider: {
      broStatus: {
        installed: true,
        version: '1.37.0',
        healthy: true,
        message: 'BoardReadyOps is healthy.',
        tools: ['bom.missing-mpn']
      },
      refresh: jest.fn(),
      onDidChangeTreeData: jest.fn(() => ({ dispose: jest.fn() }))
    },
    viewerState: {
      getDiagnosticBundleSnapshot: jest.fn(() => ({
        viewers: [
          {
            uri: 'file:///workspace/board.kicad_pcb',
            status: 'ready',
            error: undefined,
            project: undefined,
            state: {
              zoom: 1,
              grid: true,
              theme: 'kicad',
              engine: {
                kind: 'kicanvas',
                label: 'KiCanvas',
                capabilities: {
                  interactive: true,
                  fit: true,
                  zoom: true,
                  exportPng: true,
                  exportSvg: true,
                  selection: true,
                  layers: true
                }
              }
            }
          }
        ]
      })),
      onDidChange: jest.fn(() => ({ dispose: jest.fn() }))
    },
    logger: { error: jest.fn() }
  };
}

describe('settings webview', () => {
  afterEach(() => {
    (
      (KiCadSettingsPanel as any).instance as KiCadSettingsPanel | undefined
    )?.dispose();
    jest.restoreAllMocks();
  });

  it('builds strict CSP settings HTML without inline handlers', () => {
    const html = buildSettingsHtml({
      webview: { cspSource: 'vscode-resource:' } as vscode.Webview,
      state: {
        settings: { [SETTINGS.aiProvider]: 'claude' },
        aiKeyStored: true,
        octopartKeyStored: false
      }
    });

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("style-src 'nonce-");
    expect(html).toContain("script-src 'nonce-");
    expect(html).not.toContain("'unsafe-inline'");
    expect(html).not.toContain('https://cdn');
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).toContain('id="open-native-settings"');
    expect(html).toContain('id="cli-health"');
    expect(html).toContain('id="ai-health"');
    expect(html).toContain('id="mcp-health"');
    expect(html).toContain('id="boardreadyops-health"');
    expect(html).toContain('id="viewer-health"');
    expect(html).not.toContain('data-setting=');
    expect(html).toContain("type: 'requestApiKeyStatus'");
  });

  it('embeds the canonical MCP integration documentation URL (#488)', () => {
    const html = buildSettingsHtml({
      webview: { cspSource: 'vscode-resource:' } as vscode.Webview,
      state: {
        settings: {},
        aiKeyStored: false,
        octopartKeyStored: false
      }
    });

    expect(html).toContain(
      'https://github.com/oaslananka/kicad-studio-kit/blob/main/apps/vscode-extension/docs/INTEGRATION.md'
    );
    expect(html).not.toContain(
      'https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/INTEGRATION.md'
    );
  });

  it('refreshes capability health when BoardReadyOps or viewer state changes', async () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    const services = createServices();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );

    KiCadSettingsPanel.createOrShow(context as never, services as never);
    panelMock.panel.webview.postMessage.mockClear();

    const boardReadyOpsChanged = (
      services.mcpToolsProvider.onDidChangeTreeData as jest.Mock
    ).mock.calls[0]?.[0] as (() => void) | undefined;
    const viewerChanged = (services.viewerState.onDidChange as jest.Mock).mock
      .calls[0]?.[0] as (() => void) | undefined;

    expect(boardReadyOpsChanged).toBeDefined();
    expect(viewerChanged).toBeDefined();

    boardReadyOpsChanged?.();
    viewerChanged?.();
    await new Promise((resolve) => setImmediate(resolve));

    expect(panelMock.panel.webview.postMessage).toHaveBeenCalledTimes(2);
    expect(panelMock.panel.webview.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'state' })
    );
    expect(panelMock.panel.webview.postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'state' })
    );
  });

  it('derives viewer health states and redacts BoardReadyOps diagnostics', () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    const services = createServices();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );

    services.mcpToolsProvider.broStatus.message = 'token=super-secret';
    services.viewerState.getDiagnosticBundleSnapshot.mockReturnValue({
      viewers: [
        { uri: 'file:///workspace/loading.kicad_pcb', status: 'loading' },
        { uri: 'file:///workspace/idle.kicad_sch', status: 'idle' }
      ]
    } as never);
    const instance = KiCadSettingsPanel.createOrShow(
      context as never,
      services as never
    );
    const loadingState = (instance as any).collectState();
    expect(loadingState.viewer).toEqual({
      status: 'loading',
      error: undefined,
      engines: [],
      openCount: 2
    });
    expect(loadingState.boardReadyOps.message).not.toContain('super-secret');

    services.viewerState.getDiagnosticBundleSnapshot.mockReturnValue({
      viewers: [
        {
          uri: 'file:///workspace/error.kicad_pcb',
          status: 'error',
          error: 'viewer failed'
        },
        { uri: 'file:///workspace/ready.kicad_pcb', status: 'ready' }
      ]
    } as never);
    expect((instance as any).collectState().viewer).toEqual({
      status: 'error',
      error: 'viewer failed',
      engines: [],
      openCount: 2
    });

    services.mcpToolsProvider.broStatus.message = undefined as never;
    services.viewerState.getDiagnosticBundleSnapshot.mockReturnValue({
      viewers: []
    } as never);
    const idleState = (instance as any).collectState();
    expect(idleState.viewer).toEqual({
      status: 'idle',
      error: undefined,
      engines: [],
      openCount: 0
    });
    expect(idleState.boardReadyOps.message).toBeUndefined();
  });

  it('handles native-settings navigation, API key actions, CLI detection, and allowed external links', async () => {
    const context = createExtensionContextMock();
    const panelMock = createPanelMock();
    const services = createServices();
    const configUpdate = jest.fn();
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: jest.fn((key: string) =>
        key === SETTINGS.aiProvider ? 'claude' : undefined
      ),
      update: configUpdate,
      inspect: jest.fn()
    } as never);
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(
      panelMock.panel
    );

    KiCadSettingsPanel.createOrShow(context as never, services as never);

    await panelMock.send({ type: 'openNativeSettings' });
    await panelMock.send({ type: 'setAiKey' });
    await panelMock.send({ type: 'clearAiKey' });
    await panelMock.send({ type: 'testAiKey' });
    await panelMock.send({ type: 'detectCli' });
    await panelMock.send({ type: 'refreshBoardReadyOps' });
    await panelMock.send({ type: 'runBoardReadyOpsCheck' });
    await panelMock.send({ type: 'openBoardReadyOpsDocs' });
    await panelMock.send({
      type: 'openExternalLink',
      href: 'https://github.com/oaslananka/kicad-studio-kit/blob/main/apps/vscode-extension/docs/INTEGRATION.md'
    });
    await panelMock.send({ type: 'clearAllSecrets' });

    expect(configUpdate).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      '@ext:oaslananka.kicadstudiokit'
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      COMMANDS.setAiApiKey
    );
    expect(services.aiProviders.clearApiKey).toHaveBeenCalledWith('claude');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      COMMANDS.testAiConnection
    );
    expect(services.cliDetector.detect).toHaveBeenCalledWith(true);
    expect(services.statusBar.update).toHaveBeenCalledWith({
      cli: expect.objectContaining({ versionLabel: 'KiCad 10.0.0' })
    });
    expect(services.mcpToolsProvider.refresh).toHaveBeenCalled();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      COMMANDS.boardReadyOpsCheck
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      COMMANDS.boardReadyOpsOpenDocs
    );
    const openedDocumentationUrl = (
      vscode.env.openExternal as jest.Mock
    ).mock.calls.at(-1)?.[0] as vscode.Uri | undefined;
    expect(openedDocumentationUrl?.toString()).toBe(
      'https://github.com/oaslananka/kicad-studio-kit/blob/main/apps/vscode-extension/docs/INTEGRATION.md'
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      COMMANDS.clearSecrets
    );
  });
});
