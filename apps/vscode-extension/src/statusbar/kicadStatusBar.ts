import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type {
  DetectedKiCadCli,
  DiagnosticSummary,
  McpConnectionState,
  McpCompatStatus,
  McpConnectionKind
} from '../types';

export class KiCadStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly mcpItem: vscode.StatusBarItem;
  private cli: DetectedKiCadCli | undefined;
  private drc: DiagnosticSummary | undefined;
  private erc: DiagnosticSummary | undefined;
  private aiConfigured = false;
  private aiHealthy: boolean | undefined;
  private mcpAvailable = false;
  private mcpConnected = false;
  private mcpKind: McpConnectionKind = 'Disconnected';
  private mcpCompat: McpCompatStatus | undefined;
  private mcpVersion: string | undefined;
  private mcpMessage: string | undefined;
  private mcpProfile: string | undefined;

  constructor(_context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = {
      command: COMMANDS.showStatusMenu,
      title: 'KiCad Studio'
    };
    this.item.show();
    this.mcpItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      95
    );
    this.mcpItem.command = {
      command: COMMANDS.setupMcpIntegration,
      title: 'KiCad Studio MCP'
    };
    this.mcpItem.show();
    this.render();
  }

  update(update: {
    cli?: DetectedKiCadCli | undefined;
    drc?: DiagnosticSummary | undefined;
    erc?: DiagnosticSummary | undefined;
    aiConfigured?: boolean;
    aiHealthy?: boolean | undefined;
    mcpAvailable?: boolean;
    mcpConnected?: boolean;
    mcpState?: McpConnectionState | undefined;
    mcpProfile?: string | undefined;
  }): void {
    this.cli = update.cli ?? this.cli;
    this.drc = update.drc ?? this.drc;
    this.erc = update.erc ?? this.erc;
    this.aiConfigured = update.aiConfigured ?? this.aiConfigured;
    this.aiHealthy = update.aiHealthy ?? this.aiHealthy;
    this.mcpAvailable = update.mcpAvailable ?? this.mcpAvailable;
    this.mcpConnected = update.mcpConnected ?? this.mcpConnected;
    if (update.mcpState) {
      this.mcpAvailable = update.mcpState.available;
      this.mcpConnected = update.mcpState.connected;
      this.mcpKind = update.mcpState.kind;
      this.mcpCompat = update.mcpState.server?.compat;
      this.mcpVersion = update.mcpState.server?.version;
      this.mcpMessage = update.mcpState.message;
    }
    this.mcpProfile = update.mcpProfile ?? this.mcpProfile;
    this.render();
  }

  getSnapshot(): {
    cli: DetectedKiCadCli | undefined;
    drc: DiagnosticSummary | undefined;
    erc: DiagnosticSummary | undefined;
    aiConfigured: boolean;
    aiHealthy: boolean | undefined;
    mcpAvailable: boolean;
    mcpConnected: boolean;
    mcpKind: McpConnectionKind;
    mcpCompat: McpCompatStatus | undefined;
    mcpVersion: string | undefined;
    mcpProfile: string | undefined;
  } {
    return {
      cli: this.cli,
      drc: this.drc,
      erc: this.erc,
      aiConfigured: this.aiConfigured,
      aiHealthy: this.aiHealthy,
      mcpAvailable: this.mcpAvailable,
      mcpConnected: this.mcpConnected,
      mcpKind: this.mcpKind,
      mcpCompat: this.mcpCompat,
      mcpVersion: this.mcpVersion,
      mcpProfile: this.mcpProfile
    };
  }

  dispose(): void {
    this.item.dispose();
    this.mcpItem.dispose();
  }

  private render(): void {
    if (!this.cli) {
      this.item.text = '$(warning) KiCad: Not found  DRC: —  ERC: —';
      this.item.tooltip = 'kicad-cli not found. Click to configure.';
      this.renderMcp();
      return;
    }

    const drcText = this.drc
      ? this.drc.errors > 0
        ? `$(error) DRC: ${this.drc.errors}`
        : this.drc.warnings > 0
          ? `$(warning) DRC: ${this.drc.warnings}`
          : '$(pass) DRC'
      : 'DRC: —';
    const ercText = this.erc
      ? this.erc.errors > 0
        ? `$(error) ERC: ${this.erc.errors}`
        : this.erc.warnings > 0
          ? `$(warning) ERC: ${this.erc.warnings}`
          : '$(pass) ERC'
      : 'ERC: —';
    const aiText = !this.aiConfigured
      ? '$(circle-outline) AI'
      : this.aiHealthy === false
        ? '$(warning) AI'
        : '$(pass-filled) AI';

    this.item.text = `$(circuit-board) ${this.cli.versionLabel}  ${drcText}  ${ercText}  ${aiText}`;
    this.item.tooltip = `CLI: ${this.cli.path}\nAI: ${
      !this.aiConfigured
        ? 'not configured'
        : this.aiHealthy === false
          ? 'configured, last check failed'
          : 'configured'
    }`;
    this.renderMcp();
  }

  private renderMcp(): void {
    const profile = this.mcpProfile ? ` ${this.mcpProfile}` : '';
    if (this.mcpKind === 'Incompatible') {
      this.mcpItem.text = '$(warning) MCP Incompatible';
      this.mcpItem.tooltip = `Incompatible: server ${this.mcpVersion ?? '0.0.0'} is outside the supported range.`;
      this.mcpItem.command = {
        command: COMMANDS.openMcpUpgradeGuide,
        title: 'Open MCP Upgrade Guide'
      };
      return;
    }
    if (this.mcpKind === 'VsCodeStdio') {
      this.mcpItem.text = `$(plug) MCP${profile}`;
      this.mcpItem.tooltip =
        'Connected via VS Code stdio (.vscode/mcp.json). ' +
        'kicad-mcp-pro is managed by VS Code Copilot — HTTP endpoint not required.';
      this.mcpItem.command = {
        command: COMMANDS.pickMcpProfile,
        title: 'Pick MCP Profile'
      };
      return;
    }
    if (this.mcpConnected) {
      this.mcpItem.text = `$(plug) MCP${profile}`;
      this.mcpItem.tooltip =
        this.mcpCompat === 'warn'
          ? `Connected (older than recommended): server ${this.mcpVersion ?? 'unknown'} is supported but below the recommended version.`
          : `Connected (recommended): server ${this.mcpVersion ?? 'unknown'} is reachable.`;
      this.mcpItem.command = {
        command: COMMANDS.pickMcpProfile,
        title: 'Pick MCP Profile'
      };
      return;
    }
    if (this.mcpAvailable) {
      this.mcpItem.text = '$(plug) MCP Disconnected';
      this.mcpItem.tooltip =
        this.mcpMessage ??
        'kicad-mcp-pro was detected locally but is not connected. Click to retry.';
      this.mcpItem.command = {
        command: COMMANDS.retryMcp,
        title: 'Retry MCP Connection'
      };
      return;
    }
    this.mcpItem.text = '$(plug) MCP Setup';
    this.mcpItem.tooltip =
      'kicad-mcp-pro was not detected yet. Click for setup guidance.';
    this.mcpItem.command = {
      command: COMMANDS.installMcp,
      title: 'Install kicad-mcp-pro'
    };
  }
}
