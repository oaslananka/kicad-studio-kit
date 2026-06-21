import * as vscode from 'vscode';

export const EXTENSION_ID = 'oaslananka.kicadstudiokit';
export const OUTPUT_CHANNEL_NAME = 'KiCad Studio';
export const DIAGNOSTIC_COLLECTION_NAME = 'kicad';
export const TREE_VIEW_ID = 'kicadstudio.projectTree';
export const BOM_VIEW_ID = 'kicadstudio.bomView';
export const NETLIST_VIEW_ID = 'kicadstudio.netlistView';
export const VARIANTS_VIEW_ID = 'kicadstudio.variants';
export const FIX_QUEUE_VIEW_ID = 'kicadstudio.fixQueue';
export const DRC_RULES_VIEW_ID = 'kicadstudio.drcRules';
export const QUALITY_GATE_VIEW_ID = 'kicadstudio.qualityGate';
export const COMPONENT_SEARCH_VIEW_ID = 'kicadstudio.componentSearch';
export const VALIDATION_VIEW_ID = 'kicadstudio.validation';
export const LIBRARY_VIEW_ID = 'kicadstudio.library';
export const MCP_TOOLS_VIEW_ID = 'kicadstudio.mcpTools';
export const KICAD_EXPORT_PRESETS_FILE = 'kicad-export-presets.json';
export const SCHEMATIC_EDITOR_VIEW_TYPE = 'kicadstudio.schematicViewer';
export const PCB_EDITOR_VIEW_TYPE = 'kicadstudio.pcbViewer';
export const LARGE_FILE_BYTES = 5 * 1024 * 1024;
export const PARTIAL_PARSE_LINE_LIMIT = 2000;
export const WEBVIEW_MESSAGE_DEBOUNCE_MS = 500;
export const SEARCH_DEBOUNCE_MS = 300;
export const CLI_TIMEOUT_MS = 5 * 60 * 1000;
export const AI_MAX_TOKENS = 4096;
export const AI_STREAM_TIMEOUT_MS = 120_000;
export const MCP_REQUEST_TIMEOUT_MS = 15_000;
export const AI_CHAT_MAX_HISTORY = 20;
export const VIEWER_HIDDEN_CACHE_RELEASE_MS = 5 * 60 * 1000;
export const VIEWER_DEFAULT_LARGE_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const EXPORT_PRESET_SETTING = 'kicadstudio.exportPresets';
export const OCTOPART_SECRET_KEY = 'kicadstudio.secrets.octopart';
export const AI_SECRET_KEYS = {
  claude: 'kicadstudio.secrets.ai.claude',
  openai: 'kicadstudio.secrets.ai.openai',
  openrouter: 'kicadstudio.secrets.ai.openrouter',
  gemini: 'kicadstudio.secrets.ai.gemini'
} as const;
export type AiProviderName = keyof typeof AI_SECRET_KEYS;
export const AI_SECRET_KEY_LEGACY = 'kicadstudio.secrets.ai';
export const KICAD_LANGUAGES = [
  'kicad-schematic',
  'kicad-pcb',
  'kicad-symbol',
  'kicad-footprint',
  'kicad-project',
  'kicad-drc'
] as const;
export const KICAD_S_EXPRESSION_LANGUAGES = [
  'kicad-schematic',
  'kicad-pcb',
  'kicad-symbol',
  'kicad-footprint',
  'kicad-drc'
] as const;
export const KICAD_FILE_EXTENSIONS = [
  '.kicad_pro',
  '.kicad_sch',
  '.kicad_pcb',
  '.kicad_sym',
  '.kicad_mod',
  '.kicad_jobset',
  '.kicad_dru'
] as const;
export const COMMANDS = {
  showStatusMenu: 'kicadstudio.showStatusMenu',
  selectActiveProject: 'kicadstudio.selectActiveProject',
  generateDiffReport: 'kicadstudio.generateKicadDiffReport',
  openSchematic: 'kicadstudio.openSchematic',
  openPCB: 'kicadstudio.openPCB',
  openInKiCad: 'kicadstudio.openInKiCad',
  detectCli: 'kicadstudio.detectCli',
  exportGerbers: 'kicadstudio.exportGerbers',
  exportGerbersWithDrill: 'kicadstudio.exportGerbersWithDrill',
  exportPDF: 'kicadstudio.exportPDF',
  exportPCBPDF: 'kicadstudio.exportPCBPDF',
  exportSVG: 'kicadstudio.exportSVG',
  exportIPC2581: 'kicadstudio.exportIPC2581',
  exportODB: 'kicadstudio.exportODB',
  export3DGLB: 'kicadstudio.export3DGLB',
  export3DBREP: 'kicadstudio.export3DBREP',
  export3DPLY: 'kicadstudio.export3DPLY',
  export3DStep: 'kicadstudio.export3DStep',
  export3DStpz: 'kicadstudio.export3DStpz',
  export3DXao: 'kicadstudio.export3DXao',
  export3DStl: 'kicadstudio.export3DStl',
  export3DU3d: 'kicadstudio.export3DU3d',
  export3DVrml: 'kicadstudio.export3DVrml',
  exportPcbPs: 'kicadstudio.exportPcbPs',
  exportSchPs: 'kicadstudio.exportSchPs',
  exportStats: 'kicadstudio.exportStats',
  exportGenCAD: 'kicadstudio.exportGenCAD',
  exportIPCD356: 'kicadstudio.exportIPCD356',
  exportDXF: 'kicadstudio.exportDXF',
  exportPickAndPlace: 'kicadstudio.exportPickAndPlace',
  exportFootprintSVG: 'kicadstudio.exportFootprintSVG',
  exportSymbolSVG: 'kicadstudio.exportSymbolSVG',
  exportManufacturingPackage: 'kicadstudio.exportManufacturingPackage',
  exportBOMCSV: 'kicadstudio.exportBOMCSV',
  exportBOMXLSX: 'kicadstudio.exportBOMXLSX',
  exportNetlist: 'kicadstudio.exportNetlist',
  runJobset: 'kicadstudio.runJobset',
  exportInteractiveBOM: 'kicadstudio.exportInteractiveBOM',
  runDRC: 'kicadstudio.runDRC',
  runERC: 'kicadstudio.runERC',
  searchComponent: 'kicadstudio.searchComponent',
  showDiff: 'kicadstudio.showDiff',
  aiAnalyzeError: 'kicadstudio.aiAnalyzeError',
  aiExplainCircuit: 'kicadstudio.aiExplainCircuit',
  openAiChat: 'kicadstudio.openAiChat',
  openSettings: 'kicadstudio.openSettings',
  sendFeedback: 'kicadstudio.sendFeedback',
  aiProactiveDRC: 'kicadstudio.aiProactiveDRC',
  testAiConnection: 'kicadstudio.testAiConnection',
  searchLibrarySymbol: 'kicadstudio.searchLibrarySymbol',
  searchLibraryFootprint: 'kicadstudio.searchLibraryFootprint',
  reindexLibraries: 'kicadstudio.reindexLibraries',
  refreshPcmLibraries: 'kicadstudio.pcm.refresh',
  filterPcmLibraries: 'kicadstudio.pcm.filter',
  installPcmPackage: 'kicadstudio.pcm.install',
  updatePcmPackage: 'kicadstudio.pcm.update',
  updateAllPcmPackages: 'kicadstudio.pcm.updateAll',
  uninstallPcmPackage: 'kicadstudio.pcm.uninstall',
  refreshProjectTree: 'kicadstudio.refreshProjectTree',
  saveExportPreset: 'kicadstudio.saveExportPreset',
  runExportPreset: 'kicadstudio.runExportPreset',
  setOctopartApiKey: 'kicadstudio.setOctopartApiKey',
  setAiApiKey: 'kicadstudio.setAiApiKey',
  clearAiKey: 'kicadstudio.clearAiKey',
  clearSecrets: 'kicadstudio.clearSecrets',
  showStoredSecrets: 'kicadstudio.showStoredSecrets',
  manageChatProvider: 'kicadstudio.manageChatProvider',
  export3DPdf: 'kicadstudio.export3DPdf',
  setupMcpIntegration: 'kicadstudio.setupMcpIntegration',
  installMcp: 'kicadstudio.mcp.install',
  retryMcp: 'kicadstudio.mcp.retry',
  launchMcpHttp: 'kicadstudio.mcp.launchHttp',
  openMcpUpgradeGuide: 'kicadstudio.mcp.openUpgradeGuide',
  pickMcpProfile: 'kicadstudio.mcp.pickProfile',
  openMcpLog: 'kicadstudio.mcp.openLog',
  saveMcpLog: 'kicadstudio.mcp.saveLog',
  clearMcpLog: 'kicadstudio.mcp.clearLog',
  openDesignIntent: 'kicadstudio.openDesignIntent',
  refreshFixQueue: 'kicadstudio.refreshFixQueue',
  applyFixQueueItem: 'kicadstudio.applyFixQueueItem',
  applyFixQueueById: 'kicadstudio.fixQueue.apply',
  applyAllFixQueueItems: 'kicadstudio.fixQueue.applyAll',
  qualityGateRunAll: 'kicadstudio.qualityGate.runAll',
  qualityGateRunThis: 'kicadstudio.qualityGate.runThis',
  qualityGateShowRaw: 'kicadstudio.qualityGate.showRaw',
  qualityGateOpenDocs: 'kicadstudio.qualityGate.openDocs',
  manufacturingRelease: 'kicadstudio.manufacturing.release',
  createVariant: 'kicadstudio.variant.create',
  setActiveVariant: 'kicadstudio.variant.setActive',
  diffVariantBom: 'kicadstudio.variant.diffBom',
  refreshVariants: 'kicadstudio.variant.refresh',
  revealDrcRule: 'kicadstudio.drcRule.reveal',
  createDrcRulesFile: 'kicadstudio.drcRule.createDefault',
  importDrcRulesTemplate: 'kicadstudio.drcRule.importTemplate',
  addDrcRuleWithMcp: 'kicadstudio.drcRule.addWithMcp',
  exportViewerSnapshot: 'kicadstudio.exportViewerSnapshot',
  exportViewerSvg: 'kicadstudio.exportViewerSvg',
  importPads: 'kicadstudio.importPads',
  importAltium: 'kicadstudio.importAltium',
  importEagle: 'kicadstudio.importEagle',
  importCadstar: 'kicadstudio.importCadstar',
  importFabmaster: 'kicadstudio.importFabmaster',
  importPcad: 'kicadstudio.importPcad',
  importSolidworks: 'kicadstudio.importSolidworks',
  importGeda: 'kicadstudio.importGeda',
  importAllegro: 'kicadstudio.importAllegro',
  importAuto: 'kicadstudio.importAuto',
  exportTo: 'kicadstudio.exportTo',
  importFrom: 'kicadstudio.importFrom',
  boardReadyOpsCheck: 'kicadstudio.boardReadyOps.check',
  boardReadyOpsConfigure: 'kicadstudio.boardReadyOps.configure',
  boardReadyOpsShowReport: 'kicadstudio.boardReadyOps.showReport',
  boardReadyOpsOpenDocs: 'kicadstudio.boardReadyOps.openDocs'
} as const;
export const CONTEXT_KEYS = {
  hasProject: 'kicadstudio.hasProject',
  schematicOpen: 'kicadstudio.schematicOpen',
  pcbOpen: 'kicadstudio.pcbOpen',
  aiEnabled: 'kicadstudio.aiEnabled',
  aiHealthy: 'kicadstudio.aiHealthy',
  kicad10Plus: 'kicadstudio.kicad10Plus',
  mcpAvailable: 'kicadstudio.mcpAvailable',
  mcpConnected: 'kicadstudio.mcpConnected',
  mcpCompatible: 'kicadstudio.mcpCompatible',
  mcpIncompatible: 'kicadstudio.mcpIncompatible',
  mcpDisconnected: 'kicadstudio.mcpDisconnected',
  mcpVsCodeStdio: 'kicadstudio.mcpVsCodeStdio',
  mcpProfile: 'kicadstudio.mcpProfile',
  mcpOperatingMode: 'kicadstudio.mcpOperatingMode',
  mcpWriteMode: 'kicadstudio.mcpWriteMode',
  mcpManufacturingMode: 'kicadstudio.mcpManufacturingMode',
  mcpExperimentalMode: 'kicadstudio.mcpExperimentalMode',
  hasVariants: 'kicadstudio.hasVariants',
  allegroImportSupported: 'kicadstudio.allegroImportSupported',
  workspaceTrusted: 'kicadstudio.workspaceTrusted',
  boardReadyOpsAvailable: 'kicadstudio.boardReadyOpsAvailable'
} as const;
export const SETTINGS = {
  cliPath: 'kicadstudio.kicadCliPath',
  kicadPath: 'kicadstudio.kicadPath',
  outputDir: 'kicadstudio.defaultOutputDir',
  gerberPrecision: 'kicadstudio.gerber.precision',
  gerberUseProtelExtension: 'kicadstudio.gerber.useProtelExtension',
  ipcVersion: 'kicadstudio.ipc2581.version',
  ipcUnits: 'kicadstudio.ipc2581.units',
  bomGroupIdentical: 'kicadstudio.bom.groupIdentical',
  bomFields: 'kicadstudio.bom.fields',
  cliDefineVars: 'kicadstudio.cli.defineVars',
  viewerTheme: 'kicadstudio.viewer.theme',
  viewerAutoRefresh: 'kicadstudio.viewer.autoRefresh',
  viewerLargeFileThresholdBytes: 'kicadstudio.viewer.largeFileThresholdBytes',
  octopartApiKey: 'kicadstudio.componentSearch.octopartApiKey',
  enableLCSC: 'kicadstudio.componentSearch.enableLCSC',
  aiProvider: 'kicadstudio.ai.provider',
  aiApiKey: 'kicadstudio.ai.apiKey',
  aiModel: 'kicadstudio.ai.model',
  aiLocalEndpoint: 'kicadstudio.ai.localEndpoint',
  aiLanguage: 'kicadstudio.ai.language',
  aiAllowTools: 'kicadstudio.ai.allowTools',
  aiOpenAIApiMode: 'kicadstudio.ai.openaiApiMode',
  aiGeminiApiMode: 'kicadstudio.ai.geminiApiMode',
  aiMaxTokens: 'kicadstudio.ai.maxTokens',
  aiStreamingEnabled: 'kicadstudio.ai.streamingEnabled',
  aiTimeout: 'kicadstudio.ai.timeout',
  logLevel: 'kicadstudio.logLevel',
  autoRunDRC: 'kicadstudio.drc.autoRunOnSave',
  autoRunERC: 'kicadstudio.erc.autoRunOnSave',
  mcpAutoDetect: 'kicadstudio.mcp.autoDetect',
  mcpEndpoint: 'kicadstudio.mcp.endpoint',
  mcpAllowRemoteEndpoint: 'kicadstudio.mcp.allowRemoteEndpoint',
  mcpAllowLegacySse: 'kicadstudio.mcp.allowLegacySse',
  mcpTimeout: 'kicadstudio.mcp.timeout',
  mcpPushContext: 'kicadstudio.mcp.pushContext',
  mcpProfile: 'kicadstudio.mcp.profile',
  mcpLogSize: 'kicadstudio.mcp.logSize',
  pcmRepositoryUrls: 'kicadstudio.pcm.repositoryUrls',
  pcmConfigDir: 'kicadstudio.pcm.configDir',
  pcmThirdPartyDir: 'kicadstudio.pcm.thirdPartyDir',
  viewerSyncTheme: 'kicadstudio.viewer.syncThemeWithVscode',
  viewerEnableLayerPanel: 'kicadstudio.viewer.enableLayerPanel',
  viewerEnableSnapshotExport: 'kicadstudio.viewer.enableSnapshotExport',
  telemetryEnabled: 'kicadstudio.telemetry.enabled',
  telemetryEndpoint: 'kicadstudio.telemetry.endpoint',
  telemetryBufferLimit: 'kicadstudio.telemetry.bufferLimit',
  boardReadyOpsEnabled: 'kicadstudio.boardReadyOps.enabled',
  boardReadyOpsSpecFile: 'kicadstudio.boardReadyOps.specFile',
  jobsetStopOnError: 'kicadstudio.jobset.stopOnError'
} as const;
export const DEFAULT_BOM_FIELDS = [
  'Reference',
  'Value',
  'Footprint',
  'Quantity',
  'MPN',
  'Manufacturer',
  'Description'
];
export const CLI_CAPABILITY_COMMANDS = {
  gerbers: ['pcb', 'export', 'gerbers'],
  drill: ['pcb', 'export', 'drill'],
  pdfSch: ['sch', 'export', 'pdf'],
  pdfPcb: ['pcb', 'export', 'pdf'],
  svgSch: ['sch', 'export', 'svg'],
  svgPcb: ['pcb', 'export', 'svg'],
  ipc2581: ['pcb', 'export', 'ipc2581'],
  odb: ['pcb', 'export', 'odb'],
  glb: ['pcb', 'export', 'glb'],
  brep: ['pcb', 'export', 'brep'],
  ply: ['pcb', 'export', 'ply'],
  gencad: ['pcb', 'export', 'gencad'],
  ipcd356: ['pcb', 'export', 'ipcd356'],
  dxf: ['pcb', 'export', 'dxf'],
  pos: ['pcb', 'export', 'pos'],
  pdf3d: ['pcb', 'export', '3dpdf'],
  fpSvg: ['fp', 'export', 'svg'],
  symSvg: ['sym', 'export', 'svg'],
  step: ['pcb', 'export', 'step'],
  stpz: ['pcb', 'export', 'stpz'],
  xao: ['pcb', 'export', 'xao'],
  stl: ['pcb', 'export', 'stl'],
  u3d: ['pcb', 'export', 'u3d'],
  vrml: ['pcb', 'export', 'vrml'],
  psPcb: ['pcb', 'export', 'ps'],
  psSch: ['sch', 'export', 'ps'],
  stats: ['pcb', 'export', 'stats'],
  jobset: ['jobset', 'run'],
  bom: ['sch', 'export', 'bom'],
  netlist: ['sch', 'export', 'netlist'],
  drc: ['pcb', 'drc'],
  erc: ['sch', 'erc'],
  pcbImport: ['pcb', 'import']
} as const;

