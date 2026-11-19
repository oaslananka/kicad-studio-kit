import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { KiCadCliRunner } from './kicadCliRunner';
import { KiCadCliDetector } from './kicadCliDetector';
import { Logger } from '../utils/logger';
import { assessUndefinedImportLayers } from './importLayerMapping';

export const PCB_IMPORT_FORMATS = [
  'auto',
  'pads',
  'altium',
  'eagle',
  'cadstar',
  'fabmaster',
  'pcad',
  'geda',
  'solidworks',
  'allegro'
] as const;

export type SupportedPcbImportFormat = (typeof PCB_IMPORT_FORMATS)[number];

const PCB_IMPORT_FORMAT_LABELS: Record<SupportedPcbImportFormat, string> = {
  auto: 'Auto-detect',
  pads: 'PADS',
  altium: 'Altium',
  eagle: 'Eagle',
  cadstar: 'CADSTAR',
  fabmaster: 'Fabmaster',
  pcad: 'P-CAD',
  geda: 'gEDA/Lepton',
  solidworks: 'SolidWorks',
  allegro: 'Allegro'
};

const PCB_IMPORT_UNSUPPORTED_HINTS: Partial<
  Record<SupportedPcbImportFormat, string>
> = {
  allegro:
    'KiCad 10 PCB Editor supports Allegro .brd import, but this kicad-cli build does not expose --format allegro. Use KiCad PCB Editor File > Import > Non-KiCad Board File until a KiCad CLI build advertises Allegro import.',
  geda: 'gEDA/Lepton board import was removed from kicad-cli after KiCad 9.x. Use KiCad PCB Editor File > Import > Non-KiCad File for gEDA boards, or migrate via KiCad 9.x CLI.'
};

export class KiCadImportService {
  constructor(
    private readonly runner: KiCadCliRunner,
    private readonly detector: KiCadCliDetector,
    private readonly logger: Logger
  ) {}

