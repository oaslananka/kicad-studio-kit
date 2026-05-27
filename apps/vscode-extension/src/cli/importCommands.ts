import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { KiCadCliRunner } from './kicadCliRunner';
import { KiCadCliDetector } from './kicadCliDetector';
import { Logger } from '../utils/logger';

export const PCB_IMPORT_FORMATS = [
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
    'KiCad 10 PCB Editor supports Allegro .brd import, but this kicad-cli build does not expose --format allegro. Use KiCad PCB Editor File > Import > Non-KiCad Board File until a KiCad CLI build advertises Allegro import.'
};

export class KiCadImportService {
  constructor(
    private readonly runner: KiCadCliRunner,
    private readonly detector: KiCadCliDetector,
    private readonly logger: Logger
  ) {}

  async importBoard(format: SupportedPcbImportFormat): Promise<void> {
    if (!(await this.isImportFormatSupported(format))) {
      void vscode.window.showWarningMessage(unsupportedImportMessage(format));
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

    try {
      await this.runner.runWithProgress<string>({
        command: [
          'pcb',
          'import',
          '--format',
          format,
          '--output',
          outputFile,
          inputFile
        ],
        cwd: path.dirname(inputFile),
        progressTitle: `Importing ${label} board`
      });

      const projectFile = await ensureProjectForImportedBoard(outputFile);
      await vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(projectFile)
      );
      void vscode.window.showInformationMessage(
        `Imported ${path.basename(inputFile)} as ${path.basename(outputFile)}.`
      );
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
