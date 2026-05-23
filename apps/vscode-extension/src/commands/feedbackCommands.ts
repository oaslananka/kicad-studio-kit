import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { localize } from '../i18n';
import { telemetry } from '../utils/telemetry';

export const BETA_FEEDBACK_FORM_URL =
  'https://github.com/oaslananka/kicad-studio-kit/discussions/new?category=beta-feedback';
export const BETA_FEEDBACK_CATEGORY_URL =
  'https://github.com/oaslananka/kicad-studio-kit/discussions/categories/beta-feedback';

export function registerFeedbackCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.sendFeedback, async () => {
      const opened = await vscode.env.openExternal(
        vscode.Uri.parse(BETA_FEEDBACK_FORM_URL)
      );
      telemetry.trackEvent('kicadstudio.feedback.opened', {
        target: 'github-discussions',
        opened: String(opened)
      });
      if (!opened) {
        await vscode.window.showWarningMessage(
          localize('feedbackOpenFailed', { url: BETA_FEEDBACK_CATEGORY_URL })
        );
      }
    })
  ];
}
