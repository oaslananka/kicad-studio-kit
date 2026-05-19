import * as vscode from 'vscode';
import type { KiCadCliDetector } from '../cli/kicadCliDetector';
import type { KiCadExportService } from '../cli/exportCommands';
import type { KiCadImportService } from '../cli/importCommands';
import type { KiCadCheckService } from '../cli/checkCommands';
import type { DiffEditorProvider } from '../providers/diffEditorProvider';
import type { FixQueueProvider } from '../mcp/fixQueueProvider';
import type { KiCadStatusBar } from '../statusbar/kicadStatusBar';
import type { ComponentSearchService } from '../components/componentSearch';
import type { AIProviderRegistry } from '../ai/aiProvider';
import type { ErrorAnalyzer } from '../ai/errorAnalyzer';
import type { CircuitExplainer } from '../ai/circuitExplainer';
import type { McpClient } from '../mcp/mcpClient';
import type { KiCadLibraryIndexer } from '../library/libraryIndexer';
import type { LibrarySearchProvider } from '../library/librarySearchProvider';
import type { VariantProvider } from '../variants/variantProvider';
import type { DrcRulesProvider } from '../drc/drcRulesProvider';
import type { McpLogger } from '../mcp/mcpLogger';
import type { QualityGateProvider } from '../providers/qualityGateProvider';
import type { KiCadProjectTreeProvider } from '../providers/projectTreeProvider';
import type { Logger } from '../utils/logger';
import type { DiagnosticSummary } from '../types';

/**
 * Shared service dependencies that are passed to all command registration
 * modules. This replaces the anonymous inline type that previously existed
 * inside `registerCommands()` in extension.ts.
 */
export interface CommandServices {
  cliDetector: KiCadCliDetector;
  exportService: KiCadExportService;
  importService: KiCadImportService;
  checkService: KiCadCheckService;
  diffEditorProvider: DiffEditorProvider;
  fixQueueProvider: FixQueueProvider;
  diagnosticsCollection: vscode.DiagnosticCollection;
  statusBar: KiCadStatusBar;
  componentSearch: ComponentSearchService;
  aiProviders: AIProviderRegistry;
  errorAnalyzer: ErrorAnalyzer;
  circuitExplainer: CircuitExplainer;
  mcpClient: McpClient;
  mcpLogger: McpLogger;
  qualityGateProvider: QualityGateProvider;
  libraryIndexer: KiCadLibraryIndexer;
  librarySearch: LibrarySearchProvider;
  variantProvider: VariantProvider;
  drcRulesProvider: DrcRulesProvider;
  treeProvider: KiCadProjectTreeProvider;
  context: vscode.ExtensionContext;
  logger: Logger;
  getLatestDrcRun: () =>
    | {
        file: string;
        diagnostics: vscode.Diagnostic[];
        summary: DiagnosticSummary;
      }
    | undefined;
  setLatestDrcRun: (value: {
    file: string;
    diagnostics: vscode.Diagnostic[];
    summary: DiagnosticSummary;
  }) => void;
  setAiHealthy: (value: boolean | undefined) => void;
  pushStudioContext: () => Promise<void>;
  refreshContexts: () => Promise<void>;
  refreshMcpState: () => Promise<void>;
}
