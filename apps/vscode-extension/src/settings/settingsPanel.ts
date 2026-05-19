import * as vscode from 'vscode';
import {
  AI_SECRET_KEY_LEGACY,
  COMMANDS,
  OCTOPART_SECRET_KEY,
  SETTINGS
} from '../constants';
import { asRecord, asString, hasType } from '../utils/webviewMessages';
import { isAiSecretProvider } from '../utils/secrets';
import { requireWorkspaceTrust } from '../utils/workspaceTrust';
import type { CommandServices } from '../commands/types';
import { buildSettingsHtml, type SettingsViewState } from './settingsHtml';

const SETTINGS_PANEL_MESSAGE_TYPES = [
  'ready',
  'updateSetting',
  'setAiKey',
  'clearAiKey',
  'testAiKey',
  'detectCli',
  'openExternalLink',
  'requestApiKeyStatus',
  'clearAllSecrets'
];

const SETTINGS_KEYS = [
  SETTINGS.cliPath,
  SETTINGS.kicadPath,
  SETTINGS.viewerTheme,
  SETTINGS.viewerAutoRefresh,
  SETTINGS.viewerLargeFileThresholdBytes,
  SETTINGS.viewerSyncTheme,
  SETTINGS.viewerEnableLayerPanel,
  SETTINGS.viewerEnableSnapshotExport,
  SETTINGS.aiProvider,
  SETTINGS.aiModel,
  SETTINGS.aiOpenAIApiMode,
  SETTINGS.aiGeminiApiMode,
  SETTINGS.aiMaxTokens,
  SETTINGS.aiStreamingEnabled,
  SETTINGS.aiTimeout,
  SETTINGS.aiLanguage,
  SETTINGS.aiAllowTools,
  SETTINGS.mcpAutoDetect,
  SETTINGS.mcpEndpoint,
  SETTINGS.mcpAllowLegacySse,
  SETTINGS.mcpTimeout,
  SETTINGS.mcpPushContext,
  SETTINGS.mcpProfile
] as const;

