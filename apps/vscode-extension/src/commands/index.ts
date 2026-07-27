import * as vscode from 'vscode';
import { registerExportCommands } from './exportCommands';
import { registerExportPickerCommands } from './exportPickerCommands';
import { registerCheckCommands } from './checkCommands';
import { registerAiCommands } from './aiCommands';
import { registerMcpCommands } from './mcpCommands';
import { registerMcpLogCommands } from './mcpLogCommands';
import { registerQualityGateCommands } from './qualityGateCommands';
import { registerSecretCommands } from './secretCommands';
import { registerSettingsCommands } from './settingsCommands';
import { registerViewerCommands } from './viewerCommands';
import { registerFeedbackCommands } from './feedbackCommands';
import { registerBoardReadyOpsCommands } from './boardReadyOpsCommands';
import { registerTaskHubCommands } from './taskHubCommands';
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
    ...registerExportPickerCommands(services),
    ...registerCheckCommands(services),
    ...registerAiCommands(extensionContext, services),
    ...registerMcpCommands(extensionContext, services),
    ...registerMcpLogCommands(services),
    ...registerQualityGateCommands(services),
    ...registerSecretCommands(services),
    ...registerSettingsCommands(extensionContext, services),
    ...registerViewerCommands(services),
    ...registerFeedbackCommands(),
    ...registerBoardReadyOpsCommands(services),
    ...registerTaskHubCommands(async () => {
      const project = services.projectState.getSnapshot();
      const activeResource = project.activeResource ?? '';
      const mcp = services.mcpClient.getState();
      const operatingMode =
        mcp.server?.capabilities.serverInfo?.operatingMode.active ?? 'unknown';
      const aiProvider = await services.aiProviders.getProvider();
      return {
        hasProject: project.hasProject,
        workspaceTrusted: project.workspaceTrusted,
        schematicOpen: activeResource.endsWith('.kicad_sch'),
        pcbOpen: activeResource.endsWith('.kicad_pcb'),
        jobsetOpen: activeResource.endsWith('.kicad_jobset'),
        hasVariants: project.hasVariants,
        aiEnabled: Boolean(aiProvider?.isConfigured()),
        mcpAvailable: mcp.available,
        mcpConnected: mcp.connected,
        mcpRetryAvailable:
          mcp.kind === 'Disconnected' || mcp.kind === 'Incompatible',
        mcpManufacturingMode:
          operatingMode === 'manufacturing' || operatingMode === 'experimental'
      };
    })
  );
}
