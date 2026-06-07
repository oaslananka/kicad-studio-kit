import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { registerTrustedCommand } from '../utils/workspaceTrust';
import type { CommandServices } from './types';

interface ExportPickerEntry {
  label: string;
  description: string;
  detail?: string;
  command: string;
  category: Category;
}

const EXPORT_ENTRIES: ExportPickerEntry[] = [
  // ── 2D Schematic ───────────────────────────────────────────────────────────
  {
    label: '$(file-pdf) Schematic PDF',
    description: 'Export schematic as PDF',
    command: COMMANDS.exportPDF,
    category: '2d-sch'
  },
  {
    label: '$(file-media) Schematic SVG',
    description: 'Export schematic as SVG',
    command: COMMANDS.exportSVG,
    category: '2d-sch'
  },
  {
    label: '$(file) Schematic PostScript',
    description: 'Export schematic as PostScript',
    command: COMMANDS.exportSchPs,
    category: '2d-sch'
  },
  // ── 2D PCB ─────────────────────────────────────────────────────────────────
  {
    label: '$(file-pdf) PCB PDF',
    description: 'Export PCB as PDF',
    command: COMMANDS.exportPCBPDF,
    category: '2d-pcb'
  },
  {
    label: '$(file-media) PCB SVG',
    description: 'Export PCB as SVG',
    command: COMMANDS.exportSVG,
    category: '2d-pcb'
  },
  {
    label: '$(file) PCB PostScript',
    description: 'Export PCB as PostScript',
    command: COMMANDS.exportPcbPs,
    category: '2d-pcb'
  },
  {
    label: '$(circuit-board) PCB DXF',
    description: 'Export PCB as DXF',
    command: COMMANDS.exportDXF,
    category: '2d-pcb'
  },
  // ── PCB Manufacturing ───────────────────────────────────────────────────────
  {
    label: '$(package) Gerbers + Drill',
    description: 'Fabrication Gerbers with drill',
    command: COMMANDS.exportGerbersWithDrill,
    category: 'manufacturing'
  },
  {
    label: '$(package) Gerbers only',
    description: 'Fabrication Gerbers',
    command: COMMANDS.exportGerbers,
    category: 'manufacturing'
  },
  {
    label: '$(archive) IPC-2581',
    description: 'IPC-2581 fabrication data',
    command: COMMANDS.exportIPC2581,
    category: 'manufacturing'
  },
  {
    label: '$(archive) ODB++',
    description: 'ODB++ fabrication data',
    command: COMMANDS.exportODB,
    category: 'manufacturing'
  },
  {
    label: '$(circuit-board) GenCAD',
    description: 'GenCAD export',
    command: COMMANDS.exportGenCAD,
    category: 'manufacturing'
  },
  {
    label: '$(circuit-board) IPC-D-356',
    description: 'IPC-D-356 netlist data',
    command: COMMANDS.exportIPCD356,
    category: 'manufacturing'
  },
  {
    label: '$(symbol-field) Pick & Place',
    description: 'Pick and place file',
    command: COMMANDS.exportPickAndPlace,
    category: 'manufacturing'
  },
  // ── 3D Models ───────────────────────────────────────────────────────────────
  {
    label: '$(extensions) STEP 3D',
    description: 'STEP 3D model',
    command: COMMANDS.export3DStep,
    category: '3d'
  },
  {
    label: '$(extensions) STEPZ 3D',
    description: 'Compressed STEP 3D model',
    command: COMMANDS.export3DStpz,
    category: '3d'
  },
  {
    label: '$(extensions) GLB 3D',
    description: 'glTF binary 3D',
    command: COMMANDS.export3DGLB,
    category: '3d'
  },
  {
    label: '$(extensions) BREP 3D',
    description: 'B-Rep 3D model',
    command: COMMANDS.export3DBREP,
    category: '3d'
  },
  {
    label: '$(extensions) PLY 3D',
    description: 'PLY 3D mesh',
    command: COMMANDS.export3DPLY,
    category: '3d'
  },
  {
    label: '$(extensions) STL 3D',
    description: 'STL 3D mesh',
    command: COMMANDS.export3DStl,
    category: '3d'
  },
  {
    label: '$(extensions) U3D 3D',
    description: 'U3D 3D model',
    command: COMMANDS.export3DU3d,
    category: '3d'
  },
  {
    label: '$(extensions) VRML 3D',
    description: 'VRML 3D model',
    command: COMMANDS.export3DVrml,
    category: '3d'
  },
  {
    label: '$(extensions) XAO 3D',
    description: 'XAO 3D model',
    command: COMMANDS.export3DXao,
    category: '3d'
  },
  {
    label: '$(file-pdf) 3D PDF',
    description: '3D PDF document',
    command: COMMANDS.export3DPdf,
    category: '3d'
  },
  // ── Documentation ───────────────────────────────────────────────────────────
  {
    label: '$(graph) Board Statistics',
    description: 'PCB statistics report',
    command: COMMANDS.exportStats,
    category: 'docs'
  },
  {
    label: '$(file) Footprint SVG',
    description: 'Footprint SVG preview',
    command: COMMANDS.exportFootprintSVG,
    category: 'docs'
  },
  {
    label: '$(file) Symbol SVG',
    description: 'Symbol SVG preview',
    command: COMMANDS.exportSymbolSVG,
    category: 'docs'
  },
  // ── BOM & Netlist ───────────────────────────────────────────────────────────
  {
    label: '$(list-tree) BOM CSV',
    description: 'Bill of materials as CSV',
    command: COMMANDS.exportBOMCSV,
    category: 'bom'
  },
  {
    label: '$(list-tree) BOM XLSX',
    description: 'Bill of materials as Excel',
    command: COMMANDS.exportBOMXLSX,
    category: 'bom'
  },
  {
    label: '$(list-tree) Netlist',
    description: 'Netlist export',
    command: COMMANDS.exportNetlist,
    category: 'bom'
  },
  // ── Other ───────────────────────────────────────────────────────────────────
  {
    label: '$(globe) Interactive BOM',
    description: 'Interactive HTML BOM viewer',
    command: COMMANDS.exportInteractiveBOM,
    category: 'other'
  },
  {
    label: '$(archive) Manufacturing Package',
    description: 'All-in-one manufacturing package',
    command: COMMANDS.exportManufacturingPackage,
    category: 'other'
  },
  {
    label: '$(play) Run Jobset',
    description: 'Execute a jobset file',
    command: COMMANDS.runJobset,
    category: 'other'
  }
];

