import * as vscode from 'vscode';
import * as path from 'node:path';
import { COMMANDS, SETTINGS } from '../constants';
import { localize } from '../i18n';
import type { CommandServices } from './types';
import {
  discoverBoardReadyOpsContract,
  parseBoardReadyOpsRunResult,
  type BoardReadyOpsFinding,
  type BoardReadyOpsRunResult
} from '../boardreadyops/contract';
import { parseBoardReadyOpsPlan } from '../boardreadyops/plan';
import { parseBoardReadyOpsEvidenceVerification } from '../boardreadyops/evidence';
import { runBoardReadyOpsCommand } from '../boardreadyops/cli';

/** URL for BoardReadyOps documentation. */
export const BOARDREADYOPS_DOCS_URL =
  'https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/board-ready-ops.md';

let latestReport: BoardReadyOpsRunResult | undefined = undefined;
const previousDiagnosticUris = new Set<string>();

function runBoardReadyOps(
  projectPath: string,
  specFile: string | undefined,
  token: vscode.CancellationToken
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = ['run', '--format', 'json'];
  if (specFile) {
    args.push('--config', specFile);
  }
  args.push(projectPath);
  return runBoardReadyOpsCommand(projectPath, args, token);
}

async function assertCompatibleBoardReadyOps(
  projectPath: string,
  token: vscode.CancellationToken
): Promise<void> {
  const { stdout, exitCode } = await runBoardReadyOpsCommand(
    projectPath,
    ['doctor', '--format', 'json'],
    token
  );
  if (token.isCancellationRequested) {
    return;
  }
  if (exitCode !== 0) {
    throw new Error(`BoardReadyOps doctor exited with code ${exitCode}.`);
  }
  const contract = discoverBoardReadyOpsContract(stdout);
  if (!contract.compatible) {
    throw new Error(
      `BoardReadyOps is not contract-compatible: ${contract.reason} (version ${contract.version}, doctor schema ${contract.schemaVersion ?? 'missing'}).`
    );
  }
}

async function showBoardReadyOpsEvidenceState(
  services: CommandServices
): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration()
    .get<boolean>(SETTINGS.boardReadyOpsEnabled, false);
  if (!enabled) {
    void vscode.window.showWarningMessage(
      localize('boardReadyOpsNotConfigured')
    );
    return;
  }
  const projectPath = services.projectState.getActiveProject()?.rootPath;
  if (!projectPath) {
    void vscode.window.showErrorMessage(
      'No active KiCad project found. Open a project to verify BoardReadyOps release evidence.'
    );
    return;
  }
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Verifying BoardReadyOps release evidence...',
      cancellable: true
    },
    async (_progress, token) => {
      try {
        await assertCompatibleBoardReadyOps(projectPath, token);
        if (token.isCancellationRequested) return;
        const bundlePath = path.join(
          projectPath,
          'build',
          'boardreadyops-release'
        );
        const { stdout, exitCode } = await runBoardReadyOpsCommand(
          projectPath,
          ['release', 'verify', '--format', 'json', bundlePath],
          token
        );
        if (token.isCancellationRequested) return;
        if (exitCode !== 0 && exitCode !== 1) {
          throw new Error(
            `BoardReadyOps release verify exited with code ${exitCode}.`
          );
        }
        const verification = parseBoardReadyOpsEvidenceVerification(stdout);
        let signatureText = ' Bundle is unsigned.';
        if (verification.signature.present) {
          signatureText = verification.signature.ok
            ? ' Signature verified.'
            : ' Signature verification failed.';
        }
        if (verification.ok) {
          void vscode.window.showInformationMessage(
            `BoardReadyOps release evidence verified: ${verification.checked} artifact(s).${signatureText}`
          );
        } else {
          void vscode.window.showWarningMessage(
            `BoardReadyOps release evidence is not verified (${verification.checked} artifact(s) checked).${signatureText} Run BoardReadyOps release prepare/verify to refresh the bundle.`
          );
        }
      } catch (err) {
        const safeError =
          err instanceof Error
            ? err.message
            : 'Unknown BoardReadyOps release verification error.';
        services.logger.error(
          'BoardReadyOps release verification failed',
          safeError
        );
        void vscode.window.showErrorMessage(
          `BoardReadyOps release verification failed: ${safeError}`
        );
      }
    }
  );
}

