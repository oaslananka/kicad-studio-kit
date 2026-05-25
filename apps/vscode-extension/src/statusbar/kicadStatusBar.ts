import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type {
  DetectedKiCadCli,
  DiagnosticSummary,
  McpConnectionState,
  McpCompatStatus,
  McpConnectionKind
} from '../types';

// Priority decreases left-to-right within Left-aligned items.
// Higher number = further left.
const P = {
  project: 510,
  kicad: 500,
  drc: 490,
  erc: 480,
  sep1: 475, // separator between validation and AI/MCP group
  ai: 470,
  mcp: 460,
  sep2: 455, // separator before variant
  variant: 450
} as const;

export class KiCadStatusBar implements vscode.Disposable {
  private readonly projectItem: vscode.StatusBarItem;
  private readonly kicadItem: vscode.StatusBarItem;
  private readonly drcItem: vscode.StatusBarItem;
  private readonly ercItem: vscode.StatusBarItem;
  private readonly sep1Item: vscode.StatusBarItem;
  private readonly aiItem: vscode.StatusBarItem;
  private readonly mcpItem: vscode.StatusBarItem;
  private readonly sep2Item: vscode.StatusBarItem;
  private readonly variantItem: vscode.StatusBarItem;

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
  private activeProjectName: string | undefined;
  private activeVariant: string | undefined;

