import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { KiCadCliRunner } from './kicadCliRunner';
import { KiCadCliDetector } from './kicadCliDetector';
import { Logger } from '../utils/logger';

export type SupportedPcbImportFormat =
  | 'pads'
  | 'altium'
  | 'eagle'
  | 'cadstar'
  | 'fabmaster'
  | 'pcad'
  | 'geda'
  | 'solidworks';

export class KiCadImportService {
  constructor(
    private readonly runner: KiCadCliRunner,
    private readonly detector: KiCadCliDetector,
    private readonly logger: Logger
  ) {}

  async importBoard(format: SupportedPcbImportFormat): Promise<void> {
    if (!(await this.isImportFormatSupported(format))) {
      void vscode.window.showWarningMessage(
        `This KiCad CLI does not advertise ${format} PCB import support.`
      );
      return;
    }

    const selection = await vscode.window.showOpenDialog({
      title: `Import ${format} board`,
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
        progressTitle: `Importing ${format} board`
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

  private async isImportFormatSupported(
    format: SupportedPcbImportFormat
  ): Promise<boolean> {
    if (!(await this.detector.hasCapability('pcbImport'))) {
      return false;
    }
    const help = await this.detector.getCommandHelp(['pcb', 'import']);
    if (!help) {
      return false;
    }
    if (format === 'geda') {
      return /\bgeda\b/i.test(help);
    }
    return new RegExp(`\\b${escapeRegExp(format)}\\b`, 'i').test(help);
  }
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