  async importBoard(format: SupportedPcbImportFormat): Promise<void> {
    if (!(await this.isImportFormatSupported(format))) {
      if (format !== 'auto') {
        void vscode.window.showWarningMessage(unsupportedImportMessage(format));
      } else {
        const learnMore = 'Learn More';
        const selection = await vscode.window.showWarningMessage(
          'PCB import is not supported by your KiCad CLI version. KiCad 10.0 or newer is required.',
          learnMore
        );
        if (selection === learnMore) {
          void vscode.env.openExternal(
            vscode.Uri.parse('https://www.kicad.org/download/')
          );
        }
      }
      return;
    }

    const label = PCB_IMPORT_FORMAT_LABELS[format];
    const selection = await vscode.window.showOpenDialog({
      title: `Import ${label} board`,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false
    });
    const inputFile = selection?.[0]?.fsPath;
    if (!inputFile) {
      return;
    }

    const outputFile = path.join(
      path.dirname(inputFile),
      `${path.parse(inputFile).name}.kicad_pcb`
    );

    // Never let a new conversion overwrite an existing KiCad PCB before
    // the user has inspected the generated result or its layer mappings.
    if (fs.existsSync(outputFile)) {
      void vscode.window.showWarningMessage(
        `Cannot import ${path.basename(inputFile)} because ${path.basename(outputFile)} already exists. Rename or move the existing PCB first; no files were changed.`
      );
      return;
    }

    const formatArgs = format === 'auto' ? [] : ['--format', format];
    // The CLI runner already redacts and logs its output. Retain only enough
    // progress text to summarize import warnings after the dialog closes.
    let progressOutput = '';
    const progressCaptureLimit = 64 * 1024;

    try {
      await this.runner.runWithProgress<string>({
        command: [
          'pcb',
          'import',
          ...formatArgs,
          '--output',
          outputFile,
          inputFile
        ],
        cwd: path.dirname(inputFile),
        progressTitle: `Importing ${label} board`,
        onProgress: (message) => {
          if (progressOutput.length < progressCaptureLimit) {
            progressOutput +=
              '\n' +
              message.slice(0, progressCaptureLimit - progressOutput.length);
          }
        }
      });

      const repaired = await validateImportedBoardOrOfferRepair(
        outputFile,
        this.runner
      );
      if (repaired === undefined) {
        return; // User declined repair or KiCad emitted an unsafe mapping.
      }

      const projectFile = await ensureProjectForImportedBoard(outputFile);
      await vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(projectFile)
      );
      const message =
        repaired === null
          ? `Imported ${path.basename(inputFile)} as ${path.basename(outputFile)}.`
          : `Imported ${path.basename(inputFile)} after mapping ${repaired.count} drawing-only objects to Dwgs.User. The unmodified KiCad import was saved as ${repaired.backupName}. Review the layers and run DRC before manufacturing.`;
      const warningSummary = summarizeImportWarnings(progressOutput);
      if (warningSummary) {
        const action = 'View Import Log';
        void Promise.resolve(
          vscode.window.showWarningMessage(
            `${message} ${warningSummary}`,
            action
          )
        ).then((selected) => {
          if (selected === action) {
            this.logger.show();
          }
        });
      } else {
        void vscode.window.showInformationMessage(message);
      }
    } catch (error) {
      this.logger.error(`Import ${format} failed`, error);
      void vscode.window.showErrorMessage(
        error instanceof Error ? error.message : `Import failed for ${format}.`
      );
    }
  }

  async getImportFormatSupportSnapshot(
    formats: readonly SupportedPcbImportFormat[] = PCB_IMPORT_FORMATS
  ): Promise<Partial<Record<SupportedPcbImportFormat, boolean>>> {
    const entries = await Promise.all(
      formats.map(async (format) => {
        try {
          return [format, await this.isImportFormatSupported(format)] as const;
        } catch (error) {
          this.logger.error(`Import support probe for ${format} failed`, error);
          return [format, false] as const;
        }
      })
    );
    return Object.fromEntries(entries);
  }

  async isImportFormatSupported(
    format: SupportedPcbImportFormat
  ): Promise<boolean> {
    if (!(await this.detector.hasCapability('pcbImport'))) {
      return false;
    }
    const help = await this.detector.getCommandHelp(['pcb', 'import']);
    if (!help) {
      return false;
    }
    return importFormatHelpPattern(format).test(help);
  }
}

/**
 * A successful kicad-cli process is not enough: KiCad 10 can emit unresolved
 * pseudo-layers that make the resulting PCB unreadable by its own CLI.
 *
 * Never silently rewrite imported engineering data. Only a user's explicit
 * repair decision permits relocating non-copper footprint drawings.
 * The original CLI output is preserved before an atomic replacement.
 */
