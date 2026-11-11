import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { COMMANDS, SETTINGS } from '../constants';
import {
  CliExitError,
  KiCadCliCancelledError,
  KiCadCliNotFoundError
} from '../errors';
import { BomExporter } from '../bom/bomExporter';
import { BomParser } from '../bom/bomParser';
import { parseNativeKiCadBomCsv } from '../bom/nativeBomCsv';
import type { ExportPreset } from '../types';
import {
  ensureDirectory,
  inferOutputPath,
  readTextFileSync
} from '../utils/fileUtils';
import {
  assertPathInside,
  findSiblingProjectFile,
  isKiCadFile,
  resolveSafeWorkspacePath,
  resolveWorkspaceOutputDir
} from '../utils/pathUtils';
import { Logger } from '../utils/logger';
import { getActiveResourceUri } from '../utils/workspaceUtils';
import { zipDirectory } from '../utils/zipUtils';
import { KiCadCliDetector } from './kicadCliDetector';
import { ExportPresetStore } from './exportPresets';
import { KiCadCliRunner } from './kicadCliRunner';
import type { ExportStateStore, ExportSurfaceKind } from '../state/stateStores';
import {
  buildExportCommands,
  type ExportCommandBuildOptions,
  type ExportCommandKind
} from './exportCommandBuilder';

const INCOMPATIBLE_MULTI_SHEET_BOM_ERROR =
  'A complete multi-sheet BOM needs a compatible KiCad CLI. Configure KiCad and try again.';

export type {
  ExportCommandBuildOptions,
  ExportCommandKind
} from './exportCommandBuilder';
export { buildExportCommands } from './exportCommandBuilder';

export function buildCliExportCommands(
  kind: ExportCommandKind,
  file: string,
  outputDir: string,
  options: ExportCommandBuildOptions = {}
): string[][] {
  const config = vscode.workspace.getConfiguration();
  return buildExportCommands(kind, file, outputDir, {
    ...options,
    precision:
      options.precision ??
      String(config.get<number>(SETTINGS.gerberPrecision, 6)),
    ipcVersion:
      options.ipcVersion ?? config.get<string>(SETTINGS.ipcVersion, 'C'),
    ipcUnits: options.ipcUnits ?? config.get<string>(SETTINGS.ipcUnits, 'mm'),
    theme: options.theme ?? config.get<string>(SETTINGS.viewerTheme, 'dark'),
    bomFields: options.bomFields ?? config.get<string[]>(SETTINGS.bomFields, [])
  });
}

export async function discoverGerberLayers(file: string): Promise<string[]> {
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    const layers = Array.from(
      raw.matchAll(/\(\s*\d+\s+"([^"]+)"\s+[A-Za-z_.-]+(?:\s+"[^"]+")?\s*\)/g),
      (match) => match[1]
    ).filter((entry): entry is string => Boolean(entry));

    return [...new Set(layers)];
  } catch {
    return [];
  }
}

export class KiCadExportService {
  constructor(
    private readonly runner: KiCadCliRunner,
    private readonly detector: KiCadCliDetector,
    private readonly bomParser: BomParser,
    private readonly bomExporter: BomExporter,
    private readonly presets: ExportPresetStore,
    private readonly logger: Logger,
    private readonly exportState?: ExportStateStore | undefined
  ) {}

  async exportGerbers(resource?: vscode.Uri): Promise<void> {
    await this.runCliExport(
      'export-gerbers',
      resource,
      ['.kicad_pcb'],
      'Exporting Gerbers'
    );
  }

  async exportGerbersWithDrill(resource?: vscode.Uri): Promise<void> {
    await this.runCliExport(
      'export-gerbers-with-drill',
      resource,
      ['.kicad_pcb'],
      'Exporting Gerbers and drill files'
    );
  }

  async exportPDF(resource?: vscode.Uri): Promise<void> {
    await this.runCliExport(
      'export-pdf-sch',
      resource,
      ['.kicad_sch'],
      'Exporting schematic PDF'
    );
  }

  async exportPCBPDF(resource?: vscode.Uri): Promise<void> {
    await this.runCliExport(
      'export-pdf-pcb',
      resource,
      ['.kicad_pcb'],
      'Exporting PCB PDF'
    );
  }

  async export3DPdf(resource?: vscode.Uri): Promise<void> {
    const detected = await this.detector.detect(true);
    if (!detected) {
      void vscode.window.showWarningMessage(
        '3D PDF export requires a detected KiCad 10+ kicad-cli.'
      );
      return;
    }
    const versionMajor = Number(detected.version.split('.')[0] ?? '0');
    if (versionMajor < 10) {
      void vscode.window.showWarningMessage(
        `3D PDF export requires KiCad 10 or later; detected ${detected.versionLabel}.`
      );
      return;
    }
    if (!(await this.detector.hasCapability('pdf3d'))) {
      void vscode.window.showWarningMessage(
        `${detected.versionLabel} does not expose kicad-cli pcb export 3dpdf.`
      );
      return;
    }
    await this.runCliExport(
      'export-3d-pdf',
      resource,
      ['.kicad_pcb'],
      'Exporting 3D PDF'
    );
  }

  async exportSVG(resource?: vscode.Uri): Promise<void> {
    const file = await this.resolveTargetFile(resource, [
      '.kicad_sch',
      '.kicad_pcb'
    ]);
    if (!file) {
      return;
    }
    const outputDir = this.tryResolveOutputDir(file);
    if (!outputDir) {
      return;
    }
    const buildOptions = await this.getBuildOptions(
      file,
      file.endsWith('.kicad_pcb')
    );
    const exported = await this.runCommandSequence(
      buildCliExportCommands('export-svg', file, outputDir, buildOptions),
      path.dirname(file),
      'Exporting SVG'
    );
    if (!exported) {
      return;
    }
    await this.showOutputFolder(outputDir);
  }

