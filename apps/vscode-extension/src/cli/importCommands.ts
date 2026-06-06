import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { KiCadCliRunner } from './kicadCliRunner';
import { KiCadCliDetector } from './kicadCliDetector';
import { Logger } from '../utils/logger';

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
  geda: 'KiCad 10 PCB Editor supports gEDA/Lepton import, but this kicad-cli build does not advertise gEDA format. Use KiCad PCB Editor File > Import > Non-KiCad Board File until a KiCad CLI build advertises gEDA import.'
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

    const resolvedFormat = format === 'auto' ? undefined : format;
    const label = resolvedFormat
      ? PCB_IMPORT_FORMAT_LABELS[resolvedFormat]
      : 'PCB';
    const selection = await vscode.window.showOpenDialog({
      title: resolvedFormat
        ? `Import ${label} board`
        : 'Import board (auto-detect format)',
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false
    });
    const inputFile = selection?.[0]?.fsPath;
    if (!inputFile) {
      return;
    }

    const detectFormat = resolvedFormat ?? autoDetectImportFormat(inputFile);
    if (!detectFormat) {
      void vscode.window.showWarningMessage(
        `Could not auto-detect import format for ${path.extname(inputFile)}. Select a specific format instead.`
      );
      return;
    }

    const outputFile = path.join(
      path.dirname(inputFile),
      `${path.parse(inputFile).name}.kicad_pcb`
    );

    try {
      const detected = await this.detector.detect();
      const kicadVersion = detected?.version ?? 'unknown';

      const cmdArgs = [
        'pcb',
        'import',
        ...(detectFormat !== 'auto' ? ['--format', detectFormat] : []),
        '--output',
        outputFile,
        inputFile
      ];

      await this.runner.runWithProgress<string>({
        command: cmdArgs,
        cwd: path.dirname(inputFile),
        progressTitle: `Importing ${label} board`
      });

      const projectFile = await ensureProjectForImportedBoard(outputFile);

      // Write import manifest
      const manifestPath = path.join(
        path.dirname(outputFile),
        `${path.parse(outputFile).name}_import_manifest.json`
      );
      const manifestData = {
        projectPath: projectFile,
        boardPath: outputFile,
        sourceFormat: detectFormat,
        cliCommand: `kicad-cli ${cmdArgs.join(' ')}`,
        kicadVersion,
        timestamp: new Date().toISOString()
      };
      await fs.promises.writeFile(
        manifestPath,
        JSON.stringify(manifestData, null, 2) + '\n',
        'utf8'
      );

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
    if (format === 'auto') {
      return true;
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

const IMPORT_EXTENSION_MAP: Array<{
  extensions: string[];
  format: SupportedPcbImportFormat;
}> = [
  { extensions: ['.asc', '.pads', '.pads_pcb'], format: 'pads' },
  { extensions: ['.pcbdoc', '.pcb'], format: 'altium' },
  { extensions: ['.brd', '.sch'], format: 'eagle' },
  { extensions: ['.cba', '.cad'], format: 'cadstar' },
  { extensions: ['.fab', '.tgz'], format: 'fabmaster' },
  { extensions: ['.pcb', '.pcad'], format: 'pcad' },
  { extensions: ['.gbr', '.sch'], format: 'geda' },
  { extensions: ['.sldprt', '.sldasm'], format: 'solidworks' },
  { extensions: ['.brd', '.allegro'], format: 'allegro' }
];

function autoDetectImportFormat(
  filePath: string
): SupportedPcbImportFormat | undefined {
  const ext = path.extname(filePath).toLowerCase();
  for (const mapping of IMPORT_EXTENSION_MAP) {
    if (mapping.extensions.includes(ext)) {
      return mapping.format;
    }
  }
  return undefined;
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
