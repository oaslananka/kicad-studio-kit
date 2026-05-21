import * as path from 'node:path';
import * as vscode from 'vscode';
import type { QualityGateResult } from '../types';
import {
  showStructuredError,
  structuredErrorFromUnknown,
  troubleshootingUri
} from '../utils/notifications';
import { telemetry } from '../utils/telemetry';
import type { CommandServices } from './types';

export async function runManufacturingReleaseWizard(
  services: Pick<CommandServices, 'variantProvider' | 'mcpAdapter' | 'context'>
): Promise<void> {
  telemetry.trackEvent('wizard.start');
  const variant = await chooseVariant(services);
  if (typeof variant === 'undefined') {
    return;
  }

  try {
    const gates = await services.mcpAdapter.runProjectQualityGate();
    const blocking = gates.filter((gate) =>
      ['FAIL', 'BLOCKED'].includes(gate.status)
    );
    if (blocking.length) {
      telemetry.trackEvent('wizard.blocked');
      void vscode.window.showWarningMessage(formatBlockedMessage(blocking));
      return;
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const defaultOutput = root
      ? path.join(
          root,
          'output',
          `release-${variant || 'default'}-${new Date()
            .toISOString()
            .replace(/[:.]/g, '-')}`
        )
      : '';
    await vscode.window.showInputBox({
      title: 'Manufacturing release output folder',
      value: defaultOutput,
      prompt:
        'kicad-mcp-pro 1.0.0 uses its configured output directory; this path is recorded for user confirmation.'
    });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Running manufacturing release',
        cancellable: false
      },
      async () => {
        await services.mcpAdapter.exportManufacturingPackage(
          variant || undefined
        );
      }
    );
    telemetry.trackEvent('wizard.success');
    if (defaultOutput) {
      await vscode.commands.executeCommand(
        'revealFileInOS',
        vscode.Uri.file(defaultOutput)
      );
    }
  } catch (error) {
    const structured = structuredErrorFromUnknown(error);
    const message = error instanceof Error ? error.message : String(error);
    telemetry.trackEvent('wizard.failure', {
      code: structured?.code ?? 'TOOL_EXECUTION_FAILED'
    });
    if (structured) {
      await showStructuredError(
        structured,
        troubleshootingUri(services.context.extensionUri, structured.code)
      );
      return;
    }
    const choice = await vscode.window.showErrorMessage(
      message,
      'Open Output Channel',
      'Re-run Wizard'
    );
    if (choice === 'Re-run Wizard') {
      await runManufacturingReleaseWizard(services);
    }
  }
}

async function chooseVariant(
  services: Pick<CommandServices, 'variantProvider'>
): Promise<string | undefined> {
  const variants = await services.variantProvider.listVariants();
  if (variants.length === 0) {
    void vscode.window.showInformationMessage(
      'No KiCad variants found. Using the default release variant.'
    );
    return '';
  }
  if (variants.length === 1) {
    return variants[0]?.name ?? '';
  }
  return vscode.window.showQuickPick(
    variants.map((variant) => variant.name),
    {
      title: 'Select release variant'
    }
  );
}

function formatBlockedMessage(gates: QualityGateResult[]): string {
  const hints = gates
    .flatMap((gate) => gate.violations.map((violation) => violation.hint))
    .filter((hint): hint is string => Boolean(hint));
  return [
    'Manufacturing release is blocked by quality gates.',
    ...gates.map((gate) => `${gate.label}: ${gate.summary}`),
    ...hints
  ].join('\n');
}
