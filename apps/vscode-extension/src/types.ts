import * as vscode from 'vscode';
import type {
  McpServerInfoCompatibilityRange,
  McpServerInfoContract
} from '@oaslananka/kicad-protocol-schemas';

export type { McpServerInfoCompatibilityRange, McpServerInfoContract };

export interface FileReference {
  uri: vscode.Uri;
  fsPath: string;
  basename: string;
  extname: string;
}

export interface CliRunOptions {
  command: string[];
  cwd: string;
  progressTitle: string;
  parseOutput?: (stdout: string, stderr: string) => unknown;
  onProgress?: (message: string) => void;
  signal?: AbortSignal | undefined;
}

export interface CliResult<T = unknown> {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  parsed?: T | undefined;
  stdoutTruncated?: boolean | undefined;
  stderrTruncated?: boolean | undefined;
  truncatedOutputBytes?: number | undefined;
}

export interface DetectedKiCadCli {
  path: string;
  args?: string[];
  version: string;
  versionLabel: string;
  source: 'settings' | 'common-path' | 'path';
}

export interface ViewerState {
  zoom: number;
  grid: boolean;
  theme: string;
  toolsPanelCollapsed?: boolean | undefined;
  engine?: ViewerEngineState | undefined;
  selectedReference?: string | undefined;
  selectedSheet?: string | undefined;
  selectedArea?:
    | {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      }
    | undefined;
  activeLayers?: string[] | undefined;
}

export type ViewerEngineKind =
  | 'kicanvas'
  | 'cli-svg-fallback'
  | 'metadata-only';

export interface ViewerEngineCapabilities {
  interactive: boolean;
  fit: boolean;
  zoom: boolean;
  exportPng: boolean;
  exportSvg: boolean;
  selection: boolean;
  layers: boolean;
}

export interface ViewerEngineState {
  kind: ViewerEngineKind;
  label: string;
  reason?: string | undefined;
  capabilities: ViewerEngineCapabilities;
}

export interface ViewerInboundMessage {
  type:
    | 'load'
    | 'refresh'
    | 'setTheme'
    | 'highlight'
    | 'setLayers'
    | 'showDiff'
    | 'showMessage'
    | 'setMetadata';
  payload?: Record<string, unknown>;
}

export interface ViewerOutboundMessage {
  type:
    | 'ready'
    | 'componentSelected'
    | 'openInKiCad'
    | 'status'
    | 'error'
    | 'themeChanged'
    | 'viewerState'
    | 'requestRefresh'
    | 'exportPng'
    | 'exportSvg'
    | 'selectionChanged';
  payload?: Record<string, unknown>;
}

export interface ViewerLayerInfo {
  name: string;
  visible: boolean;
  kind?: string | undefined;
}

export interface TuningProfile {
  name: string;
  layer?: string | undefined;
  impedance?: string | undefined;
  propagationSpeed?: string | undefined;
  raw?: string | undefined;
}

export interface ViewerSheetInfo {
  id: string;
  name: string;
  file?: string | undefined;
}

export interface ViewerMetadata {
  layers?: ViewerLayerInfo[] | undefined;
  tuningProfiles?: TuningProfile[] | undefined;
  sheets?: ViewerSheetInfo[] | undefined;
  hopOvers?: Array<{ x: number; y: number }> | undefined;
  notes?: string[] | undefined;
}

export interface BomEntry {
  references: string[];
  value: string;
  footprint: string;
  quantity: number;
  mpn: string;
  manufacturer: string;
  lcsc: string;
  description: string;
  dnp: boolean;
  uuid?: string | undefined;
}

export interface BomSummary {
  totalComponents: number;
  uniqueValues: number;
}

export interface BomWebviewMessage {
  type:
    | 'setData'
    | 'setStatus'
    | 'highlight'
    | 'exportCsv'
    | 'exportXlsx'
    | 'rowSelected';
  payload?: Record<string, unknown>;
}

