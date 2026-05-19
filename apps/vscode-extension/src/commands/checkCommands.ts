import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { resolveTargetFile } from '../utils/workspaceUtils';
import { registerTrustedCommand } from '../utils/workspaceTrust';
import type { CommandServices } from './types';

/**
 * Register DRC and ERC check commands.
 */
export function registerCheckCommands(
  services: CommandServices
): vscode.Disposable[] {
  return [
    registerTrustedCommand(
      COMMANDS.runDRC,
      async (resource?: vscode.Uri) => {
        const file = await resolveTargetFile(resource, '.kicad_pcb');
        if (!file) {
          return;
        }
        try {
          const result = await services.checkService.runDRC(file);
          services.diagnosticsCollection.set(
            vscode.Uri.file(file),
            result.diagnostics
          );
          services.statusBar.update({ drc: result.summary });
          services.setLatestDrcRun({
            file,
            diagnostics: result.diagnostics,
            summary: result.summary
          });
          services.qualityGateProvider.scheduleDrcRefresh();
          void services.fixQueueProvider.refresh().catch(() => undefined);
          if (result.diagnostics.length > 0) {
            await vscode.commands.executeCommand(
              'workbench.actions.view.problems'
            );
            const provider = await services.aiProviders.getProvider();
            if (provider?.isConfigured()) {
              const choice = await vscode.window.showInformationMessage(
                `DRC: ${result.summary.errors} errors found. Start AI analysis?`,
                'Yes, analyze',
                'No'
              );
              if (choice === 'Yes, analyze') {
                await vscode.commands.executeCommand(COMMANDS.aiProactiveDRC);
              }
            }
          }
          await services.pushStudioContext();
        } catch (error) {
          void vscode.window.showErrorMessage(
            error instanceof Error
              ? error.message
              : 'DRC failed. Confirm kicad-cli is installed and your PCB file is valid.'
          );
        }
      },
      'Run DRC'
    ),

    registerTrustedCommand(
      COMMANDS.runERC,
      async (resource?: vscode.Uri) => {
        const file = await resolveTargetFile(resource, '.kicad_sch');
        if (!file) {
          return;
        }
        try {
          const result = await services.checkService.runERC(file);
          services.diagnosticsCollection.set(
            vscode.Uri.file(file),
            result.diagnostics
          );
          services.statusBar.update({ erc: result.summary });
          if (result.diagnostics.length > 0) {
            await vscode.commands.executeCommand(
              'workbench.actions.view.problems'
            );
          }
        } catch (error) {
          void vscode.window.showErrorMessage(
            error instanceof Error
              ? error.message
              : 'ERC failed. Confirm kicad-cli is installed and your schematic file is valid.'
          );
        }
      },
      'Run ERC'
    )
  ];
}