  async renderViewerSvg(resource: vscode.Uri): Promise<string | undefined> {
    const file = await this.resolveTargetFile(resource, [
      '.kicad_sch',
      '.kicad_pcb'
    ]);
    if (!file) {
      return undefined;
    }

    const detected = await this.detector.detect();
    const versionMajor = Number(detected?.version.split('.')[0] ?? '0');
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-viewer-svg-')
    );
    try {
      const buildOptions = await this.getBuildOptions(file);
      const commands = file.endsWith('.kicad_pcb')
        ? this.buildViewerPcbSvgFallbackCommands(file, tempRoot, versionMajor)
        : buildCliExportCommands('export-svg', file, tempRoot, buildOptions);

      for (const command of commands) {
        await this.runner.run({
          command,
          cwd: path.dirname(file),
          progressTitle: 'Preparing viewer SVG fallback'
        });
      }

      const svgPath = this.findViewerSvgOutput(tempRoot, file, commands);
      return svgPath ? fs.readFileSync(svgPath, 'utf8') : undefined;
    } catch (error) {
      this.logger.warn(
        `Inline SVG fallback export failed for ${file}: ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  /**
   * Opt-in read-only inspection of one genuine outer or inner copper layer.
   * Copy the source to a disposable directory: KiCad can emit .kicad_prl
   * beside its input, which must never touch the user's working project.
   * This does not refill zones or claim electrical/DRC completeness.
   */
  async renderViewerNativeInnerCopperLayer(
    resource: vscode.Uri,
    layer: string,
    boundedSource?: string,
    sourcePageCoordinates = false
  ): Promise<string | undefined> {
    if (
      !vscode.workspace.isTrusted ||
      resource.scheme !== 'file' ||
      !/^(?:F|B|In(?:[1-9]|[12]\d|30))\.Cu$/.test(layer)
    ) {
      return undefined;
    }
    const folder = vscode.workspace.getWorkspaceFolder(resource);
    if (!folder) return undefined;
    let file: string;
    let original: fs.Stats;
    try {
      file = resolveSafeWorkspacePath(
        folder.uri.fsPath,
        resource.fsPath,
        'KiCad board must stay inside the trusted workspace.'
      );
      if (path.extname(file).toLowerCase() !== '.kicad_pcb') return undefined;
      original = fs.statSync(file);
      if (!original.isFile() || original.size > 80 * 1024 * 1024) {
        return undefined;
      }
    } catch {
      return undefined;
    }
    if (
      (sourcePageCoordinates && boundedSource !== undefined) ||
      (boundedSource !== undefined &&
        (Buffer.byteLength(boundedSource, 'utf8') > 4 * 1024 * 1024 ||
          !boundedSource.startsWith('(kicad_pcb')))
    ) {
      return undefined;
    }
    const detected = await this.detector.detect();
    if (Number(detected?.version.split('.')[0] ?? '0') < 9) {
      return undefined;
    }
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-inner-copper-')
    );
    try {
      const snapshot = path.join(tempRoot, 'source.kicad_pcb');
      const output = path.join(tempRoot, 'copper.svg');
      if (boundedSource === undefined) {
        fs.copyFileSync(file, snapshot);
        const afterCopy = fs.statSync(file);
        if (
          afterCopy.size !== original.size ||
          afterCopy.mtimeMs !== original.mtimeMs
        ) {
          return undefined;
        }
      } else {
        // The trusted editor supplied its *already bounded* server-side
        // source selection, never the full original design.
        fs.writeFileSync(snapshot, boundedSource, 'utf8');
      }
      await this.runner.run({
        command: [
          'pcb',
          'export',
          'svg',
          '--output',
          output,
          '--layers',
          layer,
          '--mode-single',
          '--exclude-drawing-sheet',
          '--page-size-mode',
          // Page coordinates are genuine PCB millimetres. The explicitly
          // requested original plot can focus on a known source viewport;
          // the normal fitted-board plot keeps its existing compact mode.
          sourcePageCoordinates ? '0' : '2',
          '--drill-shape-opt',
          '2',
          snapshot
        ],
        cwd: tempRoot,
        progressTitle: 'Inspecting native KiCad copper'
      });
      if (!fs.existsSync(output)) return undefined;
      const stat = fs.statSync(output);
      if (stat.size > 4 * 1024 * 1024) return undefined;
      const svg = fs.readFileSync(output, 'utf8');
      return svg.includes('<svg') && svg.includes('Image generated by PCBNEW')
        ? svg
        : undefined;
    } catch {
      // Keep the original interactive viewer; never leak local paths to UI.
      return undefined;
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  async exportIPC2581(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('ipc2581'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support IPC-2581 export.'
      );
      return;
    }
    await this.runCliExport(
      'export-ipc2581',
      resource,
      ['.kicad_pcb'],
      'Exporting IPC-2581'
    );
  }

  async exportODB(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('odb'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support ODB++ export.'
      );
      return;
    }
    await this.runCliExport(
      'export-odb',
      resource,
      ['.kicad_pcb'],
      'Exporting ODB++'
    );
  }

  async export3DGLB(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('glb'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support GLB export.'
      );
      return;
    }
    await this.runCliExport(
      'export-glb',
      resource,
      ['.kicad_pcb'],
      'Exporting 3D GLB'
    );
  }

  async export3DBREP(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('brep'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support BREP export.'
      );
      return;
    }
    await this.runCliExport(
      'export-brep',
      resource,
      ['.kicad_pcb'],
      'Exporting 3D BREP'
    );
  }

  async export3DPLY(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('ply'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support PLY export.'
      );
      return;
    }
    await this.runCliExport(
      'export-ply',
      resource,
      ['.kicad_pcb'],
      'Exporting 3D PLY'
    );
  }

  async export3DStep(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('step'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support STEP export.'
      );
      return;
    }
    await this.runCliExport(
      'export-step',
      resource,
      ['.kicad_pcb'],
      'Exporting 3D STEP'
    );
  }

  async export3DStpz(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('stpz'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support STEPZ export.'
      );
      return;
    }
    await this.runCliExport(
      'export-stpz',
      resource,
      ['.kicad_pcb'],
      'Exporting 3D STEPZ'
    );
  }

  async export3DXao(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('xao'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support XAO export.'
      );
      return;
    }
    await this.runCliExport(
      'export-xao',
      resource,
      ['.kicad_pcb'],
      'Exporting 3D XAO'
    );
  }

  async export3DStl(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('stl'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support STL export.'
      );
      return;
    }
    await this.runCliExport(
      'export-stl',
      resource,
      ['.kicad_pcb'],
      'Exporting 3D STL'
    );
  }

  async export3DU3d(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('u3d'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support U3D export.'
      );
      return;
    }
    await this.runCliExport(
      'export-u3d',
      resource,
      ['.kicad_pcb'],
      'Exporting 3D U3D'
    );
  }

  async export3DVrml(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('vrml'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support VRML export.'
      );
      return;
    }
    await this.runCliExport(
      'export-vrml',
      resource,
      ['.kicad_pcb'],
      'Exporting 3D VRML'
    );
  }

  async exportPcbPs(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('psPcb'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support PostScript PCB export.'
      );
      return;
    }
    await this.runCliExport(
      'export-ps-pcb',
      resource,
      ['.kicad_pcb'],
      'Exporting PCB PostScript'
    );
  }

  async exportSchPs(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('psSch'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support PostScript schematic export.'
      );
      return;
    }
    await this.runCliExport(
      'export-ps-sch',
      resource,
      ['.kicad_sch'],
      'Exporting Schematic PostScript'
    );
  }

  async exportStats(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('stats'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support board statistics export.'
      );
      return;
    }
    await this.runCliExport(
      'export-stats',
      resource,
      ['.kicad_pcb'],
      'Exporting board statistics'
    );
  }

  async exportGenCAD(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('gencad'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support GenCAD export.'
      );
      return;
    }
    await this.runCliExport(
      'export-gencad',
      resource,
      ['.kicad_pcb'],
      'Exporting GenCAD'
    );
  }

  async exportIPCD356(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('ipcd356'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support IPC-D-356 export.'
      );
      return;
    }
    await this.runCliExport(
      'export-ipcd356',
      resource,
      ['.kicad_pcb'],
      'Exporting IPC-D-356'
    );
  }

  async exportDXF(resource?: vscode.Uri): Promise<void> {
    const file = await this.resolveTargetFile(resource, [
      '.kicad_sch',
      '.kicad_pcb'
    ]);
    if (!file) {
      return;
    }
    if (!(await this.detector.hasCapability('dxf'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support DXF export for this target.'
      );
      return;
    }
    const outputDir = this.tryResolveOutputDir(file);
    if (!outputDir) {
      return;
    }
    const buildOptions = await this.getBuildOptions(file);
    const exported = await this.runCommandSequence(
      buildCliExportCommands('export-dxf', file, outputDir, buildOptions),
      path.dirname(file),
      'Exporting DXF'
    );
    if (!exported) {
      return;
    }
    await this.showOutputFolder(outputDir);
  }

  async exportPickAndPlace(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('pos'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support pick-and-place export.'
      );
      return;
    }
    await this.runCliExport(
      'export-pos',
      resource,
      ['.kicad_pcb'],
      'Exporting pick-and-place positions'
    );
  }

  async exportFootprintSVG(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('fpSvg'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support footprint SVG export.'
      );
      return;
    }
    await this.runCliExport(
      'export-fp-svg',
      resource,
      ['.kicad_mod'],
      'Exporting footprint SVG'
    );
  }

  async exportSymbolSVG(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('symSvg'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support symbol SVG export.'
      );
      return;
    }
    await this.runCliExport(
      'export-sym-svg',
      resource,
      ['.kicad_sym'],
      'Exporting symbol SVG'
    );
  }

  async exportBOMCSV(resource?: vscode.Uri): Promise<void> {
    await this.exportBomInternal(resource, 'csv');
  }

  async exportBOMXLSX(resource?: vscode.Uri): Promise<void> {
    await this.exportBomInternal(resource, 'xlsx');
  }

  async exportNetlist(resource?: vscode.Uri): Promise<void> {
    await this.runCliExport(
      'export-netlist',
      resource,
      ['.kicad_sch'],
      'Exporting netlist'
    );
  }

  async exportInteractiveBOM(resource?: vscode.Uri): Promise<void> {
    const file = await this.resolveTargetFile(resource, ['.kicad_sch']);
    if (!file) {
      return;
    }
    const outputDir = this.tryResolveOutputDir(file);
    if (!outputDir) {
      return;
    }
    const outputFile = inferOutputPath(file, outputDir, '-ibom', '.html');
    const entries = await this.loadBomEntries(file);
    await this.bomExporter.exportInteractiveHtml(entries, outputFile);
    await this.showOutputFolder(outputDir);
  }

  async runJobset(resource?: vscode.Uri): Promise<void> {
    if (!(await this.detector.hasCapability('jobset'))) {
      void vscode.window.showWarningMessage(
        'This KiCad version does not support jobset execution.'
      );
      return;
    }

    const jobsetFile = await this.resolveTargetFile(resource, [
      '.kicad_jobset'
    ]);
    if (!jobsetFile) {
      return;
    }

    const projectFile = await this.resolveProjectForJobset(jobsetFile);
    if (!projectFile) {
      return;
    }

    const config = vscode.workspace.getConfiguration();
    const stopOnError = config.get<boolean>(SETTINGS.jobsetStopOnError, true);

    let outputDir = this.tryResolveOutputDir(projectFile);
    if (!outputDir) {
      return;
    }

    const pickDir = await vscode.window.showQuickPick(
      [
        {
          label: `$(folder) Use default output: ${path.basename(outputDir)}`,
          dir: outputDir
        },
        { label: '$(file-directory) Choose custom output directory', dir: '' }
      ],
      { title: 'Jobset output directory' }
    );
    if (!pickDir) {
      return;
    }
    if (!pickDir.dir) {
      const chosen = await vscode.window.showOpenDialog({
        title: 'Select output directory for jobset',
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false
      });
      if (!chosen?.[0]) {
        return;
      }
      outputDir = chosen[0].fsPath;
    }

    try {
      this.logger.info(
        `Running jobset ${path.basename(jobsetFile)} with project ${path.basename(projectFile)}`
      );

      await this.runner.runWithProgress<string>({
        command: [
          'jobset',
          'run',
          '--file',
          jobsetFile,
          '--output',
          outputDir,
          projectFile
        ],
        cwd: path.dirname(projectFile),
        progressTitle: `Running jobset ${path.basename(jobsetFile)}`
      });

      void vscode.window
        .showInformationMessage(
          `Jobset "${path.basename(jobsetFile)}" completed.`,
          'Open Output Folder'
        )
        .then((action) => {
          if (action === 'Open Output Folder') {
            void vscode.env.openExternal(vscode.Uri.file(outputDir));
          }
        });
    } catch (error) {
      this.logger.error(`Jobset ${path.basename(jobsetFile)} failed`, error);
      const message =
        error instanceof Error
          ? `${error.message}\nWhat happened: jobset execution failed.\nHow to fix: validate the jobset file and verify kicad-cli is functional.`
          : 'Jobset execution failed. Validate the jobset file and verify kicad-cli is functional.';
      void vscode.window.showErrorMessage(message);
      if (stopOnError) {
        return;
      }
    }
  }

  private async resolveProjectForJobset(
    jobsetFile: string
  ): Promise<string | undefined> {
    const siblingProject = findSiblingProjectFile(jobsetFile);
    if (siblingProject) {
      return siblingProject;
    }

    const workspaceProjectFiles = await vscode.workspace.findFiles(
      '**/*.kicad_pro',
      '**/node_modules/**',
      20
    );

    if (workspaceProjectFiles.length === 0) {
      void vscode.window.showWarningMessage(
        'No .kicad_pro project file found in the workspace.'
      );
      return undefined;
    }

    if (workspaceProjectFiles.length === 1) {
      return workspaceProjectFiles[0]?.fsPath;
    }

    const picked = await vscode.window.showQuickPick(
      workspaceProjectFiles.map((uri) => ({
        label: path.basename(uri.fsPath),
        description: path.dirname(uri.fsPath),
        uri
      })),
      {
        title: 'Select project file for jobset execution',
        placeHolder:
          'Multiple projects found; choose the one associated with this jobset.'
      }
    );

    return picked?.uri.fsPath;
  }

  async exportManufacturingPackage(resource?: vscode.Uri): Promise<void> {
    const pcbFile = await this.resolveTargetFile(resource, ['.kicad_pcb']);
    if (!pcbFile) {
      return;
    }

    const profile = await vscode.window.showQuickPick(
      [
        {
          label: 'generic',
          description: 'Gerber, drill, BOM, pick-and-place, manifest'
        },
        { label: 'jlcpcb', description: 'JLCPCB-oriented package layout' },
        { label: 'pcbway', description: 'PCBWay-oriented package layout' }
      ],
      { title: 'Manufacturing package profile' }
    );
    if (!profile) {
      return;
    }

    const rootOutputDir = this.tryResolveOutputDir(pcbFile);
    if (!rootOutputDir) {
      return;
    }
    const packageName = `${path.parse(pcbFile).name}-${profile.label}-manufacturing`;
    const stagingDir = path.join(rootOutputDir, packageName);
    assertPathInside(
      rootOutputDir,
      stagingDir,
      'Manufacturing staging directory must stay inside the generated output root.'
    );
    fs.rmSync(stagingDir, { recursive: true, force: true });
    ensureDirectory(stagingDir);

    const exportedGerbers = await this.runCommandSequence(
      buildCliExportCommands(
        'export-gerbers-with-drill',
        pcbFile,
        stagingDir,
        await this.getBuildOptions(pcbFile, true)
      ),
      path.dirname(pcbFile),
      `Exporting ${profile.label} manufacturing Gerbers`
    );
    if (!exportedGerbers) {
      return;
    }

    if (await this.detector.hasCapability('pos')) {
      const exportedPositions = await this.runCommandSequence(
        buildCliExportCommands(
          'export-pos',
          pcbFile,
          stagingDir,
          await this.getBuildOptions(pcbFile)
        ),
        path.dirname(pcbFile),
        `Exporting ${profile.label} pick-and-place`
      );
      if (!exportedPositions) {
        return;
      }
    }

    const schematicFile = await this.findSiblingSchematic(pcbFile);
    if (schematicFile) {
      const entries = await this.loadBomEntries(schematicFile);
      await this.bomExporter.exportCsv(
        entries,
        path.join(stagingDir, `${path.parse(pcbFile).name}-bom.csv`)
      );
    }

    await fs.promises.writeFile(
      path.join(stagingDir, 'manifest.json'),
      JSON.stringify(
        {
          createdBy: 'KiCad Studio',
          profile: profile.label,
          pcbFile: path.basename(pcbFile),
          schematicFile: schematicFile
            ? path.basename(schematicFile)
            : undefined,
          includes: {
            gerbers: true,
            drill: true,
            bom: Boolean(schematicFile),
            pickAndPlace: await this.detector.hasCapability('pos')
          }
        },
        null,
        2
      ),
      'utf8'
    );

    const zipFile = path.join(rootOutputDir, `${packageName}.zip`);
    await zipDirectory(stagingDir, zipFile);
    await this.showOutputFolder(rootOutputDir);
  }

  async savePreset(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      [
        {
          label: 'Gerbers + Drill',
          commands: [COMMANDS.exportGerbersWithDrill]
        },
        {
          label: 'PDF Pack',
          commands: [COMMANDS.exportPDF, COMMANDS.exportPCBPDF]
        },
        {
          label: 'Manufacturing Pack',
          commands: [
            COMMANDS.exportGerbersWithDrill,
            COMMANDS.exportIPC2581,
            COMMANDS.exportODB
          ]
        }
      ],
      { title: 'Choose commands to store in an export preset' }
    );
    if (!picked) {
      return;
    }

    const name = await vscode.window.showInputBox({
      title: 'Preset name',
      placeHolder: 'Fab release'
    });
    if (!name) {
      return;
    }

    const preset: ExportPreset = {
      name,
      commands: picked.commands
    };
    await this.presets.save(preset);
    await this.presets.rememberLastUsed(name);
    void vscode.window.showInformationMessage(`Saved export preset "${name}".`);
  }

  async runPreset(): Promise<void> {
    const presets = this.presets.getAll();
    const picked = await vscode.window.showQuickPick(
      presets.map((preset) => ({
        label: preset.name,
        description: preset.commands.join(', '),
        preset
      })),
      { title: 'Run export preset' }
    );
    if (!picked) {
      return;
    }

    await this.presets.rememberLastUsed(picked.preset.name);
    for (const command of picked.preset.commands) {
      await vscode.commands.executeCommand(command);
    }
  }

  /** KiCad CLI owns hierarchy truth. The offline parser is safe only for a flat schematic. */
  private async loadBomEntries(file: string) {
    const text = readTextFileSync(file);
    if (!this.bomParser.hasSubSheets(text)) {
      return this.bomParser.parse(text);
    }

    if (!(await this.detector.hasCapability('bom'))) {
      throw new Error(INCOMPATIBLE_MULTI_SHEET_BOM_ERROR);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-bom-'));
    const temporaryBom = path.join(tempDir, 'complete.csv');
    try {
      await this.runner.runWithProgress<string>({
        command: [
          'sch',
          'export',
          'bom',
          '--output',
          temporaryBom,
          '--fields',
          'Reference,Value,Footprint,QUANTITY,DNP,MPN,Manufacturer,LCSC,Description',
          '--labels',
          'Reference,Value,Footprint,Quantity,DNP,MPN,Manufacturer,LCSC,Description',
          file
        ],
        cwd: path.dirname(file),
        progressTitle: 'Collecting the complete multi-sheet BOM'
      });
      const raw = fs.readFileSync(temporaryBom, 'utf8');
      const groupIdentical = vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.bomGroupIdentical, true);
      const entries = parseNativeKiCadBomCsv(raw, groupIdentical);
      if (entries.length === 0) {
        throw new Error(
          'KiCad returned an empty multi-sheet BOM; export stopped.'
        );
      }
      return entries;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private async exportBomInternal(
    resource: vscode.Uri | undefined,
    format: 'csv' | 'xlsx'
  ): Promise<void> {
    const file = await this.resolveTargetFile(resource, ['.kicad_sch']);
    if (!file) return;

    const outputDir = this.tryResolveOutputDir(file);
    if (!outputDir) return;
    const outputFile = inferOutputPath(
      file,
      outputDir,
      '-bom',
      format === 'csv' ? '.csv' : '.xlsx'
    );
    const uri = vscode.Uri.file(file);
    this.exportState?.begin(
      'bom',
      uri,
      `Exporting BOM ${format.toUpperCase()}.`
    );
    try {
      const entries = await this.loadBomEntries(file);
      if (format === 'csv') {
        await this.bomExporter.exportCsv(entries, outputFile);
      } else {
        await this.bomExporter.exportXlsx(entries, outputFile);
      }
      this.exportState?.complete(
        'bom',
        uri,
        `BOM ${format.toUpperCase()} exported.`
      );
      await this.showOutputFolder(outputDir);
    } catch (error) {
      this.handleBomExportFailure(error, uri, outputDir, outputFile);
    }
  }

  private handleBomExportFailure(
    error: unknown,
    uri: vscode.Uri,
    outputDir: string,
    outputFile: string
  ): void {
    if (error instanceof KiCadCliCancelledError) {
      this.exportState?.cancel('bom', uri, 'BOM export cancelled by user.');
      this.logger.info('BOM export cancelled by user.');
      void vscode.window.showInformationMessage(
        'BOM export cancelled. No new BOM file was saved. You can retry.'
      );
      return;
    }
    if (error instanceof KiCadCliNotFoundError) {
      this.exportState?.fail(
        'bom',
        uri,
        'Configured KiCad CLI executable is unavailable.'
      );
      this.logger.error('BOM export failed', 'CLI_NOT_FOUND');
      void vscode.window.showErrorMessage(
        'BOM export failed. KiCad CLI executable is no longer available. How to fix: restore the configured KiCad CLI path or configure a valid KiCad CLI, then retry.'
      );
      return;
    }
    if (
      error instanceof Error &&
      error.message === INCOMPATIBLE_MULTI_SHEET_BOM_ERROR
    ) {
      this.exportState?.fail('bom', uri, INCOMPATIBLE_MULTI_SHEET_BOM_ERROR);
      this.logger.error(
        'BOM export failed',
        INCOMPATIBLE_MULTI_SHEET_BOM_ERROR
      );
      void vscode.window.showErrorMessage(
        'BOM export failed. A complete multi-sheet BOM needs a compatible KiCad CLI. Configure KiCad and retry.'
      );
      return;
    }
    if (error instanceof CliExitError) {
      this.exportState?.fail(
        'bom',
        uri,
        'KiCad CLI stopped before completing the BOM export.'
      );
      this.logger.error('BOM export failed', 'CLI_EXIT_' + error.code);
      void vscode.window.showErrorMessage(
        'BOM export failed. KiCad CLI stopped before completing the export. No final BOM file was saved. Check the KiCad project and CLI configuration, then retry.'
      );
      return;
    }
    if (isBomOutputPermissionFailure(error, outputDir, outputFile)) {
      this.exportState?.fail(
        'bom',
        uri,
        'The BOM output folder is not writable.'
      );
      this.logger.error('BOM export failed', outputDirectoryErrorCode(error));
      void vscode.window.showErrorMessage(
        'BOM export failed. The output folder is not writable. How to fix: choose a writable folder inside this workspace or grant write access, then retry.'
      );
      return;
    }
    this.exportState?.fail('bom', uri, error);
    this.logger.error('BOM export failed', error);
    void vscode.window.showErrorMessage(
      'BOM export failed. Verify that the complete project opens in KiCad and retry.'
    );
  }

  private async runCliExport(
    kind: ExportCommandKind,
    resource: vscode.Uri | undefined,
    expectedExtensions: string[],
    title: string
  ): Promise<void> {
    const file = await this.resolveTargetFile(resource, expectedExtensions);
    if (!file) {
      return;
    }

    const outputDir = this.tryResolveOutputDir(file);
    if (!outputDir) {
      return;
    }
    const uri = vscode.Uri.file(file);
    const surfaceKind = exportSurfaceFor(kind);
    this.exportState?.begin(surfaceKind, uri, title);
    const buildOptions = await this.getBuildOptions(
      file,
      kind === 'export-gerbers' ||
        kind === 'export-gerbers-with-drill' ||
        kind === 'export-pdf-pcb'
    );
    const exported = await this.runCommandSequence(
      buildCliExportCommands(kind, file, outputDir, buildOptions),
      path.dirname(file),
      title
    );
    if (!exported) {
      this.exportState?.fail(surfaceKind, uri, `${title} failed.`);
      return;
    }
    this.exportState?.complete(surfaceKind, uri, `${title} completed.`);
    await this.showOutputFolder(outputDir);
  }

  private async runCommandSequence(
    commands: string[][],
    cwd: string,
    title: string
  ): Promise<boolean> {
    try {
      for (const [index, command] of commands.entries()) {
        await this.runner.runWithProgress<string>({
          command,
          cwd,
          progressTitle: `${title} (${index + 1}/${commands.length})`,
          onProgress: (message) => {
            this.logger.debug(`${title}: ${message}`);
          }
        });
      }
      return true;
    } catch (error) {
      this.logger.error(title, error);
      const plyRequiresNewerOcct =
        title === 'Exporting 3D PLY' &&
        error instanceof CliExitError &&
        /PLY export is not supported before OCCT 7\.7\.0/i.test(error.stderr);
      const message = plyRequiresNewerOcct
        ? 'PLY export is unavailable in this KiCad installation: its Open CASCADE (OCCT) library is older than 7.7.0. Use a KiCad build with OCCT 7.7.0 or newer, or export 3D Model (STL) or (GLB) instead.'
        : error instanceof Error
          ? `${error.message}\nWhat happened: the export command failed.\nHow to fix: confirm kicad-cli is installed and the target file opens in KiCad.`
          : 'The export command failed. Confirm kicad-cli is installed and the target file opens in KiCad.';
      void vscode.window.showErrorMessage(message);
      return false;
    }
  }

  private showOutputFolder(outputDir: string): Promise<void> {
    const action = 'Open Output Folder';
    // A notification can stay open until the user acts. Do not hold the
    // export command (or the next command in a saved preset) waiting for it.
    void Promise.resolve(
      vscode.window.showInformationMessage(
        'Export completed successfully.',
        action
      )
    )
      .then(async (selected) => {
        if (selected === action) {
          await vscode.env.openExternal(vscode.Uri.file(outputDir));
        }
      })
      .catch(() => {
        this.logger.warn('Could not open the exported output folder.');
      });
    // The notification remains interactive; only the export work is complete.
    return Promise.resolve();
  }

  private resolveOutputDir(file: string): string {
    const configured = vscode.workspace
      .getConfiguration()
      .get<string>(SETTINGS.outputDir, 'fab');
    const outputDir = resolveWorkspaceOutputDir(file, configured);
    ensureDirectory(outputDir);
    return outputDir;
  }

  private tryResolveOutputDir(file: string): string | undefined {
    try {
      return this.resolveOutputDir(file);
    } catch (error) {
      this.logger.error(
        'Resolving output directory failed',
        outputDirectoryErrorCode(error)
      );
      void vscode.window.showErrorMessage(outputDirectoryFailureMessage(error));
      return undefined;
    }
  }

  private buildViewerPcbSvgFallbackCommands(
    file: string,
    outputDir: string,
    versionMajor: number
  ): string[][] {
    if (versionMajor < 9) {
      return buildCliExportCommands('export-svg', file, outputDir);
    }

    const outputFile = path.join(
      outputDir,
      `${path.parse(file).name}-viewer.svg`
    );
    const layers = this.resolveViewerPcbFallbackLayers(file);
    return [
      [
        'pcb',
        'export',
        'svg',
        '--output',
        outputFile,
        '--layers',
        layers.join(','),
        '--mode-single',
        '--page-size-mode',
        '0',
        '--drill-shape-opt',
        '0',
        file
      ]
    ];
  }

  private resolveViewerPcbFallbackLayers(file: string): string[] {
    const preferredLayers = [
      'F.Cu',
      'In1.Cu',
      'In2.Cu',
      'In3.Cu',
      'In4.Cu',
      'B.Cu',
      'F.SilkS',
      'B.SilkS',
      'F.Mask',
      'B.Mask',
      'Edge.Cuts',
      'F.Fab',
      'B.Fab',
      'Dwgs.User',
      'Cmts.User'
    ];

    try {
      const raw = fs.readFileSync(file, 'utf8');
      const definedLayers = Array.from(
        raw.matchAll(
          /\(\s*\d+\s+"([^"]+)"\s+[A-Za-z_.-]+(?:\s+"[^"]+")?\s*\)/g
        ),
        (match) => match[1]
      ).filter((entry): entry is string => Boolean(entry));

      if (!definedLayers.length) {
        return preferredLayers;
      }

      const defined = new Set(definedLayers);
      const ordered = preferredLayers.filter((layer) => defined.has(layer));
      const remainingCopper = definedLayers.filter(
        (layer) => /\.Cu$/i.test(layer) && !ordered.includes(layer)
      );
      const remainingUseful = definedLayers.filter(
        (layer) =>
          !ordered.includes(layer) &&
          !remainingCopper.includes(layer) &&
          /(?:\.SilkS|\.Mask|\.Fab)$/i.test(layer)
      );

      return [...new Set([...ordered, ...remainingCopper, ...remainingUseful])];
    } catch {
      return preferredLayers;
    }
  }

  private findViewerSvgOutput(
    outputDir: string,
    sourceFile: string,
    commands: string[][]
  ): string | undefined {
    for (const command of commands) {
      const outputIndex = command.indexOf('--output');
      const configuredOutput =
        outputIndex >= 0 ? command[outputIndex + 1] : undefined;
      if (
        typeof configuredOutput === 'string' &&
        configuredOutput.toLowerCase().endsWith('.svg') &&
        fs.existsSync(configuredOutput)
      ) {
        return configuredOutput;
      }
    }

    const candidates = collectFilesWithExtension(outputDir, '.svg');
    if (!candidates.length) {
      return undefined;
    }

    const sourceBase = path.parse(sourceFile).name.toLowerCase();
    const scored = candidates
      .map((candidate) => {
        const parsed = path.parse(candidate);
        const baseName = parsed.name.toLowerCase();
        let score = 0;
        if (baseName === sourceBase) {
          score += 100;
        } else if (
          baseName.startsWith(`${sourceBase}-`) ||
          baseName.startsWith(`${sourceBase}_`)
        ) {
          score += 80;
        } else if (candidate.toLowerCase().includes(sourceBase)) {
          score += 40;
        }

        try {
          score += Math.min(20, Math.round(fs.statSync(candidate).size / 1024));
        } catch {
          score += 0;
        }

        return {
          candidate,
          score
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.candidate.localeCompare(right.candidate)
      );

    return scored[0]?.candidate;
  }

  private async resolveTargetFile(
    resource: vscode.Uri | undefined,
    expectedExtensions: string[]
  ): Promise<string | undefined> {
    const candidates: string[] = [];
    if (
      resource?.fsPath &&
      expectedExtensions.includes(path.extname(resource.fsPath))
    ) {
      candidates.push(resource.fsPath);
    }

    // The visible custom editor is authoritative. VS Code may retain a stale
    // activeTextEditor pointing at another schematic while a PCB/schematic
    // webview is the active tab, so never export that unrelated document.
    const activeUri = getActiveResourceUri();
    if (
      activeUri?.fsPath &&
      expectedExtensions.includes(path.extname(activeUri.fsPath))
    ) {
      candidates.push(activeUri.fsPath);
    }

    if (!candidates.length) {
      for (const ext of expectedExtensions) {
        const files = await vscode.workspace.findFiles(
          `**/*${ext}`,
          '**/node_modules/**',
          20
        );
        if (files.length === 1 && files[0]) {
          candidates.push(files[0].fsPath);
        } else if (files.length > 1) {
          const picked = await vscode.window.showQuickPick(
            files.map((uri) => ({
              label: path.basename(uri.fsPath),
              description: path.dirname(uri.fsPath),
              uri
            })),
            {
              title: `Choose ${ext} file`,
              placeHolder:
                'Multiple KiCad files were found; choose the project file to use.'
            }
          );
          if (picked) {
            candidates.push(picked.uri.fsPath);
          }
        }
      }
    }

    const file = candidates.find(
      (candidate) => fs.existsSync(candidate) && isKiCadFile(candidate)
    );
    if (!file) {
      void vscode.window.showWarningMessage(
        `No ${expectedExtensions.join(' or ')} file is currently available. Open a KiCad file first.`
      );
      return undefined;
    }
    return file;
  }

  private async findSiblingSchematic(
    pcbFile: string
  ): Promise<string | undefined> {
    const sibling = path.join(
      path.dirname(pcbFile),
      `${path.parse(pcbFile).name}.kicad_sch`
    );
    if (fs.existsSync(sibling)) {
      return sibling;
    }
    const files = await vscode.workspace.findFiles(
      '**/*.kicad_sch',
      '**/node_modules/**',
      20
    );
    const expectedName = `${path.parse(pcbFile).name}.kicad_sch`;
    const matches = files.filter(
      (uri) => path.basename(uri.fsPath) === expectedName
    );
    if (matches.length === 1) {
      return matches[0]?.fsPath;
    }
    if (matches.length > 1 || files.length > 0) {
      void vscode.window.showWarningMessage(
        'Could not determine the matching schematic for this PCB. Place the schematic next to the PCB with the same base name, or run BOM export explicitly.'
      );
    }
    return undefined;
  }

