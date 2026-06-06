import * as vscode from 'vscode';
import { SETTINGS } from '../constants';
import { McpDetector } from '../mcp/mcpDetector';
import type { McpInstallStatus } from '../types';
import { Logger } from '../utils/logger';
import {
  createMcpStdioServerDefinition,
  getLanguageModelApi,
  type McpServerDefinitionProvider
} from './api';

export const KICAD_MCP_SERVER_PROVIDER_ID = 'kicadstudio.mcpServer';
const KICAD_MCP_SERVER_LABEL = 'KiCad MCP Pro (detected)';

export function registerMcpServerDefinitionProvider(
  context: vscode.ExtensionContext,
  detector: McpDetector,
  logger: Logger
): void {
  const lm = getLanguageModelApi();
  if (typeof lm?.registerMcpServerDefinitionProvider !== 'function') {
    logger.debug(
      'VS Code MCP server definition provider API is unavailable on this host.'
    );
    return;
  }

  const emitter = new vscode.EventEmitter<void>();
  const provider: McpServerDefinitionProvider<unknown> = {
    onDidChangeMcpServerDefinitions: emitter.event,
    provideMcpServerDefinitions: async () => {
      const definition = await createKicadMcpServerDefinition(detector);
      return definition ? [definition] : [];
    },
    resolveMcpServerDefinition: async (server) => server
  };

  context.subscriptions.push(
    emitter,
    lm.registerMcpServerDefinitionProvider(
      KICAD_MCP_SERVER_PROVIDER_ID,
      provider
    )
  );
}

export async function createKicadMcpServerDefinition(
  detector: McpDetector,
  status?: McpInstallStatus
): Promise<unknown | undefined> {
  if (!vscode.workspace.isTrusted) {
    return undefined; // Workspace Trust kapalıysa server auto-start yapma
  }
  const install = status ?? (await detector.detectKicadMcpPro());
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!install.found || !workspaceRoot) {
    return undefined;
  }

  const config = vscode.workspace.getConfiguration();
  const profile = config.get<string>(SETTINGS.mcpProfile, 'analysis');

  return createMcpStdioServerDefinition({
    label: KICAD_MCP_SERVER_LABEL,
    command: install.command === 'uvx' ? 'uvx' : 'kicad-mcp-pro',
    args: install.command === 'uvx' ? ['kicad-mcp-pro'] : [],
    cwd: vscode.Uri.file(workspaceRoot),
    env: {
      KICAD_MCP_PROJECT_DIR: workspaceRoot,
      KICAD_MCP_PROFILE: profile,
      KICAD_MCP_OPERATING_MODE: 'readonly'
    },
    ...(install.version ? { version: install.version } : {})
  });
}
