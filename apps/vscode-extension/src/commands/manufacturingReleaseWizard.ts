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
import {
  assertWorkspaceTrusted,
  resolveGuardedPath
} from '../security/guardedOperations';
import {
  buildReleaseManifest,
  collectGitMetadata,
  renderReleaseSummary,
  type GitMetadata,
  type KiCadSnapshot,
  type ReleaseGateSummary,
  type ReleaseManifestFileEntry
} from './releaseManifest';
import type { CommandServices } from './types';

export async function runManufacturingReleaseWizard(
  services: Pick<
    CommandServices,
    'variantProvider' | 'mcpAdapter' | 'context' | 'cliDetector'
  >
): Promise<void> {
  telemetry.trackEvent('wizard.start');
  const variant = await chooseVariant(services);
  if (typeof variant === 'undefined') {
    return;
  }

  let outputDir: string | undefined;
  try {
    // A manufacturing release writes a bundle to disk; gate it on workspace
    // trust through the centralized guard rather than menu visibility alone.
    assertWorkspaceTrusted('Manufacturing release');
    const gates = await services.mcpAdapter.runProjectQualityGate();
    const blocking = gates.filter((gate) =>
      ['FAIL', 'BLOCKED'].includes(gate.status)
    );
    if (blocking.length) {
      telemetry.trackEvent('wizard.blocked');
      void vscode.window.showWarningMessage(formatBlockedMessage(blocking));
      return;
    }

    const gateSummaries: ReleaseGateSummary[] = gates.map((gate) => ({
      label: gate.label,
      status: gate.status,
      summary: gate.summary
    }));

    const mode = await vscode.window.showQuickPick(
      [
        {
          label: '$(rocket) Create release bundle',
          detail:
            'Export artifacts and write the release manifest and summary.',
          dryRun: false
        },
        {
          label: '$(eye) Preview (dry run)',
          detail: 'Show the release plan without exporting or writing files.',
          dryRun: true
        }
      ],
      { title: 'Manufacturing release mode' }
    );
    if (!mode) {
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
    // Resolve + canonicalize the user-supplied output folder and confine it to
    // the workspace (defeats `..` traversal and symlink escape). Throws a safe
    // GuardedOperationError on escape, handled by the catch below.
    outputDir = resolveGuardedPath({
      requestedPath: outputDirInput,
      workspaceRoot: root,
      label: 'Manufacturing release output folder'
    });

    // Capability/version snapshot and source-control metadata for the manifest.
    const capabilitySnapshot =
      await services.cliDetector.getCapabilitySnapshot();
    const kicadSnapshot: KiCadSnapshot | undefined = capabilitySnapshot
      ? {
          version:
            typeof capabilitySnapshot.version === 'string'
              ? capabilitySnapshot.version
              : undefined,
          capabilities: Object.entries(capabilitySnapshot)
            .filter(([, value]) => value === true)
            .map(([key]) => key)
            .sort()
        }
      : undefined;
    const git = root ? collectGitMetadata(root) : undefined;

    if (mode.dryRun) {
      telemetry.trackEvent('wizard.dryRun');
      await showDryRunPreview({
        outputDir,
        variant,
        gateSummaries,
        kicadSnapshot,
        git
      });
      return;
    }

    if (!kicadSnapshot) {
      const proceed = await vscode.window.showWarningMessage(
        'No kicad-cli was detected locally. The release will rely on the MCP server for exports. Continue?',
        { modal: true },
        'Continue'
      );
      if (proceed !== 'Continue') {
        return;
      }
    }

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

    // Write release-manifest.json and a human-readable summary report.
    await writeReleaseEvidence(outputDir, {
      ...(variant ? { variant } : {}),
      files: filesGenerated,
      mcpResult,
      gateSummaries,
      ...(kicadSnapshot ? { kicadSnapshot } : {}),
      ...(git ? { git } : {})
    });

    telemetry.trackEvent('wizard.success');
    if (outputDir) {
      await vscode.commands.executeCommand(
        'revealFileInOS',
        vscode.Uri.file(outputDir)
      );
    }
  } catch (error) {
    if (outputDir) {
      await markReleaseIncomplete(outputDir, error);
    }
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

async function writeReleaseEvidence(
  outputDir: string,
  options: {
    variant?: string;
    files: string[];
    mcpResult?: Record<string, unknown> | undefined;
    gateSummaries: ReleaseGateSummary[];
    kicadSnapshot?: KiCadSnapshot;
    git?: GitMetadata;
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
  const fileEntries: ReleaseManifestFileEntry[] = [];
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

  const mcpServerVersion = options.mcpResult?.['serverVersion'] as
    | string
    | undefined;

  const manifest = buildReleaseManifest({
    extensionVersion,
    timestamp: new Date().toISOString(),
    ...(options.variant ? { variant: options.variant } : {}),
    ...(options.git ? { git: options.git } : {}),
    ...(options.kicadSnapshot ? { kicad: options.kicadSnapshot } : {}),
    ...(mcpServerVersion ? { mcpServerVersion } : {}),
    ...(projectFile
      ? { projectFile: path.relative(outputDir, projectFile) }
      : {}),
    ...(boardFile ? { boardFile: path.relative(outputDir, boardFile) } : {}),
    ...(schematicFile
      ? { schematicFile: path.relative(outputDir, schematicFile) }
      : {}),
    qualityGates: options.gateSummaries,
    files: fileEntries
  });

  await writeOutputFile(
    outputDir,
    'release-manifest.json',
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await writeOutputFile(
    outputDir,
    'RELEASE-SUMMARY.md',
    renderReleaseSummary(manifest)
  );
}

async function writeOutputFile(
  outputDir: string,
  name: string,
  content: string
): Promise<void> {
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(path.join(outputDir, name)),
    new TextEncoder().encode(content)
  );
}

async function showDryRunPreview(plan: {
  outputDir: string;
  variant?: string;
  gateSummaries: ReleaseGateSummary[];
  kicadSnapshot?: KiCadSnapshot | undefined;
  git?: GitMetadata | undefined;
}): Promise<void> {
  const detail = [
    `Output folder: ${plan.outputDir}`,
    `Variant: ${plan.variant || 'default'}`,
    `KiCad CLI: ${plan.kicadSnapshot?.version ?? 'not detected'}`,
    plan.git?.shortCommit
      ? `Source: ${plan.git.shortCommit}${plan.git.dirty ? ' (uncommitted changes)' : ''}`
      : 'Source: not a git repository',
    `Quality gates: ${
      plan.gateSummaries
        .map((gate) => `${gate.label}=${gate.status}`)
        .join(', ') || 'none'
    }`,
    '',
    'No files were written (dry run).'
  ].join('\n');
  await vscode.window.showInformationMessage(
    'Manufacturing release preview',
    { modal: true, detail },
    'OK'
  );
}

async function markReleaseIncomplete(
  outputDir: string,
  error: unknown
): Promise<void> {
  try {
    if (!fs.existsSync(outputDir)) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    await writeOutputFile(
      outputDir,
      'RELEASE-INCOMPLETE.txt',
      [
        'This manufacturing release did not complete successfully.',
        'Artifacts in this folder may be partial and must not be used for fabrication.',
        '',
        `Failure: ${message}`,
        `Time: ${new Date().toISOString()}`,
        ''
      ].join('\n')
    );
  } catch {
    // Best-effort marker; never mask the original failure.
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
