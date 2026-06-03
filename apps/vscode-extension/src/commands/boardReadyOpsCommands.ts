import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { COMMANDS, SETTINGS } from '../constants';
import { localize } from '../i18n';
import type { CommandServices } from './types';

/** URL for BoardReadyOps documentation. */
export const BOARDREADYOPS_DOCS_URL =
  'https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/board-ready-ops.md';

interface BoardReadyOpsFinding {
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  resource: {
    path: string;
    kind: string;
  };
  location?: {
    line?: number;
    column?: number;
    region?: {
      startLine: number;
      endLine: number;
      startColumn?: number;
      endColumn?: number;
    };
  };
}

interface BoardReadyOpsRunResult {
  status?: 'passed' | 'failed';
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  findings: BoardReadyOpsFinding[];
}

let latestReport: BoardReadyOpsRunResult | undefined = undefined;
const previousDiagnosticUris = new Set<string>();

function runBoardReadyOps(
  projectPath: string,
  specFile: string | undefined,
  token: vscode.CancellationToken
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = ['boardreadyops', 'run', '--format', 'json'];
    if (specFile) {
      args.push('--config', specFile);
    }
    args.push(projectPath);

    const child = spawn(cmd, args, {
      cwd: projectPath,
      env: { ...process.env },
      shell: false
    });

    let stdout = '';
    let stderr = '';

    const disposable = token.onCancellationRequested(() => {
      child.kill();
    });

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      disposable.dispose();
      reject(err);
    });

    child.on('close', (code) => {
      disposable.dispose();
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
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
            const { stdout, stderr } = await runBoardReadyOps(
              projectPath,
              specFile || undefined,
              token
            );

            if (token.isCancellationRequested) {
              return;
            }

            let result: BoardReadyOpsRunResult;
            try {
              result = JSON.parse(stdout.trim());
            } catch (err) {
              throw new Error(
                `BoardReadyOps returned invalid output: ${stdout || '(no output)'}. Stderr: ${stderr}`,
                { cause: err }
              );
            }

            latestReport = result;

            // Clear previous BoardReadyOps diagnostics
            const aggregator = services.diagnosticsCollection as any;
            const setDiagnostics = (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
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
                if (finding.severity === 'critical' || finding.severity === 'high') {
                  severity = vscode.DiagnosticSeverity.Error;
                } else if (finding.severity === 'medium' || finding.severity === 'low') {
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
            'Show Problems'
          );
          if (choice === 'Show Problems') {
            await vscode.commands.executeCommand(
              'workbench.actions.view.problems'
            );
          }
        } else {
          await vscode.window.showInformationMessage(summaryText);
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
