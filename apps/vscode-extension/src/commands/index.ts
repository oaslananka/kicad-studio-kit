import * as vscode from 'vscode';
import { registerExportCommands } from './exportCommands';
import { registerCheckCommands } from './checkCommands';
import { registerAiCommands } from './aiCommands';
import { registerMcpCommands } from './mcpCommands';
import { registerMcpLogCommands } from './mcpLogCommands';
import { registerQualityGateCommands } from './qualityGateCommands';
import { registerSecretCommands } from './secretCommands';
import { registerSettingsCommands } from './settingsCommands';
import { registerViewerCommands } from './viewerCommands';
import type { CommandServices } from './types';

export type { CommandServices } from './types';

/**
 * Register all extension commands by delegating to domain-specific modules.
 *
 * Each module returns an array of disposables that are pushed into the
 * extension context's subscriptions so VS Code can clean them up on
 * deactivation.
 */
export function registerAllCommands(
  extensionContext: vscode.ExtensionContext,
  services: CommandServices
): void {
  extensionContext.subscriptions.push(
    ...registerExportCommands(services),
    ...registerCheckCommands(services),
    ...registerAiCommands(extensionContext, services),
    ...registerMcpCommands(extensionContext, services),
    ...registerMcpLogCommands(services),
    ...registerQualityGateCommands(services),
    ...registerSecretCommands(services),
    ...registerSettingsCommands(extensionContext, services),
    ...registerViewerCommands(services)
  );
}