const CATEGORY_ORDER = [
  '2d-sch',
  '2d-pcb',
  'manufacturing',
  '3d',
  'docs',
  'bom',
  'other'
] as const;
type Category = (typeof CATEGORY_ORDER)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  '2d-sch': 'Schematic 2D',
  '2d-pcb': 'PCB 2D',
  manufacturing: 'Manufacturing',
  '3d': '3D Models',
  docs: 'Documentation',
  bom: 'BOM & Netlist',
  other: 'Other'
};

interface ImportPickerEntry {
  label: string;
  description: string;
  command: string;
}

const IMPORT_ENTRIES: ImportPickerEntry[] = [
  {
    label: '$(circuit-board) Auto-detect',
    description: 'Automatically detect import format',
    command: COMMANDS.importAuto
  },
  {
    label: '$(circuit-board) Altium',
    description: 'Altium Designer PCB',
    command: COMMANDS.importAltium
  },
  {
    label: '$(circuit-board) PADS',
    description: 'PADS PCB',
    command: COMMANDS.importPads
  },
  {
    label: '$(circuit-board) Allegro',
    description: 'Cadence Allegro PCB',
    command: COMMANDS.importAllegro
  },
  {
    label: '$(circuit-board) Eagle',
    description: 'Autodesk Eagle PCB',
    command: COMMANDS.importEagle
  },
  {
    label: '$(circuit-board) CADSTAR',
    description: 'CADSTAR PCB',
    command: COMMANDS.importCadstar
  },
  {
    label: '$(circuit-board) P-CAD',
    description: 'P-CAD PCB',
    command: COMMANDS.importPcad
  },
  {
    label: '$(circuit-board) Fabmaster',
    description: 'Fabmaster PCB',
    command: COMMANDS.importFabmaster
  },
  {
    label: '$(circuit-board) SolidWorks',
    description: 'SolidWorks PCB',
    command: COMMANDS.importSolidworks
  },
  {
    label: '$(circuit-board) gEDA',
    description: 'gEDA/Lepton EDA PCB',
    command: COMMANDS.importGeda
  }
];

export function registerExportPickerCommands(
  _services: CommandServices
): vscode.Disposable[] {
  return [
    registerTrustedCommand(
      COMMANDS.exportTo,
      () => showExportPicker(),
      'Export to…'
    ),
    registerTrustedCommand(
      COMMANDS.importFrom,
      () => showImportPicker(),
      'Import from…'
    )
  ];
}

async function showExportPicker(): Promise<void> {
  const items: vscode.QuickPickItem[] = [];
  for (const cat of CATEGORY_ORDER) {
    const entries = EXPORT_ENTRIES.filter((e) => e.category === cat);
    if (entries.length === 0) {
      continue;
    }
    items.push({
      label: CATEGORY_LABELS[cat],
      kind: vscode.QuickPickItemKind.Separator
    });
    for (const entry of entries) {
      items.push({
        label: entry.label,
        description: entry.description
      });
    }
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Export to…',
    placeHolder: 'Select an export format'
  });
  if (!picked) {
    return;
  }

  const entry = EXPORT_ENTRIES.find((e) => e.label === picked.label);
  if (entry) {
    await vscode.commands.executeCommand(entry.command);
  }
}

async function showImportPicker(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    IMPORT_ENTRIES.map((entry) => ({
      label: entry.label,
      description: entry.description
    })),
    {
      title: 'Import PCB from…',
      placeHolder: 'Select source format'
    }
  );
  if (!picked) {
    return;
  }

  const entry = IMPORT_ENTRIES.find((e) => e.label === picked.label);
  if (entry) {
    await vscode.commands.executeCommand(entry.command);
  }
}