  private async getBuildOptions(
    file?: string,
    includeGerberLayers = false
  ): Promise<ExportCommandBuildOptions> {
    const detected = await this.detector.detect();
    const versionMajor = Number(detected?.version.split('.')[0] ?? '9');
    const gerberLayers =
      includeGerberLayers && file?.endsWith('.kicad_pcb')
        ? await discoverGerberLayers(file)
        : [];
    if (
      includeGerberLayers &&
      file?.endsWith('.kicad_pcb') &&
      !gerberLayers.length
    ) {
      this.logger.warn(
        `Could not discover Gerber layers for ${file}; using the safe default fabrication layer set.`
      );
      void vscode.window.showWarningMessage(
        'Could not discover board layers. Export will use the default fabrication layer set.'
      );
    }
    const variant = file ? readActiveVariantFromProjectFile(file) : undefined;
    return {
      versionMajor,
      precision: String(
        vscode.workspace
          .getConfiguration()
          .get<number>(SETTINGS.gerberPrecision, 6)
      ),
      ipcVersion: vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.ipcVersion, 'C'),
      ipcUnits: vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.ipcUnits, 'mm'),
      theme: vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.viewerTheme, 'dark'),
      bomFields: vscode.workspace
        .getConfiguration()
        .get<string[]>(SETTINGS.bomFields, []),
      ...(gerberLayers.length ? { gerberLayers } : {}),
      ...(variant ? { variant } : {})
    };
  }
}