async function validateImportedBoardOrOfferRepair(
  outputFile: string,
  runner: KiCadCliRunner
): Promise<{ count: number; backupName: string } | null | undefined> {
  const stat = await fs.promises.stat(outputFile).catch(() => undefined);
  if (!stat?.isFile() || stat.size === 0) {
    throw new Error(
      'KiCad reported an import, but no nonempty PCB file was created.'
    );
  }

  const importedText = await fs.promises.readFile(outputFile, 'utf8');
  const assessment = assessUndefinedImportLayers(importedText);
  if (assessment.count === 0) {
    return null;
  }

  if (assessment.repairedText === undefined) {
    void vscode.window.showWarningMessage(
      `KiCad imported ${assessment.count} undefined layer references, including shapes that cannot safely be remapped. This board is not ready to view or export. Resolve the layers in KiCad PCB Editor; the imported output was left unchanged.`
    );
    return undefined;
  }

  const choice = await vscode.window.showWarningMessage(
    `KiCad imported ${assessment.count} drawing-only objects on undefined layers. The board cannot be reliably opened or exported. Map these drawing-only objects to Dwgs.User and preserve the untouched KiCad import? Check the drawings in KiCad afterwards.`,
    { modal: true },
    'Repair drawing layers'
  );
  if (choice !== 'Repair drawing layers') {
    return undefined;
  }

  const backupName = `${path.basename(outputFile)}.unmapped-original`;
  const backupPath = path.join(path.dirname(outputFile), backupName);
  if (fs.existsSync(backupPath)) {
    throw new Error(
      'The original import backup already exists. Move or rename that backup before repairing again.'
    );
  }

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'kicadstudio-pcb-import-')
  );
  const replacementPath = `${outputFile}.repair-${process.pid}-${Date.now()}`;
  let replacementCreated = false;
  try {
    const candidate = path.join(tempDir, path.basename(outputFile));
    const svgProof = path.join(tempDir, 'kicad-import-validation.svg');
    await fs.promises.writeFile(candidate, assessment.repairedText, 'utf8');
    // A genuine KiCad CLI round-trip is the acceptance gate, not a text regex.
    await runner.runWithProgress<string>({
      command: [
        'pcb',
        'export',
        'svg',
        '--layers',
        'F.Cu,F.SilkS,Edge.Cuts',
        '--mode-single',
        '--output',
        svgProof,
        candidate
      ],
      cwd: tempDir,
      progressTitle: 'Validating imported PCB drawings'
    });
    const svgStat = await fs.promises.stat(svgProof);
    if (!svgStat.isFile() || svgStat.size < 100) {
      throw new Error('KiCad did not produce a usable validation SVG.');
    }
    await fs.promises.copyFile(
      outputFile,
      backupPath,
      fs.constants.COPYFILE_EXCL
    );
    await fs.promises.copyFile(
      candidate,
      replacementPath,
      fs.constants.COPYFILE_EXCL
    );
    replacementCreated = true;
    await fs.promises.rename(replacementPath, outputFile);
    replacementCreated = false;
    return { count: assessment.count, backupName };
  } finally {
    if (replacementCreated) {
      await fs.promises.rm(replacementPath, { force: true });
    }
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function summarizeImportWarnings(progressOutput: string): string | undefined {
  const warningCount = (progressOutput.match(/\bwarning\s*:/gi) ?? []).length;
  if (warningCount === 0) {
    return undefined;
  }

  const unmappedCount = (
    progressOutput.match(/No user layer to put layer/gi) ?? []
  ).length;
  const description =
    unmappedCount > 0
      ? `${unmappedCount} unmapped source layers` +
        (warningCount > unmappedCount
          ? ` and ${warningCount - unmappedCount} other warnings`
          : '')
      : `${warningCount} warning${warningCount === 1 ? '' : 's'}`;
  return `KiCad reported ${description}; source data may be missing. Please verify the board before manufacturing.`;
}

function unsupportedImportMessage(format: SupportedPcbImportFormat): string {
  const label = PCB_IMPORT_FORMAT_LABELS[format];
  const base = `This KiCad CLI does not advertise ${label} PCB import support.`;
  const hint = PCB_IMPORT_UNSUPPORTED_HINTS[format];
  return hint ? `${base} ${hint}` : base;
}

function importFormatHelpPattern(format: SupportedPcbImportFormat): RegExp {
  return new RegExp(`\\b${escapeRegExp(format)}\\b`, 'i');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureProjectForImportedBoard(
  boardFile: string
): Promise<string> {
  const projectFile = path.join(
    path.dirname(boardFile),
    `${path.parse(boardFile).name}.kicad_pro`
  );

  if (!fs.existsSync(projectFile)) {
    await fs.promises.writeFile(
      projectFile,
      `${JSON.stringify(
        {
          meta: {
            filename: path.parse(boardFile).name,
            version: 1
          },
          board: {
            file: path.basename(boardFile)
          }
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  }

  return projectFile;
}
