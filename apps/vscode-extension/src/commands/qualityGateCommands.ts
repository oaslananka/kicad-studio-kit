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
      (gate: QualityGateCommandArg) =>
        services.qualityGateProvider.runGate(resolveGateArg(gate)),
      'Run Quality Gate'
    ),
    vscode.commands.registerCommand(
      COMMANDS.qualityGateShowRaw,
      (gate: QualityGateCommandArg) =>
        services.qualityGateProvider.showRaw(resolveGateArg(gate))
    ),
    vscode.commands.registerCommand(
      COMMANDS.qualityGateOpenDocs,
      (gate?: QualityGateCommandArg) =>
        services.qualityGateProvider.openDocs(
          gate ? resolveGateArg(gate) : undefined
        )
    )
  ];
}

type QualityGateCommandArg =
  | QualityGateResult
  | { kind: 'gate'; gate: QualityGateResult };

function resolveGateArg(gate: QualityGateCommandArg): QualityGateResult {
  return 'kind' in gate && gate.kind === 'gate' ? gate.gate : (gate as QualityGateResult);
}