/**
 * Read the active variant name from the sibling .kicad_pro project file.
 * Returns `undefined` when no project file or no active variant is configured.
 */
function readActiveVariantFromProjectFile(file: string): string | undefined {
  const projectFile = findSiblingProjectFile(file);
  if (!projectFile) {
    return undefined;
  }
  try {
    const document = JSON.parse(fs.readFileSync(projectFile, 'utf8')) as Record<
      string,
      unknown
    >;
    const activeVariant =
      typeof document['activeVariant'] === 'string'
        ? document['activeVariant']
        : undefined;
    const variants = Array.isArray(document['variants'])
      ? (document['variants'] as Array<Record<string, unknown>>)
      : Array.isArray(document['design_variants'])
        ? (document['design_variants'] as Array<Record<string, unknown>>)
        : [];
    if (!activeVariant && variants.length > 0) {
      const defaultVariant = variants.find(
        (v) => v['isDefault'] === true || v['default'] === true
      );
      return typeof defaultVariant?.['name'] === 'string'
        ? (defaultVariant['name'] as string)
        : undefined;
    }
    return activeVariant;
  } catch {
    return undefined;
  }
}

/**
 * Cache for CLI option probe results. Cleared via `clearProbeCache()`
 * when the CLI detection cache is invalidated.
 */
