import * as vscode from 'vscode';
import { COMMANDS, SETTINGS } from '../constants';
import type { AIProviderRegistry } from '../ai/aiProvider';
import type { KiCadCheckService } from '../cli/checkCommands';
import type { QualityGateProvider } from '../providers/qualityGateProvider';
import type {
  DiagnosticStateStore,
  ProjectStateStore
} from '../state/stateStores';
import type { Logger } from '../utils/logger';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';
import type { DiagnosticSummary } from '../types';
import type { ActivationState } from './activationState';
import type { PushStudioContextReason } from './studioContextController';

export interface SaveCheckControllerDeps {
  checkService: KiCadCheckService;
  diagnosticState: DiagnosticStateStore;
  projectState: ProjectStateStore;
  qualityGateProvider: QualityGateProvider;
  aiProviders: AIProviderRegistry;
  activationState: ActivationState;
  logger: Logger;
  pushStudioContext: (reason: PushStudioContextReason) => Promise<void>;
}

/**
 * Runs configured auto-DRC/ERC checks on save and surfaces proactive AI
 * analysis. Extracted unchanged from `activate()` as part of the #397
 * composition-root split.
 */
export class SaveCheckController {
  constructor(private readonly deps: SaveCheckControllerDeps) {}

  async runConfiguredSaveChecks(document: vscode.TextDocument): Promise<void> {
    const {
      checkService,
      diagnosticState,
      projectState,
      qualityGateProvider,
      activationState,
      logger,
      pushStudioContext
    } = this.deps;
    const config = vscode.workspace.getConfiguration();
    const shouldRunDrc =
      document.fileName.endsWith('.kicad_pcb') &&
      config.get<boolean>(SETTINGS.autoRunDRC, false);
    const shouldRunErc =
      document.fileName.endsWith('.kicad_sch') &&
      config.get<boolean>(SETTINGS.autoRunERC, false);

    if ((!shouldRunDrc && !shouldRunErc) || !isWorkspaceTrusted()) {
      return;
    }

    try {
      const result = shouldRunDrc
        ? await checkService.runDRC(document.fileName)
        : await checkService.runERC(document.fileName);
      diagnosticState.applyValidationResult(
        vscode.Uri.file(document.fileName),
        result.diagnostics,
        result.summary,
        {
          project: projectState.findProjectForResource(document.fileName)
        }
      );
      if (shouldRunDrc) {
        activationState.latestDrcRun = {
          file: document.fileName,
          diagnostics: result.diagnostics,
          summary: result.summary
        };
        qualityGateProvider.scheduleDrcRefresh();
        await this.maybeOfferProactiveDrc(
          result.summary,
          result.diagnostics.length
        );
        await pushStudioContext('drc');
      }
      if (result.diagnostics.length > 0) {
        await vscode.commands.executeCommand('workbench.actions.view.problems');
      }
    } catch (error) {
      diagnosticState.recordValidationFailure(
        shouldRunDrc ? 'drc' : 'erc',
        vscode.Uri.file(document.fileName),
        error,
        {
          project: projectState.findProjectForResource(document.fileName)
        }
      );
      logger.error('Auto DRC/ERC on save failed', error);
      void vscode.window.showErrorMessage(
        error instanceof Error
          ? `KiCad Studio auto-check failed: ${error.message}`
          : 'KiCad Studio auto-check failed. Confirm kicad-cli is configured and the file is valid.'
      );
    }
  }

  private async maybeOfferProactiveDrc(
    summary: DiagnosticSummary,
    diagnosticCount: number
  ): Promise<void> {
    const provider = await this.deps.aiProviders.getProvider();
    if (!provider?.isConfigured() || diagnosticCount <= 0) {
      return;
    }
    const choice = await vscode.window.showInformationMessage(
      `DRC: ${summary.errors} errors found. Start AI analysis?`,
      'Yes, analyze',
      'No'
    );
    if (choice === 'Yes, analyze') {
      await vscode.commands.executeCommand(COMMANDS.aiProactiveDRC);
    }
  }
}
