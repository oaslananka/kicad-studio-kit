import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type { FixQueueProvider } from '../mcp/fixQueueProvider';

export class KiCadCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private readonly fixQueueProvider: FixQueueProvider) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] {
    return this.fixQueueProvider
      .getFixesForUri(document.uri, range)
      .map((fix) => {
        const action = new vscode.CodeAction(
          `KiCad Fix: ${fix.title ?? fix.description}`,
          vscode.CodeActionKind.QuickFix.append('kicad').append(fix.severity)
        );
        action.command = {
          command: COMMANDS.applyFixQueueById,
          title: 'Apply KiCad Fix',
          arguments: [fix.id]
        };
        action.isPreferred = (fix.confidence ?? 0) >= 0.9;
        return action;
      });
  }
}
