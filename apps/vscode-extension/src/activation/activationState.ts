import type * as vscode from 'vscode';
import type { DiagnosticSummary } from '../types';

/**
 * Mutable activation-scoped state that is shared between the activation
 * controllers and the command/language-model layers. Before the controller
 * split (#397) these lived as closure variables inside `activate()`; promoting
 * them to a small holder keeps the exact same shared-state semantics while the
 * logic moves into focused controllers.
 */
export interface LatestDrcRun {
  file: string;
  diagnostics: vscode.Diagnostic[];
  summary: DiagnosticSummary;
}

export class ActivationState {
  /**
   * Tracks the last known AI provider health. `undefined` means "not yet
   * probed" and is reset when AI-related configuration changes.
   */
  aiHealthy: boolean | undefined;

  /**
   * The most recent DRC run, used as a fallback when the per-project diagnostic
   * store has no record yet.
   */
  latestDrcRun: LatestDrcRun | undefined;
}