export class KiCadSettingsPanel implements vscode.Disposable {
  public static readonly viewType = 'kicadstudio.settings';
  private static instance: KiCadSettingsPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  static createOrShow(
    context: vscode.ExtensionContext,
    services: CommandServices
  ): KiCadSettingsPanel {
    if (KiCadSettingsPanel.instance) {
      KiCadSettingsPanel.instance.panel.reveal(vscode.ViewColumn.Active);
      void KiCadSettingsPanel.instance.postState();
      return KiCadSettingsPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      KiCadSettingsPanel.viewType,
      'KiCad Studio Settings',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const instance = new KiCadSettingsPanel(context, panel, services);
    KiCadSettingsPanel.instance = instance;
    context.subscriptions.push(instance);
    return instance;
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private readonly services: CommandServices
  ) {
    this.panel.webview.html = buildSettingsHtml({
      webview: this.panel.webview,
      state: this.collectState()
    });
    this.disposables.push(
      this.panel.onDidDispose(() => this.handleDisposed()),
      this.panel.webview.onDidReceiveMessage(
        (message: unknown) => void this.handleMessage(message)
      ),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (SETTINGS_KEYS.some((key) => event.affectsConfiguration(key))) {
          void this.postState();
        }
      })
    );
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!hasType(message, SETTINGS_PANEL_MESSAGE_TYPES)) {
      return;
    }

    const record = asRecord(message) ?? {};
    if (message.type === 'ready' || message.type === 'requestApiKeyStatus') {
      await this.postState();
      return;
    }

    if (message.type === 'updateSetting') {
      await this.updateSetting(asString(record['key']), record['value']);
      return;
    }

    if (message.type === 'setAiKey') {
      await vscode.commands.executeCommand(COMMANDS.setAiApiKey);
      await this.postState('AI API key status refreshed.');
      return;
    }

    if (message.type === 'clearAiKey') {
      const provider = this.services.aiProviders.getSelection().provider;
      if (isAiSecretProvider(provider)) {
        await this.services.aiProviders.clearApiKey(provider);
      } else {
        await this.context.secrets.delete(AI_SECRET_KEY_LEGACY);
      }
      this.services.setAiHealthy(undefined);
      this.services.statusBar.update({
        aiConfigured: false,
        aiHealthy: undefined
      });
      await this.postState('AI API key cleared.');
      return;
    }

    if (message.type === 'testAiKey') {
      await vscode.commands.executeCommand(COMMANDS.testAiConnection);
      await this.postState('AI connection test finished.');
      return;
    }

    if (message.type === 'detectCli') {
      if (!(await requireWorkspaceTrust('Detect kicad-cli'))) {
        return;
      }
      const cli = await this.services.cliDetector.detect(true);
      this.services.statusBar.update({ cli });
      await this.postState(
        cli ? 'kicad-cli detected.' : 'kicad-cli was not found.'
      );
      return;
    }

    if (message.type === 'openExternalLink') {
      const href = asString(record['href']);
      if (href && this.isAllowedExternalLink(href)) {
        await vscode.env.openExternal(vscode.Uri.parse(href));
      }
      return;
    }

    if (message.type === 'clearAllSecrets') {
      await vscode.commands.executeCommand(COMMANDS.clearSecrets);
      this.services.setAiHealthy(undefined);
      this.services.statusBar.update({
        aiConfigured: false,
        aiHealthy: undefined
      });
      await this.postState('Stored KiCad Studio secrets cleared.');
    }
  }

  private async updateSetting(
    key: string | undefined,
    value: unknown
  ): Promise<void> {
    if (!key || !this.isAllowedSetting(key)) {
      await this.postStatus('Setting update was ignored.');
      return;
    }

    await vscode.workspace
      .getConfiguration()
      .update(
        key,
        this.normalizeSettingValue(key, value),
        vscode.ConfigurationTarget.Global
      );
    await this.postStatus('Setting saved.');
  }

  private normalizeSettingValue(key: string, value: unknown): unknown {
    if (
      key === SETTINGS.aiAllowTools ||
      key === SETTINGS.aiStreamingEnabled ||
      key === SETTINGS.mcpAutoDetect ||
      key === SETTINGS.mcpAllowLegacySse ||
      key === SETTINGS.mcpPushContext ||
      key === SETTINGS.viewerAutoRefresh ||
      key === SETTINGS.viewerSyncTheme ||
      key === SETTINGS.viewerEnableLayerPanel ||
      key === SETTINGS.viewerEnableSnapshotExport
    ) {
      return value === true;
    }
    if (
      key === SETTINGS.viewerLargeFileThresholdBytes ||
      key === SETTINGS.aiMaxTokens ||
      key === SETTINGS.aiTimeout ||
      key === SETTINGS.mcpTimeout
    ) {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }
    return typeof value === 'string' ? value.trim() : value;
  }

  private isAllowedSetting(key: string): boolean {
    return (SETTINGS_KEYS as readonly string[]).includes(key);
  }

  private isAllowedExternalLink(href: string): boolean {
    return (
      href.startsWith('https://github.com/oaslananka/kicad-studio-kit/') ||
      href.startsWith('https://www.kicad.org/')
    );
  }

  private collectState(): SettingsViewState {
    const config = vscode.workspace.getConfiguration();
    const settings = Object.fromEntries(
      SETTINGS_KEYS.map((key) => [key, config.get(key)])
    );
    const snapshot = this.services.statusBar.getSnapshot();
    const state: SettingsViewState = {
      settings,
      aiKeyStored: false,
      octopartKeyStored: false
    };
    if (snapshot.cli) {
      state.cli = {
        path: snapshot.cli.path,
        versionLabel: snapshot.cli.versionLabel,
        source: snapshot.cli.source
      };
    }
    return state;
  }

  private async collectAsyncState(): Promise<SettingsViewState> {
    const provider = this.services.aiProviders.getSelection().provider;
    const aiKeyStored = isAiSecretProvider(provider)
      ? await this.services.aiProviders.hasApiKey(provider)
      : false;
    return {
      ...this.collectState(),
      aiKeyStored,
      octopartKeyStored: !!(await this.context.secrets.get(OCTOPART_SECRET_KEY))
    };
  }

  private async postState(status?: string): Promise<void> {
    if (this.disposed) {
      return;
    }
    await this.panel.webview.postMessage({
      type: 'state',
      state: await this.collectAsyncState()
    });
    if (status) {
      await this.postStatus(status);
    }
  }

  private async postStatus(text: string): Promise<void> {
    await this.panel.webview.postMessage({ type: 'status', text });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.handleDisposed();
    this.panel.dispose();
  }

  private handleDisposed(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.disposables.forEach((disposable) => disposable.dispose());
    KiCadSettingsPanel.instance = undefined;
  }
}