const _probeCache = new Map<string, boolean>();

/**
 * Check whether a CLI option name appears in the given help text.
 * Results are cached per option name (help content is stable within a
 * CLI binary version).
 */
export function probeOption(optionName: string, helpText: string): boolean {
  const cached = _probeCache.get(optionName);
  if (cached !== undefined) return cached;
  const supported = helpText.includes(optionName);
  _probeCache.set(optionName, supported);
  return supported;
}

/** Clear the probe option cache (called when CLI detection cache is invalidated). */
export function clearProbeCache(): void {
  _probeCache.clear();
}

/**
 * Conditionally append an item to an array if the CLI option is
 * supported by the current CLI's help text.
 */
export function appendIfSupported<T>(
  items: T[],
  item: T,
  optionName: string,
  helpText: string
): T[] {
  if (probeOption(optionName, helpText)) {
    return [...items, item];
  }
  return items;
}

function exportSurfaceFor(kind: ExportCommandKind): ExportSurfaceKind {
  if (kind === 'export-netlist') {
    return 'netlist';
  }
  return kind === 'export-sch-bom' ? 'bom' : 'export';
}

function collectFilesWithExtension(root: string, extension: string): string[] {
  const files: string[] = [];
  const pending = [root];

  while (pending.length) {
    const current = pending.pop();
    if (!current || !fs.existsSync(current)) {
      continue;
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(nextPath);
        continue;
      }
      if (entry.isFile() && nextPath.toLowerCase().endsWith(extension)) {
        files.push(nextPath);
      }
    }
  }

  return files;
}

