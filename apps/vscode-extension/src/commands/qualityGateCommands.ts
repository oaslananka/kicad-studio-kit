import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type { QualityGateResult } from '../types';
import { registerTrustedCommand } from '../utils/workspaceTrust';
import type { CommandServices } from './types';

export function registerQualityGateCommands(
  services: CommandServices
): vscode.Disposable[] {
  return [
    registerTrustedCommand(
      COMMANDS.qualityGateRunAll,
      () => services.qualityGateProvider.runAll(),
      'Run Quality Gates'
    ),
    registerTrustedCommand(
      COMMANDS.qualityGateRunThis,
      (gate: QualityGateResult) => services.qualityGateProvider.runGate(gate),
      'Run Quality Gate'
    ),
    vscode.commands.registerCommand(
      COMMANDS.qualityGateShowRaw,
      (gate: QualityGateResult) => services.qualityGateProvider.showRaw(gate)
    ),
    vscode.commands.registerCommand(COMMANDS.qualityGateOpenDocs, () =>
      services.qualityGateProvider.openDocs()
    )
  ];
}
