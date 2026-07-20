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
    expect(html).toContain('data-setting="kicadstudio.ai.provider"');
    expect(html).toContain('<option value="copilot">GitHub Copilot</option>');
    expect(html).not.toContain('<option value="codex">');
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

  it('handles setting updates, API key actions, CLI detection, and allowed external links', async () => {
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

    await panelMock.send({
      type: 'updateSetting',
      key: SETTINGS.aiProvider,
      value: 'openai'
    });
    await panelMock.send({ type: 'setAiKey' });
    await panelMock.send({ type: 'clearAiKey' });
    await panelMock.send({ type: 'testAiKey' });
    await panelMock.send({ type: 'detectCli' });
    await panelMock.send({
      type: 'openExternalLink',
      href: 'https://github.com/oaslananka/kicad-studio-kit/blob/main/apps/vscode-extension/docs/INTEGRATION.md'
    });
    await panelMock.send({ type: 'clearAllSecrets' });

    expect(configUpdate).toHaveBeenCalledWith(
      SETTINGS.aiProvider,
      'openai',
      vscode.ConfigurationTarget.Global
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