  constructor(_context: vscode.ExtensionContext) {
    this.projectItem = this.make(
      P.project,
      COMMANDS.selectActiveProject,
      'Select Active KiCad Project'
    );
    this.kicadItem = this.make(
      P.kicad,
      COMMANDS.showStatusMenu,
      'KiCad Studio'
    );
    this.drcItem = this.make(P.drc, COMMANDS.runDRC, 'Run DRC');
    this.ercItem = this.make(P.erc, COMMANDS.runERC, 'Run ERC');
    this.sep1Item = this.makeSeparator(P.sep1);
    this.aiItem = this.make(P.ai, COMMANDS.openAiChat, 'Open AI Chat');
    this.mcpItem = this.make(P.mcp, COMMANDS.setupMcpIntegration, 'KiCad MCP');
    this.sep2Item = this.makeSeparator(P.sep2);
    this.variantItem = this.make(
      P.variant,
      COMMANDS.setActiveVariant,
      'Switch Variant'
    );

    this.sep1Item.show();
    // sep2 is hidden until a variant is active (renderVariant controls it)
    for (const item of this.allItems()) {
      item.show();
    }
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
    activeProjectName?: string | undefined;
    activeVariant?: string | undefined;
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
    this.activeProjectName =
      'activeProjectName' in update
        ? update.activeProjectName
        : this.activeProjectName;
    this.activeVariant = update.activeVariant ?? this.activeVariant;
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
    activeProjectName: string | undefined;
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
      mcpProfile: this.mcpProfile,
      activeProjectName: this.activeProjectName
    };
  }

  dispose(): void {
    for (const item of this.allItems()) {
      item.dispose();
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  private render(): void {
    this.renderProject();
    this.renderKicad();
    this.renderDrc();
    this.renderErc();
    this.renderValidationSeparator();
    this.renderAi();
    this.renderMcp();
    this.renderVariant();
  }

  private renderProject(): void {
    if (!this.activeProjectName) {
      this.projectItem.hide();
      this.projectItem.backgroundColor = undefined;
      return;
    }
    this.projectItem.show();
    this.projectItem.text = `$(repo) ${this.activeProjectName}`;
    this.projectItem.tooltip = `Active KiCad project: ${this.activeProjectName}. Click to switch.`;
    this.projectItem.command = COMMANDS.selectActiveProject;
    this.projectItem.backgroundColor = undefined;
  }

  private renderKicad(): void {
    if (!this.cli) {
      this.kicadItem.text = '$(warning) KiCad';
      this.kicadItem.tooltip = 'kicad-cli not found. Click to configure.';
      this.kicadItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    } else {
      this.kicadItem.text = `$(circuit-board) ${this.cli.versionLabel}`;
      this.kicadItem.tooltip = `KiCad CLI: ${this.cli.path}\nClick to open settings`;
      this.kicadItem.backgroundColor = undefined;
    }
    this.kicadItem.command = COMMANDS.showStatusMenu;
  }

  private renderDrc(): void {
    this.renderDiagnosticItem(this.drcItem, 'DRC', this.drc);
  }

  private renderErc(): void {
    this.renderDiagnosticItem(this.ercItem, 'ERC', this.erc);
  }

  private renderValidationSeparator(): void {
    if (this.drc || this.erc) {
      this.sep1Item.show();
    } else {
      this.sep1Item.hide();
    }
  }

  private renderAi(): void {
    if (!this.aiConfigured) {
      this.aiItem.text = '$(sparkle) AI';
      this.aiItem.tooltip = 'AI provider not configured. Click to set up.';
      this.aiItem.command = COMMANDS.setAiApiKey;
      this.aiItem.backgroundColor = undefined;
    } else if (this.aiHealthy === false) {
      this.aiItem.text = '$(warning) AI';
      this.aiItem.tooltip =
        'AI provider configured but last check failed. Click to open chat.';
      this.aiItem.command = COMMANDS.openAiChat;
      this.aiItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    } else {
      this.aiItem.text = '$(sparkle) AI';
      this.aiItem.tooltip = 'AI provider ready. Click to open chat.';
      this.aiItem.command = COMMANDS.openAiChat;
      this.aiItem.backgroundColor = undefined;
    }
  }

  private renderMcp(): void {
    const profile = this.mcpProfile ? ` ${this.mcpProfile}` : '';

    if (this.mcpKind === 'Incompatible') {
      this.mcpItem.text = '$(plug) MCP !';
      this.mcpItem.tooltip = `MCP incompatible: server ${this.mcpVersion ?? '?'} is outside supported range. Click to upgrade.`;
      this.mcpItem.command = COMMANDS.openMcpUpgradeGuide;
      this.mcpItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      return;
    }
    if (this.mcpKind === 'Degraded') {
      this.mcpItem.text = '$(warning) MCP';
      this.mcpItem.tooltip =
        this.mcpMessage ??
        'MCP initialized but failed the Streamable HTTP contract check. Click to retry.';
      this.mcpItem.command = COMMANDS.retryMcp;
      this.mcpItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      return;
    }
    if (this.mcpKind === 'VsCodeStdio' || this.mcpConnected) {
      this.mcpItem.text = `$(plug) MCP${profile}`;
      this.mcpItem.tooltip =
        this.mcpKind === 'VsCodeStdio'
          ? `MCP connected via VS Code stdio (.vscode/mcp.json)${profile ? `  •  profile: ${this.mcpProfile}` : ''}. Click to switch profile.`
          : `MCP connected${profile ? `  •  profile: ${this.mcpProfile}` : ''}  •  server ${this.mcpVersion ?? 'unknown'}. Click to switch profile.`;
      this.mcpItem.command = COMMANDS.pickMcpProfile;
      this.mcpItem.backgroundColor = undefined;
      return;
    }
    if (this.mcpAvailable) {
      this.mcpItem.text = '$(plug) MCP';
      this.mcpItem.tooltip =
        this.mcpMessage ??
        'kicad-mcp-pro detected but not connected. Click to retry.';
      this.mcpItem.command = COMMANDS.retryMcp;
      this.mcpItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      return;
    }
    this.mcpItem.text = '$(plug) MCP';
    this.mcpItem.tooltip =
      'kicad-mcp-pro not detected. Click to install / set up.';
    this.mcpItem.command = COMMANDS.installMcp;
    this.mcpItem.backgroundColor = undefined;
  }

  private renderVariant(): void {
    if (!this.activeVariant) {
      this.variantItem.hide();
      this.sep2Item.hide();
      return;
    }
    this.sep2Item.show();
    this.variantItem.show();
    this.variantItem.text = `$(layers) ${this.activeVariant}`;
    this.variantItem.tooltip = `Active variant: ${this.activeVariant}. Click to switch.`;
    this.variantItem.command = COMMANDS.setActiveVariant;
    this.variantItem.backgroundColor = undefined;
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private make(
    priority: number,
    command: string,
    tooltip: string
  ): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      priority
    );
    item.command = command;
    item.tooltip = tooltip;
    return item;
  }

  private makeSeparator(priority: number): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      priority
    );
    item.text = '│';
    item.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
    return item;
  }

  private allItems(): vscode.StatusBarItem[] {
    return [
      this.projectItem,
      this.kicadItem,
      this.drcItem,
      this.ercItem,
      this.sep1Item,
      this.aiItem,
      this.mcpItem,
      this.sep2Item,
      this.variantItem
    ];
  }

  private diagnosticTooltip(
    label: 'DRC' | 'ERC',
    summary: DiagnosticSummary
  ): string {
    const lines = [
      `${label}: ${summary.errors} error(s), ${summary.warnings} warning(s), ${summary.infos} info.`,
      `Freshness: ${summary.freshness ?? 'not recorded'}`,
      `Origin: ${summary.origin ?? 'not recorded'}`,
      `Source: ${summary.file}`,
      ...(summary.fileUri ? [`URI: ${summary.fileUri}`] : []),
      ...(summary.projectName || summary.projectId
        ? [`Project: ${summary.projectName ?? summary.projectId}`]
        : []),
      `Updated: ${formatTimestamp(summary.capturedAt)}`,
      ...(summary.kicadVersion ? [`KiCad CLI: ${summary.kicadVersion}`] : []),
      ...(summary.reportPath ? [`Report: ${summary.reportPath}`] : []),
      ...(summary.commandArgs?.length
        ? [`Command: kicad-cli ${summary.commandArgs.join(' ')}`]
        : []),
      ...(summary.staleReason ? [`Stale reason: ${summary.staleReason}`] : []),
      ...(summary.failureMessage ? [`Failure: ${summary.failureMessage}`] : []),
      ...(summary.lastGoodCapturedAt
        ? [`Last good result: ${formatTimestamp(summary.lastGoodCapturedAt)}`]
        : []),
      'Click to re-run and refresh Problems.'
    ];
    return lines.join('\n');
  }

  private renderDiagnosticItem(
    item: vscode.StatusBarItem,
    label: 'DRC' | 'ERC',
    summary: DiagnosticSummary | undefined
  ): void {
    if (!summary) {
      item.hide();
      item.backgroundColor = undefined;
      return;
    }
    item.show();
    item.tooltip = this.diagnosticTooltip(label, summary);
    if (summary.freshness === 'stale') {
      item.text = `$(history) ${label} stale`;
      item.backgroundColor = undefined;
      return;
    }
    if (summary.freshness === 'failed') {
      item.text = `$(error) ${label} failed`;
      item.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      return;
    }
    if (summary.freshness === 'running') {
      item.text = `$(sync~spin) ${label}`;
      item.backgroundColor = undefined;
      return;
    }
    if (summary.errors > 0) {
      item.text = `$(error) ${label}: ${summary.errors}`;
      item.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      );
    } else if (summary.warnings > 0) {
      item.text = `$(warning) ${label}: ${summary.warnings}`;
      item.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    } else {
      item.text = `$(pass) ${label}`;
      item.backgroundColor = undefined;
    }
  }
}

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return 'not recorded';
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }
  return timestamp.toLocaleString();
}
