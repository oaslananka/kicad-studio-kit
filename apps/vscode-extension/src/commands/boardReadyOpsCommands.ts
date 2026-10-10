import * as vscode from 'vscode';
import * as path from 'node:path';
import { COMMANDS, SETTINGS } from '../constants';
import { localize } from '../i18n';
import type { CommandServices } from './types';
import {
  assertBoardReadyOpsRunVerdict,
  discoverBoardReadyOpsContract,
  parseBoardReadyOpsRunResult,
  type BoardReadyOpsFinding,
  type BoardReadyOpsRunResult,
  type BoardReadyOpsContractDiscovery
} from '../boardreadyops/contract';
import {
  assertBoardReadyOpsPlanVerdict,
  parseBoardReadyOpsPlan,
  type BoardReadyOpsPlanAction
} from '../boardreadyops/plan';
import {
  assertBoardReadyOpsEvidenceVerdict,
  parseBoardReadyOpsEvidenceVerification
} from '../boardreadyops/evidence';
import { runBoardReadyOpsCommand } from '../boardreadyops/cli';
import {
  parseBoardReadyOpsReviewPreview,
  supportsBoardReadyOpsReviewJson
} from '../boardreadyops/review';
import { resolveSafeWorkspacePath } from '../utils/pathUtils';
import { requireWorkspaceTrust } from '../utils/workspaceTrust';

/** URL for BoardReadyOps documentation. */
export const BOARDREADYOPS_DOCS_URL =
  'https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/board-ready-ops.md';

let latestReport:
  { projectRoot: string; result: BoardReadyOpsRunResult } | undefined =
  undefined;
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
): Promise<BoardReadyOpsContractDiscovery | undefined> {
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
  return contract;
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
        assertBoardReadyOpsEvidenceVerdict(verification, exitCode);
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

/** Dry-run only. Preview metadata is NOT verified manufacturing evidence. */
async function previewBoardReadyOpsReview(
  projectPath: string,
  services: CommandServices
): Promise<void> {
  let summary: string | undefined;
  let unsupportedVersion: string | undefined;
  let failed = false;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Preparing BoardReadyOps structured review preview...',
      cancellable: true
    },
    async (_progress, token) => {
      try {
        const contract = await assertCompatibleBoardReadyOps(
          projectPath,
          token
        );
        if (token.isCancellationRequested || !contract) return;
        if (!supportsBoardReadyOpsReviewJson(contract.version)) {
          unsupportedVersion = contract.version;
          return;
        }
        const config = vscode.workspace
          .getConfiguration()
          .get<string>(SETTINGS.boardReadyOpsSpecFile, '')
          .trim();
        const runArgs = ['run', '--format', 'json'];
        if (config) runArgs.push('--config', config);
        runArgs.push(projectPath);
        const readinessProcess = await runBoardReadyOpsCommand(
          projectPath,
          runArgs,
          token
        );
        if (token.isCancellationRequested) return;
        if (![0, 1].includes(readinessProcess.exitCode)) {
          throw new Error('BoardReadyOps readiness process failed.');
        }
        const readiness = parseBoardReadyOpsRunResult(readinessProcess.stdout);
        assertBoardReadyOpsRunVerdict(readiness, readinessProcess.exitCode);
        if (readiness.tool.version !== contract.version) {
          throw new Error(
            'BoardReadyOps readiness version changed during discovery.'
          );
        }
        const counts = readiness.summary;
        const blockers = counts.critical + counts.high;
        // A zero process exit or numeric score cannot override blocking
        // manufacturing findings, including inconsistent external data.
        if (blockers > 0 && readinessProcess.exitCode === 0) {
          throw new Error(
            'BoardReadyOps readiness claims success with blocking findings.'
          );
        }
        const args = [
          'review',
          'publish',
          '--dry-run',
          '--upload',
          'metadata',
          '--format',
          'json'
        ];
        if (config) args.push('--config', config);
        args.push(projectPath);
        const reviewProcess = await runBoardReadyOpsCommand(
          projectPath,
          args,
          token
        );
        if (token.isCancellationRequested) return;
        const preview = parseBoardReadyOpsReviewPreview(
          reviewProcess.stdout,
          contract.version,
          reviewProcess.exitCode
        );
        summary = [
          'BoardReadyOps structured review preview (DRY RUN ONLY)',
          '',
          `Readiness: ${readiness.status === 'passed' ? 'PASSED' : 'FAILED'}`,
          `Findings: ${counts.total} (${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.info} info)`,
          `Blocking findings: ${blockers}`,
          `Evidence digest: ${preview.evidenceDigest}`,
          'Cloud upload: NOT PERFORMED',
          'Review approval: NOT GRANTED',
          'Release evidence verification: NOT PERFORMED',
          '',
          'A dry-run digest is not a published review, approved handoff, or manufacturing release gate.',
          'Use Verify Local Release Evidence to inspect the separate release bundle.'
        ].join('\n');
      } catch {
        // Treat CLI output as untrusted and do not expose stderr, paths or tokens.
        services.logger.error('BoardReadyOps structured review preview failed');
        failed = true;
      }
    }
  );
  if (unsupportedVersion) {
    void vscode.window.showWarningMessage(
      `BoardReadyOps ${unsupportedVersion} does not provide the supported structured review JSON contract. Review preview is unavailable; local release evidence verification is still supported.`
    );
  } else if (failed) {
    void vscode.window.showErrorMessage(
      'BoardReadyOps did not return compatible structured review evidence. No upload was performed.'
    );
  } else if (summary) {
    const document = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: summary
    });
    await vscode.window.showTextDocument(document, { preview: true });
  }
}