export type CapabilityCategory =
  | 'export-2d'
  | 'export-3d'
  | 'validation'
  | 'import'
  | 'manufacturing'
  | 'utility';

export interface CommandMetadata {
  /** Minimum KiCad major version required. */
  minimumMajor: number;
  /** Functional grouping. */
  category: CapabilityCategory;
  /** Human-readable description. */
  description: string;
}

export const CLI_CAPABILITY_METADATA: {
  [K in keyof typeof CLI_CAPABILITY_COMMANDS]: CommandMetadata;
} = {
  // validation
  drc: {
    minimumMajor: 8,
    category: 'validation',
    description: 'PCB design rule check'
  },
  erc: {
    minimumMajor: 8,
    category: 'validation',
    description: 'Schematic electrical rule check'
  },
  // manufacturing
  gerbers: {
    minimumMajor: 8,
    category: 'manufacturing',
    description: 'Gerber fabrication files'
  },
  drill: {
    minimumMajor: 8,
    category: 'manufacturing',
    description: 'Drill files'
  },
  bom: {
    minimumMajor: 8,
    category: 'manufacturing',
    description: 'Bill of materials'
  },
  netlist: {
    minimumMajor: 8,
    category: 'manufacturing',
    description: 'Netlist export'
  },
  pos: {
    minimumMajor: 8,
    category: 'manufacturing',
    description: 'Pick and place file'
  },
  ipc2581: {
    minimumMajor: 9,
    category: 'manufacturing',
    description: 'IPC-2581 fabrication data'
  },
  odb: {
    minimumMajor: 9,
    category: 'manufacturing',
    description: 'ODB++ fabrication data'
  },
  gencad: {
    minimumMajor: 8,
    category: 'manufacturing',
    description: 'GenCAD export'
  },
  ipcd356: {
    minimumMajor: 8,
    category: 'manufacturing',
    description: 'IPC-D-356 netlist data'
  },
  // 2D schematic
  pdfSch: {
    minimumMajor: 8,
    category: 'export-2d',
    description: 'Schematic PDF'
  },
  svgSch: {
    minimumMajor: 8,
    category: 'export-2d',
    description: 'Schematic SVG'
  },
  psSch: {
    minimumMajor: 8,
    category: 'export-2d',
    description: 'Schematic PostScript'
  },
  // 2D PCB
  pdfPcb: { minimumMajor: 8, category: 'export-2d', description: 'PCB PDF' },
  svgPcb: { minimumMajor: 8, category: 'export-2d', description: 'PCB SVG' },
  psPcb: {
    minimumMajor: 8,
    category: 'export-2d',
    description: 'PCB PostScript'
  },
  dxf: { minimumMajor: 8, category: 'export-2d', description: 'DXF export' },
  fpSvg: {
    minimumMajor: 8,
    category: 'export-2d',
    description: 'Footprint SVG'
  },
  symSvg: { minimumMajor: 8, category: 'export-2d', description: 'Symbol SVG' },
  // 3D
  step: {
    minimumMajor: 8,
    category: 'export-3d',
    description: 'STEP 3D model'
  },
  stpz: {
    minimumMajor: 9,
    category: 'export-3d',
    description: 'Compressed STEP 3D model'
  },
  glb: {
    minimumMajor: 9,
    category: 'export-3d',
    description: 'glTF binary 3D'
  },
  brep: {
    minimumMajor: 9,
    category: 'export-3d',
    description: 'B-Rep 3D model'
  },
  ply: { minimumMajor: 9, category: 'export-3d', description: 'PLY 3D mesh' },
  xao: { minimumMajor: 9, category: 'export-3d', description: 'XAO 3D model' },
  stl: { minimumMajor: 9, category: 'export-3d', description: 'STL 3D mesh' },
  u3d: { minimumMajor: 9, category: 'export-3d', description: 'U3D 3D model' },
  vrml: {
    minimumMajor: 9,
    category: 'export-3d',
    description: 'VRML 3D model'
  },
  pdf3d: { minimumMajor: 10, category: 'export-3d', description: '3D PDF' },
  // utility
  stats: {
    minimumMajor: 8,
    category: 'utility',
    description: 'PCB statistics'
  },
  jobset: {
    minimumMajor: 9,
    category: 'utility',
    description: 'Jobset runner'
  },
  // import
  pcbImport: {
    minimumMajor: 10,
    category: 'import',
    description: 'PCB import formats'
  }
};

export const DOCUMENT_SELECTOR: vscode.DocumentSelector = KICAD_LANGUAGES.map(
  (language) => ({
    language
  })
);
export const S_EXPRESSION_DOCUMENT_SELECTOR: vscode.DocumentSelector =
  KICAD_S_EXPRESSION_LANGUAGES.map((language) => ({
    language
  }));
