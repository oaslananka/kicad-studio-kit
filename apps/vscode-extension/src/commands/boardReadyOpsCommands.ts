import * as vscode from 'vscode';
import { COMMANDS, SETTINGS } from '../constants';
import { localize } from '../i18n';

/** URL for BoardReadyOps documentation. */
export const BOARDREADYOPS_DOCS_URL =
  'https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/board-ready-ops.md';

/**
 * Register BoardReadyOps command stubs.
 *
 * These stubs fail safely with clear unavailable-state messages until
 * the BoardReadyOps JSON contract is stable and the feature can be
 * implemented on top of it (#268). Once the contract is stable, this
 * module is replaced with a real implementation.
 */
export function registerBoardReadyOpsCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.boardReadyOpsCheck, async () => {
      const enabled = vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.boardReadyOpsEnabled, false);

      if (!enabled) {
        const action = await vscode.window.showWarningMessage(
          localize('boardReadyOpsNotConfigured'),
          localize('boardReadyOpsOpenSettingsAction')
        );
        if (action === localize('boardReadyOpsOpenSettingsAction')) {
          await vscode.commands.executeCommand(COMMANDS.boardReadyOpsConfigure);
        }
        return;
      }

      await vscode.window.showInformationMessage(
        localize('boardReadyOpsRunning')
      );
    }),

    vscode.commands.registerCommand(
      COMMANDS.boardReadyOpsConfigure,
      async () => {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'kicadstudio.boardReadyOps'
        );
      }
    ),

    vscode.commands.registerCommand(
      COMMANDS.boardReadyOpsShowReport,
      async () => {
        await vscode.window.showInformationMessage(
          localize('boardReadyOpsReportNotAvailable')
        );
      }
    ),

    vscode.commands.registerCommand(
      COMMANDS.boardReadyOpsOpenDocs,
      async () => {
        const opened = await vscode.env.openExternal(
          vscode.Uri.parse(BOARDREADYOPS_DOCS_URL)
        );
        if (!opened) {
          void vscode.window.showWarningMessage(
            localize('boardReadyOpsDocsOpenFailed')
          );
        }
      }
    )
  ];
}