/**
 * Register BoardReadyOps commands.
 */
export function registerBoardReadyOpsCommands(
  services: CommandServices
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.boardReadyOpsCheck, async () => {
      if (!(await requireWorkspaceTrust('BoardReadyOps check'))) return;
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

      // A cancelled or failed rerun must not leave a stale report.
      latestReport = undefined;

      // Close the cancellable progress notification before asking the user to
      // review diagnostics. A modal/notification can wait indefinitely for a
      // selection and must not keep an already completed CLI run "running".
      let completion: { summaryText: string; findings: number } | undefined;
      let failure: Error | undefined;
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

            const { stdout, exitCode } = await runBoardReadyOps(
              projectPath,
              specFile || undefined,
              token
            );

            if (token.isCancellationRequested) {
              return;
            }

            const result = parseBoardReadyOpsRunResult(stdout);
            assertBoardReadyOpsRunVerdict(result, exitCode);

            // Verify every untrusted finding path before changing any existing
            // diagnostics. One escaped path invalidates the whole CLI response.
            const findingsByFile = new Map<string, BoardReadyOpsFinding[]>();
            for (const finding of result.findings) {
              let fullPath: string;
              try {
                fullPath = resolveSafeWorkspacePath(
                  projectPath,
                  finding.resource.path,
                  'BoardReadyOps finding must stay inside the active project.'
                );
              } catch {
                // Never include an untrusted path or filesystem exception in logs/UI.
                throw new Error(
                  'BoardReadyOps returned a finding outside the active project.'
                );
              }
              const uriStr = vscode.Uri.file(fullPath).toString();
              const grouped = findingsByFile.get(uriStr) ?? [];
              grouped.push(finding);
              findingsByFile.set(uriStr, grouped);
            }

            latestReport = { projectRoot: projectPath, result };

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

            completion = { summaryText, findings: summary.total };
          } catch (err) {
            services.logger.error('BoardReadyOps check failed', err);
            failure = err instanceof Error ? err : new Error(String(err));
          }
        }
      );
      if (failure) {
        void vscode.window.showErrorMessage(
          `BoardReadyOps check failed: ${(failure as Error).message}`
        );
        return;
      }
      if (completion) {
        if (completion.findings > 0) {
          const choice = await vscode.window.showWarningMessage(
            completion.summaryText,
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
      }
    }),

    vscode.commands.registerCommand(
      COMMANDS.boardReadyOpsReviewEvidence,
      async () => {
        if (!(await requireWorkspaceTrust('BoardReadyOps review evidence')))
          return;
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
            'No active KiCad project found. Open a project to review BoardReadyOps evidence.'
          );
          return;
        }
        const choice = await vscode.window.showQuickPick(
          [
            { label: 'Verify local release evidence', id: 'verify' },
            {
              label: 'Preview cloud review metadata (dry run, no upload)',
              id: 'preview'
            },
            { label: 'Open BoardReadyOps web governance dashboard', id: 'web' }
          ],
          {
            title: 'BoardReadyOps — Review and Evidence',
            placeHolder:
              'Choose a safe evidence workflow; cloud publishing is never automatic'
          }
        );
        if (choice?.id === 'verify') {
          await showBoardReadyOpsEvidenceState(services);
        } else if (choice?.id === 'preview') {
          await previewBoardReadyOpsReview(projectPath, services);
        } else if (choice?.id === 'web') {
          await vscode.env.openExternal(
            vscode.Uri.parse('https://app.boardreadyops.com/')
          );
        }
      }
    ),

    vscode.commands.registerCommand(COMMANDS.boardReadyOpsPlan, async () => {
      if (!(await requireWorkspaceTrust('BoardReadyOps remediation plan')))
        return;
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
      let planOptions:
        | Array<vscode.QuickPickItem & { action: BoardReadyOpsPlanAction }>
        | undefined;
      let noActions = false;
      let failure: string | undefined;
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
            assertBoardReadyOpsPlanVerdict(plan, exitCode);
            // The CLI plan is untrusted. Validate every referenced resource,
            // including hidden release actions, before displaying any action.
            // Never expose the rejected path or filesystem error to UI/logs.
            try {
              resolveSafeWorkspacePath(
                projectPath,
                plan.projectRoot,
                'BoardReadyOps plan must remain inside the active project.'
              );
              for (const action of [
                ...plan.nextActions,
                ...plan.releaseActions
              ]) {
                resolveSafeWorkspacePath(
                  projectPath,
                  action.resource.path,
                  'BoardReadyOps action must remain inside the active project.'
                );
              }
            } catch {
              throw new Error(
                'BoardReadyOps returned a path outside the active project.'
              );
            }
            const actions = plan.nextActions.length
              ? plan.nextActions
              : plan.releaseActions;
            if (actions.length === 0) {
              noActions = true;
              return;
            }
            planOptions = actions.map((action) => ({
              label: action.title,
              description: action.ruleId,
              // Long step lists truncate in VS Code QuickPick; show the first
              // step here and the complete advisory plan after selection.
              detail:
                action.fixStrategy.steps[0] ?? action.fixStrategy.description,
              action
            }));
          } catch (err) {
            const safeError =
              err instanceof Error
                ? err.message
                : 'Unknown BoardReadyOps plan error.';
            services.logger.error('BoardReadyOps plan failed', safeError);
            failure = safeError;
          }
        }
      );
      if (failure) {
        void vscode.window.showErrorMessage(
          `BoardReadyOps plan failed: ${failure}`
        );
      } else if (noActions) {
        void vscode.window.showInformationMessage(
          'BoardReadyOps did not report any remediation or release actions.'
        );
      } else if (planOptions) {
        const selected = await vscode.window.showQuickPick(planOptions, {
          title: 'BoardReadyOps Remediation Plan',
          placeHolder:
            'Select an action to read its steps (no automatic changes)'
        });
        if (selected) {
          const action = selected.action;
          // CLI-provided content is untrusted. Show it only as inert plaintext;
          // never treat suggested commands as executable links or shell input.
          const content = [
            'BoardReadyOps remediation action',
            '',
            `Action: ${action.title}`,
            `Rule: ${action.ruleId}`,
            `Severity: ${action.severity}`,
            `Affected file: ${action.resource.path}`,
            '',
            `Why it matters: ${action.whyItMatters}`,
            '',
            'Recommended steps:',
            ...action.fixStrategy.steps.map(
              (step, index) => `${index + 1}. ${step}`
            ),
            '',
            'Verification commands (not executed):',
            ...action.commandsToVerify.map((command) => `  ${command}`),
            '',
            'Advisory only: KiCad Studio has not changed any files or run these commands.'
          ].join('\n');
          const document = await vscode.workspace.openTextDocument({
            language: 'plaintext',
            content
          });
          await vscode.window.showTextDocument(document, { preview: true });
        }
      }
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
        if (!(await requireWorkspaceTrust('BoardReadyOps release evidence')))
          return;
        const activeProjectPath =
          services.projectState.getActiveProject()?.rootPath;
        const enabled = vscode.workspace
          .getConfiguration()
          .get<boolean>(SETTINGS.boardReadyOpsEnabled, false);
        const report =
          enabled && activeProjectPath === latestReport?.projectRoot
            ? latestReport?.result
            : undefined;
        if (!report) {
          await vscode.window.showInformationMessage(
            localize('boardReadyOpsReportNotAvailable')
          );
          return;
        }

        const summary = report.summary;
        const summaryText = `BoardReadyOps Report: ${report.status === 'passed' ? 'Passed' : 'Failed'}. Total findings: ${summary.total} (${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low, ${summary.info} info).`;

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