/**
 * Register BoardReadyOps commands.
 */
export function registerBoardReadyOpsCommands(
  services: CommandServices
): vscode.Disposable[] {
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

      const activeProject = services.projectState.getActiveProject();
      const projectPath = activeProject?.rootPath;
      if (!projectPath) {
        void vscode.window.showErrorMessage(
          'No active KiCad project found. Open a project to run BoardReadyOps.'
        );
        return;
      }

      const specFile = vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.boardReadyOpsSpecFile, '')
        .trim();

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Running BoardReadyOps check...',
          cancellable: true
        },
        async (progress, token) => {
          try {
            await assertCompatibleBoardReadyOps(projectPath, token);
            if (token.isCancellationRequested) {
              return;
            }

            const { stdout } = await runBoardReadyOps(
              projectPath,
              specFile || undefined,
              token
            );

            if (token.isCancellationRequested) {
              return;
            }

            const result = parseBoardReadyOpsRunResult(stdout);

            latestReport = result;

            // Clear previous BoardReadyOps diagnostics
            const aggregator = services.diagnosticsCollection as any;
            const setDiagnostics = (
              uri: vscode.Uri,
              diags: vscode.Diagnostic[]
            ) => {
              if (typeof aggregator.setForSource === 'function') {
                aggregator.setForSource(uri, 'other', diags);
              } else {
                services.diagnosticsCollection.set(uri, diags);
              }
            };

            for (const uriStr of previousDiagnosticUris) {
              setDiagnostics(vscode.Uri.parse(uriStr), []);
            }
            previousDiagnosticUris.clear();

            // Group findings by file URI
            const findingsByFile = new Map<string, BoardReadyOpsFinding[]>();
            for (const finding of result.findings) {
              const relPath = finding.resource.path;
              const fullPath = path.isAbsolute(relPath)
                ? relPath
                : path.resolve(projectPath, relPath);
              const fileUri = vscode.Uri.file(fullPath);
              const uriStr = fileUri.toString();

              let fileFindings = findingsByFile.get(uriStr);
              if (!fileFindings) {
                fileFindings = [];
                findingsByFile.set(uriStr, fileFindings);
              }
              fileFindings.push(finding);
            }

            // Populate diagnostics
            for (const [uriStr, fileFindings] of findingsByFile.entries()) {
              const fileUri = vscode.Uri.parse(uriStr);
              const diagnostics = fileFindings.map((finding) => {
                let range = new vscode.Range(0, 0, 0, 0);
                if (finding.location) {
                  const loc = finding.location;
                  if (loc.region) {
                    const reg = loc.region;
                    range = new vscode.Range(
                      Math.max(0, reg.startLine - 1),
                      Math.max(0, (reg.startColumn ?? 1) - 1),
                      Math.max(0, reg.endLine - 1),
                      Math.max(0, (reg.endColumn ?? 1) - 1)
                    );
                  } else if (typeof loc.line === 'number') {
                    const line = Math.max(0, loc.line - 1);
                    const col = Math.max(0, (loc.column ?? 1) - 1);
                    range = new vscode.Range(line, col, line, col);
                  }
                }

                let severity = vscode.DiagnosticSeverity.Information;
                if (
                  finding.severity === 'critical' ||
                  finding.severity === 'high'
                ) {
                  severity = vscode.DiagnosticSeverity.Error;
                } else if (
                  finding.severity === 'medium' ||
                  finding.severity === 'low'
                ) {
                  severity = vscode.DiagnosticSeverity.Warning;
                }

                const diagnostic = new vscode.Diagnostic(
                  range,
                  finding.message,
                  severity
                );
                diagnostic.source = 'boardreadyops';
                diagnostic.code = finding.ruleId;
                return diagnostic;
              });

              setDiagnostics(fileUri, diagnostics);
              previousDiagnosticUris.add(uriStr);
            }

            const summary = result.summary;
            const summaryText = `BoardReadyOps: ${result.status === 'passed' ? 'Passed' : 'Failed'} with ${summary.total} findings (${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low, ${summary.info} info).`;

            if (summary.total > 0) {
              const choice = await vscode.window.showWarningMessage(
                summaryText,
                'Show Problems'
              );
              if (choice === 'Show Problems') {
                await vscode.commands.executeCommand(
                  'workbench.actions.view.problems'
                );
              }
            } else {
              void vscode.window.showInformationMessage(
                'BoardReadyOps: Board is ready! No issues found.'
              );
            }
          } catch (err) {
            services.logger.error('BoardReadyOps check failed', err);
            void vscode.window.showErrorMessage(
              `BoardReadyOps check failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      );
    }),

    vscode.commands.registerCommand(COMMANDS.boardReadyOpsPlan, async () => {
      const enabled = vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.boardReadyOpsEnabled, false);
      if (!enabled) {
        void vscode.window.showWarningMessage(
          localize('boardReadyOpsNotConfigured')
        );
        return;
      }
      const projectPath = services.projectState.getActiveProject()?.rootPath;
      if (!projectPath) {
        void vscode.window.showErrorMessage(
          'No active KiCad project found. Open a project to plan BoardReadyOps remediation.'
        );
        return;
      }
      const specFile = vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.boardReadyOpsSpecFile, '')
        .trim();
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Building BoardReadyOps remediation plan...',
          cancellable: true
        },
        async (_progress, token) => {
          try {
            await assertCompatibleBoardReadyOps(projectPath, token);
            if (token.isCancellationRequested) return;
            const args = ['plan', '--format', 'json'];
            if (specFile) args.push('--config', specFile);
            args.push(projectPath);
            const { stdout, exitCode } = await runBoardReadyOpsCommand(
              projectPath,
              args,
              token
            );
            if (token.isCancellationRequested) return;
            if (exitCode !== 0 && exitCode !== 1) {
              throw new Error(
                `BoardReadyOps plan exited with code ${exitCode}.`
              );
            }
            const plan = parseBoardReadyOpsPlan(stdout);
            const actions = plan.nextActions.length
              ? plan.nextActions
              : plan.releaseActions;
            if (actions.length === 0) {
              void vscode.window.showInformationMessage(
                'BoardReadyOps did not report any remediation or release actions.'
              );
              return;
            }
            await vscode.window.showQuickPick(
              actions.map((action) => ({
                label: action.title,
                description: action.ruleId,
                detail: action.fixStrategy.steps.join(' → ')
              })),
              {
                title: 'BoardReadyOps Remediation Plan',
                placeHolder: 'Review the shortest deterministic next actions'
              }
            );
          } catch (err) {
            const safeError =
              err instanceof Error
                ? err.message
                : 'Unknown BoardReadyOps plan error.';
            services.logger.error('BoardReadyOps plan failed', safeError);
            void vscode.window.showErrorMessage(
              `BoardReadyOps plan failed: ${safeError}`
            );
          }
        }
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
        if (!latestReport) {
          await vscode.window.showInformationMessage(
            localize('boardReadyOpsReportNotAvailable')
          );
          return;
        }

        const summary = latestReport.summary;
        const summaryText = `BoardReadyOps Report: ${latestReport.status === 'passed' ? 'Passed' : 'Failed'}. Total findings: ${summary.total} (${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low, ${summary.info} info).`;

        if (summary.total > 0) {
          const choice = await vscode.window.showInformationMessage(
            summaryText,
            'Show Problems',
            'Verify Release Evidence'
          );
          if (choice === 'Show Problems') {
            await vscode.commands.executeCommand(
              'workbench.actions.view.problems'
            );
          } else if (choice === 'Verify Release Evidence') {
            await showBoardReadyOpsEvidenceState(services);
          }
        } else {
          const choice = await vscode.window.showInformationMessage(
            summaryText,
            'Verify Release Evidence'
          );
          if (choice === 'Verify Release Evidence') {
            await showBoardReadyOpsEvidenceState(services);
          }
        }
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
