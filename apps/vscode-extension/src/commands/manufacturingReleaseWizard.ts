import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
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
    const outputDirInput = await vscode.window.showInputBox({
      title: 'Manufacturing release output folder',
      value: defaultOutput,
      prompt: 'Output directory for the manufacturing release package.'
    });
    if (!outputDirInput) {
      return;
    }
    const outputDir = path.isAbsolute(outputDirInput)
      ? outputDirInput
      : root
        ? path.resolve(root, outputDirInput)
        : path.resolve(outputDirInput);

    let mcpResult: Record<string, unknown> | undefined;
    const filesGenerated: string[] = [];

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Running manufacturing release',
        cancellable: false
      },
      async () => {
        mcpResult = await services.mcpAdapter.exportManufacturingPackage(
          variant || undefined
        );
      }
    );

    // Collect generated file paths from MCP result
    if (mcpResult && typeof mcpResult['files'] === 'object') {
      const resultFiles = mcpResult['files'];
      if (Array.isArray(resultFiles)) {
        for (const f of resultFiles) {
          if (typeof f === 'string') {
            filesGenerated.push(f);
          }
        }
      }
    }

    // Scan output directory for any generated files
    if (fs.existsSync(outputDir)) {
      try {
        const entries = fs.readdirSync(outputDir, { recursive: true });
        for (const entry of entries) {
          if (typeof entry === 'string') {
            const fullPath = path.join(outputDir, entry);
            try {
              if (fs.statSync(fullPath).isFile()) {
                if (!filesGenerated.includes(fullPath)) {
                  filesGenerated.push(fullPath);
                }
              }
            } catch {
              // Skip files that cannot be stat'd (permission/broken symlink)
            }
          }
        }
      } catch {
        // Non-fatal: best-effort scan
      }
    }

    // Generate manifest.json
    await generateManifest(outputDir, {
      ...(variant ? { variant } : {}),
      files: filesGenerated,
      mcpResult
    });

    telemetry.trackEvent('wizard.success');
    if (outputDir) {
      await vscode.commands.executeCommand(
        'revealFileInOS',
        vscode.Uri.file(outputDir)
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

interface ManifestEntry {
  extensionVersion: string;
  timestamp: string;
  variant?: string;
  projectFile?: string;
  boardFile?: string;
  schematicFile?: string;
  files: ManifestFileEntry[];
  qualityGates: boolean;
  mcpServerVersion?: string;
}

interface ManifestFileEntry {
  path: string;
  size: number;
  sha256: string;
}

async function generateManifest(
  outputDir: string,
  options: {
    variant?: string;
    files: string[];
    mcpResult?: Record<string, unknown> | undefined;
  }
): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const extension = vscode.extensions.getExtension(
    'oaslananka.kicad-studio-kit'
  );
  const extensionVersion = extension?.packageJSON?.version ?? 'unknown';

  // Identify project files from workspace
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let projectFile: string | undefined;
  let boardFile: string | undefined;
  let schematicFile: string | undefined;

  if (root) {
    try {
      const entries = fs.readdirSync(root);
      for (const entry of entries) {
        if (entry.endsWith('.kicad_pro')) {
          projectFile = path.join(root, entry);
        } else if (entry.endsWith('.kicad_pcb')) {
          boardFile = path.join(root, entry);
        } else if (entry.endsWith('.kicad_sch')) {
          schematicFile = path.join(root, entry);
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Compute checksums for generated files
  const fileEntries: ManifestFileEntry[] = [];
  const seenPaths = new Set<string>();
  for (const filePath of options.files) {
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(outputDir, filePath);
      if (seenPaths.has(absolutePath)) {
        continue;
      }
      seenPaths.add(absolutePath);
      const fileUri = vscode.Uri.file(absolutePath);
      try {
        const stat = await vscode.workspace.fs.stat(fileUri);
        const content = await vscode.workspace.fs.readFile(fileUri);
        const hash = crypto
          .createHash('sha256')
          .update(Buffer.from(content))
          .digest('hex');
        fileEntries.push({
          path: path.relative(outputDir, absolutePath),
          size: stat.size,
          sha256: hash
        });
      } catch {
        // Skip unreadable files
      }
    } catch {
      // Skip invalid paths
    }
  }

  const manifest: ManifestEntry = {
    extensionVersion,
    timestamp: new Date().toISOString(),
    ...(options.variant !== undefined && options.variant !== ''
      ? { variant: options.variant }
      : {}),
    ...(projectFile
      ? { projectFile: path.relative(outputDir, projectFile) }
      : {}),
    ...(boardFile ? { boardFile: path.relative(outputDir, boardFile) } : {}),
    ...(schematicFile
      ? { schematicFile: path.relative(outputDir, schematicFile) }
      : {}),
    files: fileEntries,
    qualityGates: true,
    ...((options.mcpResult?.['serverVersion'] as string | undefined)
      ? {
          mcpServerVersion: options.mcpResult?.['serverVersion'] as string
        }
      : {})
  };

  const manifestPath = path.join(outputDir, 'manifest.json');
  const manifestBytes = new TextEncoder().encode(
    JSON.stringify(manifest, null, 2)
  );
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(manifestPath),
    manifestBytes
  );
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