export interface NetlistNode {
  netName: string;
  nodes: Array<{
    reference: string;
    pin: string;
  }>;
}

export interface NetlistWebviewMessage {
  type: 'setNetlist' | 'selectReference';
  payload?: Record<string, unknown>;
}

export interface ComponentPriceBreak {
  quantity: number;
  price: number;
  currency: string;
}

export interface ComponentOffer {
  seller: string;
  inventoryLevel?: number | undefined;
  prices: ComponentPriceBreak[];
}

export interface ComponentSearchResult {
  source: 'octopart' | 'lcsc' | 'local';
  mpn: string;
  manufacturer: string;
  description: string;
  category?: string | undefined;
  datasheetUrl?: string | undefined;
  imageUrl?: string | undefined;
  lcscPartNumber?: string | undefined;
  pcmPackageId?: string | undefined;
  offers: ComponentOffer[];
  specs: Array<{
    name: string;
    value: string;
  }>;
}

export interface ComponentDiff {
  uuid: string;
  reference: string;
  type: 'added' | 'removed' | 'changed';
  before?: Record<string, string> | undefined;
  after?: Record<string, string> | undefined;
}

export interface DiffWebviewMessage {
  type: 'setDiff' | 'navigate';
  payload?: Record<string, unknown>;
}

export interface ExportPreset {
  schemaVersion?: number | undefined;
  name: string;
  description?: string | undefined;
  commands: string[];
  outputDir?: string | undefined;
}

export interface AIConnectionResult {
  ok: boolean;
  latencyMs: number;
  error?: string | undefined;
}

export interface AIProviderCapabilities {
  requiresApiKey: boolean;
  supportsStreaming: boolean;
}

export type DiagnosticFreshness =
  | 'never-run'
  | 'running'
  | 'fresh-clean'
  | 'fresh-dirty'
  | 'stale'
  | 'failed';

export type DiagnosticOrigin =
  | 'kicad-cli'
  | 'mcp'
  | 'cached-report'
  | 'manual-import'
  | 'syntax';

export interface DiagnosticSummary {
  file: string;
  errors: number;
  warnings: number;
  infos: number;
  source: 'drc' | 'erc' | 'syntax';
  capturedAt?: string | undefined;
  fileUri?: string | undefined;
  projectId?: string | undefined;
  projectName?: string | undefined;
  freshness?: DiagnosticFreshness | undefined;
  origin?: DiagnosticOrigin | undefined;
  kicadVersion?: string | undefined;
  reportPath?: string | undefined;
  commandArgs?: string[] | undefined;
  staleReason?: string | undefined;
  failureMessage?: string | undefined;
  lastGoodCapturedAt?: string | undefined;
}

export interface ProjectContext {
  id: string;
  name: string;
  rootPath: string;
  projectFile: string;
  workspaceFolder: string;
}

export interface KiCadTaskDefinition extends vscode.TaskDefinition {
  task: string;
  file: string;
  outputDir?: string | undefined;
}

export interface ProjectTreeNode {
  label: string;
  type:
    | 'project'
    | 'schematic'
    | 'pcb'
    | 'symbol-library'
    | 'footprint-library'
    | 'jobset'
    | 'fab-output'
    | 'model'
    | 'file'
    | 'folder'
    | 'drc-rule';
  uri?: vscode.Uri | undefined;
  project?: ProjectContext | undefined;
  children?: ProjectTreeNode[] | undefined;
}

export interface AIProvider {
  name: string;
  capabilities: AIProviderCapabilities;
  analyze(
    prompt: string,
    context: string,
    systemPrompt?: string
  ): Promise<string>;
  analyzeStream?(
    prompt: string,
    context: string,
    systemPrompt: string | undefined,
    onChunk: (text: string) => void,
    signal?: AbortSignal
  ): Promise<void>;
  testConnection(): Promise<AIConnectionResult>;
  isConfigured(): boolean;
}

