import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type { CommandServices } from './types';

export function registerMcpLogCommands(
  services: CommandServices
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.openMcpLog, async () => {
      const document = await vscode.workspace.openTextDocument({
        content: services.mcpLogger.renderMarkdown(),
        language: 'markdown'
      });
      await vscode.window.showTextDocument(document);
    }),
    vscode.commands.registerCommand(COMMANDS.saveMcpLog, async () => {
      const target = await vscode.window.showSaveDialog({
        filters: { Markdown: ['md'] },
        saveLabel: 'Save MCP Log'
      });
      if (!target) {
        return;
      }
      await vscode.workspace.fs.writeFile(
        target,
        Buffer.from(services.mcpLogger.renderMarkdown(), 'utf8')
      );
    }),
    vscode.commands.registerCommand(COMMANDS.clearMcpLog, async () => {
      const choice = await vscode.window.showWarningMessage(
        'Clear the captured MCP request/response log?',
        'Clear',
        'Cancel'
      );
      if (choice === 'Clear') {
        services.mcpLogger.clear();
      }
    })
  ];
}
