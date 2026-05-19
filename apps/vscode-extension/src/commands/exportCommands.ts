import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { registerTrustedCommand } from '../utils/workspaceTrust';
import type { CommandServices } from './types';

/**
 * Register all export and import related commands.
 */
export function registerExportCommands(
  services: CommandServices
): vscode.Disposable[] {
  return [
    registerTrustedCommand(
      COMMANDS.exportGerbers,
      (resource?: vscode.Uri) => services.exportService.exportGerbers(resource),
      'Export Gerbers'
    ),
    registerTrustedCommand(
      COMMANDS.exportGerbersWithDrill,
      (resource?: vscode.Uri) =>
        services.exportService.exportGerbersWithDrill(resource),
      'Export Gerbers with Drill'
    ),
    registerTrustedCommand(
      COMMANDS.exportPDF,
      (resource?: vscode.Uri) => services.exportService.exportPDF(resource),
      'Export PDF'
    ),
    registerTrustedCommand(
      COMMANDS.exportPCBPDF,
      (resource?: vscode.Uri) => services.exportService.exportPCBPDF(resource),
      'Export PCB PDF'
    ),
    registerTrustedCommand(
      COMMANDS.export3DPdf,
      (resource?: vscode.Uri) => services.exportService.export3DPdf(resource),
      'Export 3D PDF'
    ),
    registerTrustedCommand(
      COMMANDS.exportSVG,
      (resource?: vscode.Uri) => services.exportService.exportSVG(resource),
      'Export SVG'
    ),
    registerTrustedCommand(
      COMMANDS.exportIPC2581,
      (resource?: vscode.Uri) => services.exportService.exportIPC2581(resource),
      'Export IPC-2581'
    ),
    registerTrustedCommand(
      COMMANDS.exportODB,
      (resource?: vscode.Uri) => services.exportService.exportODB(resource),
      'Export ODB++'
    ),
    registerTrustedCommand(
      COMMANDS.export3DGLB,
      (resource?: vscode.Uri) => services.exportService.export3DGLB(resource),
      'Export 3D GLB'
    ),
    registerTrustedCommand(
      COMMANDS.export3DBREP,
      (resource?: vscode.Uri) => services.exportService.export3DBREP(resource),
      'Export 3D BREP'
    ),
    registerTrustedCommand(
      COMMANDS.export3DPLY,
      (resource?: vscode.Uri) => services.exportService.export3DPLY(resource),
      'Export 3D PLY'
    ),
    registerTrustedCommand(
      COMMANDS.exportGenCAD,
      (resource?: vscode.Uri) => services.exportService.exportGenCAD(resource),
      'Export GenCAD'
    ),
    registerTrustedCommand(
      COMMANDS.exportIPCD356,
      (resource?: vscode.Uri) => services.exportService.exportIPCD356(resource),
      'Export IPC-D-356'
    ),
    registerTrustedCommand(
      COMMANDS.exportDXF,
      (resource?: vscode.Uri) => services.exportService.exportDXF(resource),
      'Export DXF'
    ),
    registerTrustedCommand(
      COMMANDS.exportPickAndPlace,
      (resource?: vscode.Uri) =>
        services.exportService.exportPickAndPlace(resource),
      'Export Pick and Place'
    ),
    registerTrustedCommand(
      COMMANDS.exportFootprintSVG,
      (resource?: vscode.Uri) =>
        services.exportService.exportFootprintSVG(resource),
      'Export Footprint SVG'
    ),
    registerTrustedCommand(
      COMMANDS.exportSymbolSVG,
      (resource?: vscode.Uri) =>
        services.exportService.exportSymbolSVG(resource),
      'Export Symbol SVG'
    ),
    registerTrustedCommand(
      COMMANDS.exportManufacturingPackage,
      (resource?: vscode.Uri) =>
        services.exportService.exportManufacturingPackage(resource),
      'Export Manufacturing Package'
    ),
    registerTrustedCommand(
      COMMANDS.exportBOMCSV,
      (resource?: vscode.Uri) => services.exportService.exportBOMCSV(resource),
      'Export BOM CSV'
    ),
    registerTrustedCommand(
      COMMANDS.exportBOMXLSX,
      (resource?: vscode.Uri) => services.exportService.exportBOMXLSX(resource),
      'Export BOM XLSX'
    ),
    registerTrustedCommand(
      COMMANDS.exportNetlist,
      (resource?: vscode.Uri) => services.exportService.exportNetlist(resource),
      'Export Netlist'
    ),
    registerTrustedCommand(
      COMMANDS.runJobset,
      (resource?: vscode.Uri) => services.exportService.runJobset(resource),
      'Run Jobset'
    ),
    registerTrustedCommand(
      COMMANDS.exportInteractiveBOM,
      (resource?: vscode.Uri) =>
        services.exportService.exportInteractiveBOM(resource),
      'Export Interactive BOM'
    ),
    registerTrustedCommand(
      COMMANDS.exportViewerSvg,
      (resource?: vscode.Uri) => services.exportService.exportSVG(resource),
      'Export Viewer SVG'
    ),
    vscode.commands.registerCommand(COMMANDS.saveExportPreset, () =>
      services.exportService.savePreset()
    ),
    registerTrustedCommand(
      COMMANDS.runExportPreset,
      () => services.exportService.runPreset(),
      'Run Export Preset'
    ),
    registerTrustedCommand(
      COMMANDS.importPads,
      () => services.importService.importBoard('pads'),
      'Import PADS Board'
    ),
    registerTrustedCommand(
      COMMANDS.importAltium,
      () => services.importService.importBoard('altium'),
      'Import Altium Board'
    ),
    registerTrustedCommand(
      COMMANDS.importEagle,
      () => services.importService.importBoard('eagle'),
      'Import Eagle Board'
    ),
    registerTrustedCommand(
      COMMANDS.importCadstar,
      () => services.importService.importBoard('cadstar'),
      'Import CADSTAR Board'
    ),
    registerTrustedCommand(
      COMMANDS.importFabmaster,
      () => services.importService.importBoard('fabmaster'),
      'Import Fabmaster Board'
    ),
    registerTrustedCommand(
      COMMANDS.importPcad,
      () => services.importService.importBoard('pcad'),
      'Import P-Cad Board'
    ),
    registerTrustedCommand(
      COMMANDS.importSolidworks,
      () => services.importService.importBoard('solidworks'),
      'Import SolidWorks Board'
    ),
    registerTrustedCommand(
      COMMANDS.importGeda,
      () => services.importService.importBoard('geda'),
      'Import gEDA/Lepton Board'
    )
  ];
}
