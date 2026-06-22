import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CONTEXT_KEYS, SETTINGS } from '../constants';
import type { McpClient } from '../mcp/mcpClient';
import type { McpDetector } from '../mcp/mcpDetector';
import type { McpStateStore } from '../state/stateStores';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';
import { discoverKiCadProjects } from '../workspace/projectContext';
import type { McpInstallStatus } from '../types';

export interface McpActivationControllerDeps {
  mcpClient: McpClient;
  mcpState: McpStateStore;
  mcpDetector: McpDetector;
}

/**
 * Owns MCP connection probing and the MCP-related `setContext` keys. Extracted
 * unchanged from `activate()` as part of the #397 composition-root split.
 */
export class McpActivationController {
  constructor(private readonly deps: McpActivationControllerDeps) {}

  async refreshMcpState(): Promise<void> {
    const { mcpClient, mcpState } = this.deps;
    if (!isWorkspaceTrusted()) {
      await this.setRestrictedMcpContexts();
      mcpState.update({
        kind: 'Disconnected',
        available: false,
        connected: false,
        message: 'MCP integration is disabled in Restricted Mode.'
      });
      return;
    }

    const state = await mcpClient.testConnection();
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpAvailable,
      state.available
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpConnected,
      state.connected
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpCompatible,
      state.server?.compat === 'ok' || state.server?.compat === 'warn'
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpIncompatible,
      state.kind === 'Incompatible'
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpDisconnected,
      state.kind === 'Disconnected'
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpVsCodeStdio,
      state.kind === 'VsCodeStdio'
    );
    const activeMode =
      state.server?.capabilities.serverInfo?.operatingMode.active ?? 'unknown';
    await this.setMcpOperatingModeContexts(activeMode);
    mcpState.update(state);

    if (
      state.available &&
      !state.connected &&
      state.kind !== 'Incompatible' &&
      vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.mcpAutoDetect, true)
    ) {
      await this.maybeOfferMcpBootstrap(state.install);
    }
  }

  private async setRestrictedMcpContexts(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpAvailable,
      false
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpConnected,
      false
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpCompatible,
      false
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpIncompatible,
      false
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpDisconnected,
      true
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpVsCodeStdio,
      false
    );
    await this.setMcpOperatingModeContexts('unknown');
  }

  private async setMcpOperatingModeContexts(mode: string): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpOperatingMode,
      mode
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpWriteMode,
      mode === 'write' || mode === 'experimental'
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpManufacturingMode,
      mode === 'manufacturing' || mode === 'experimental'
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpExperimentalMode,
      mode === 'experimental'
    );
  }

  private async maybeOfferMcpBootstrap(
    installStatus: McpInstallStatus | undefined
  ): Promise<void> {
    if (!installStatus?.found) {
      return;
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }

    // Only offer MCP setup when the workspace actually contains a KiCad project.
    // kicad-mcp-pro is project-scoped, so prompting in a folder that merely
    // happens to hold a stray KiCad file (and activated the extension) is noise.
    const projects = await discoverKiCadProjects(
      vscode.workspace.workspaceFolders
    );
    if (projects.length === 0) {
      return;
    }

    const mcpJsonPath = path.join(root, '.vscode', 'mcp.json');
    if (fs.existsSync(mcpJsonPath)) {
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      'kicad-mcp-pro was detected. Create .vscode/mcp.json for this project?',
      'Setup MCP',
      'Later'
    );
    if (choice === 'Setup MCP') {
      await this.deps.mcpDetector.generateMcpJson(root, installStatus);
      await this.refreshMcpState();
    }
  }
}
