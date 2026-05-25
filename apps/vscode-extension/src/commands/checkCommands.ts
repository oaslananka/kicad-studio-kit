import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { resolveTargetFile } from '../utils/workspaceUtils';
import { registerTrustedCommand } from '../utils/workspaceTrust';
import type { CommandServices } from './types';
import type { DiagnosticSummary } from '../types';

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
        const file = await resolveTargetFile(resource, '.kicad_pcb', {
          projectRoot: services.projectState.getActiveProject()?.rootPath
        });
        if (!file) {
          return;
        }
        try {
          const result = await services.checkService.runDRC(file);
          applyValidationResult(services, file, result);
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
          recordValidationFailure(services, 'drc', file, error);
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
        const file = await resolveTargetFile(resource, '.kicad_sch', {
          projectRoot: services.projectState.getActiveProject()?.rootPath
        });
        if (!file) {
          return;
        }
        try {
          const result = await services.checkService.runERC(file);
          applyValidationResult(services, file, result);
          if (result.diagnostics.length > 0) {
            await vscode.commands.executeCommand(
              'workbench.actions.view.problems'
            );
          }
        } catch (error) {
          recordValidationFailure(services, 'erc', file, error);
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

function applyValidationResult(
  services: CommandServices,
  file: string,
  result: {
    diagnostics: readonly vscode.Diagnostic[];
    summary: {
      file: string;
      errors: number;
      warnings: number;
      infos: number;
      source: 'drc' | 'erc' | 'syntax';
      capturedAt?: string | undefined;
    };
  }
): void {
  const uri = vscode.Uri.file(file);
  if (services.diagnosticState) {
    services.diagnosticState.applyValidationResult(
      uri,
      result.diagnostics,
      result.summary,
      {
        project: services.projectState.findProjectForResource(uri)
      }
    );
    return;
  }
  services.diagnosticsCollection.set(uri, result.diagnostics);
  services.statusBar.update(
    result.summary.source === 'drc'
      ? { drc: result.summary }
      : { erc: result.summary }
  );
}

function recordValidationFailure(
  services: CommandServices,
  source: 'drc' | 'erc',
  file: string,
  error: unknown
): void {
  const uri = vscode.Uri.file(file);
  if (services.diagnosticState) {
    services.diagnosticState.recordValidationFailure(source, uri, error, {
      project: services.projectState.findProjectForResource(uri)
    });
    return;
  }
  const summary: DiagnosticSummary = {
    file,
    source,
    errors: 0,
    warnings: 0,
    infos: 0,
    capturedAt: new Date().toISOString(),
    freshness: 'failed',
    origin: 'kicad-cli',
    failureMessage: error instanceof Error ? error.message : String(error)
  };
  services.statusBar.update(
    source === 'drc' ? { drc: summary } : { erc: summary }
  );
}