export interface McpToolCall {
  name: string;
  arguments: Record<string, unknown>;
  preview?: string | undefined;
}

export interface ParserError {
  message: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

export interface SchemaNodeDefinition {
  tag: string;
  description: string;
  children?: string[] | undefined;
}

export interface VariantOverride {
  reference: string;
  enabled: boolean;
  valueOverride?: string | undefined;
  footprintOverride?: string | undefined;
}

export interface KiCadVariantComponent {
  reference: string;
  included: boolean;
  value?: string | undefined;
  footprint?: string | undefined;
}

export interface KiCadVariant {
  name: string;
  isDefault: boolean;
  componentOverrides: VariantOverride[];
  components?: KiCadVariantComponent[] | undefined;
}

export interface McpInstallStatus {
  found: boolean;
  command?: 'uvx' | 'kicad-mcp-pro' | 'npx' | 'pipx' | 'pip' | undefined;
  version?: string | undefined;
  source?: 'uvx' | 'global' | 'pip' | 'pipx' | 'inspector' | 'none' | undefined;
}

export type McpCompatStatus = 'ok' | 'warn' | 'incompatible';

export type McpConnectionKind =
  | 'NotInstalled'
  | 'Disconnected'
  | 'Connecting'
  | 'Connected'
  | 'Degraded'
  | 'Incompatible'
  | 'VsCodeStdio';

export interface McpCapabilityCard {
  tools: string[];
  resources: string[];
  prompts: string[];
  serverInfo?: McpServerInfoContract | undefined;
  diagnostics?: string[] | undefined;
}

export interface McpServerCard {
  version: string;
  capabilities: McpCapabilityCard;
  compat: McpCompatStatus;
  capturedAt: string;
}

export interface McpConnectionState {
  kind: McpConnectionKind;
  available: boolean;
  connected: boolean;
  install?: McpInstallStatus | undefined;
  server?: McpServerCard | undefined;
  message?: string | undefined;
}

export interface StructuredMcpError {
  code: string;
  message: string;
  hint?: string | undefined;
}

export interface McpLogEntry {
  id: number;
  timestamp: string;
  direction: 'request' | 'response' | 'error';
  method: string;
  summary: string;
  payload: string;
}

export type QualityGateStatus =
  | 'PASS'
  | 'WARN'
  | 'FAIL'
  | 'BLOCKED'
  | 'PENDING';

export interface QualityGateViolation {
  message: string;
  path?: string | undefined;
  line?: number | undefined;
  hint?: string | undefined;
}

export interface QualityGateResult {
  id: string;
  label: string;
  status: QualityGateStatus;
  summary: string;
  details: string[];
  violations: QualityGateViolation[];
  lastRun?: string | undefined;
  raw?: string | undefined;
}

export interface StudioContext {
  activeFile: string | undefined;
  fileType: 'schematic' | 'pcb' | 'other';
  drcErrors: string[];
  project?: ProjectContext | undefined;
  projectId?: string | undefined;
  projectName?: string | undefined;
  projectRoot?: string | undefined;
  projectFile?: string | undefined;
  selectedNet?: string | undefined;
  selectedReference?: string | undefined;
  selectedArea?:
    | {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      }
    | undefined;
  activeVariant?: string | undefined;
  mcpConnected?: boolean | undefined;
  cursorPosition?:
    | {
        line: number;
        character: number;
      }
    | undefined;
  activeSheetPath?: string | undefined;
  visibleLayers?: string[] | undefined;
  viewerEngine?: ViewerEngineState | undefined;
  kicadVersion?: string | undefined;
  designBlocks?: string[] | undefined;
}

export interface FixItem {
  id: string;
  title?: string | undefined;
  description: string;
  severity: 'error' | 'warning' | 'info';
  tool: string;
  args: Record<string, unknown>;
  status: 'pending' | 'applying' | 'done' | 'failed';
  preview?: string | undefined;
  path?: string | undefined;
  line?: number | undefined;
  confidence?: number | undefined;
}