/** Make output-path failures actionable without leaking local absolute paths. */
function outputDirectoryFailureMessage(error: unknown): string {
  const code = outputDirectoryErrorCode(error);
  let reason = 'Output directory could not be prepared.';
  let recovery = 'choose an output directory inside the current workspace.';
  if (code === 'EEXIST' || code === 'ENOTDIR') {
    reason = 'A file is blocking the output folder.';
    recovery =
      'rename or move the blocking file, or choose another output folder inside this workspace.';
  } else if (code === 'EACCES' || code === 'EPERM') {
    reason = 'The output folder is not writable.';
    recovery =
      'grant write access or choose a writable folder inside this workspace.';
  }
  return (
    reason +
    '\nWhat happened: output directory validation failed.\nHow to fix: ' +
    recovery
  );
}

function outputDirectoryErrorCode(error: unknown): string {
  return error !== null && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : 'validation-error';
}

/** Match actual write failures to the validated BOM output, never source-file reads. */
function isBomOutputPermissionFailure(
  error: unknown,
  outputDir: string,
  outputFile: string
): boolean {
  const code = outputDirectoryErrorCode(error);
  if (code !== 'EACCES' && code !== 'EPERM') return false;
  if (error === null || typeof error !== 'object' || !('path' in error)) {
    return false;
  }
  if (typeof error.path !== 'string') return false;
  const denied = path.resolve(error.path);
  return (
    denied === path.resolve(outputDir) || denied === path.resolve(outputFile)
  );
}
