import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ErrorAnalyzer } from './ai/errorAnalyzer';
import { AIProviderRegistry } from './ai/aiProvider';
import { CircuitExplainer } from './ai/circuitExplainer';
import { BomExporter } from './bom/bomExporter';
import { BomParser } from './bom/bomParser';
import { KiCadCheckService } from './cli/checkCommands';
import { KiCadCliDetector } from './cli/kicadCliDetector';
import { KiCadCliRunner } from './cli/kicadCliRunner';
import { ExportPresetStore } from './cli/exportPresets';
import { KiCadExportService } from './cli/exportCommands';
import { KiCadImportService } from './cli/importCommands';
import { ComponentSearchService } from './components/componentSearch';
import { ComponentSearchCache } from './components/componentSearchCache';
import { LcscClient } from './components/lcscClient';
import { OctopartClient } from './components/octopartClient';
import {
  BOM_VIEW_ID,
  COMMANDS,
  COMPONENT_SEARCH_VIEW_ID,
  CONTEXT_KEYS,
  DIAGNOSTIC_COLLECTION_NAME,
  KICAD_S_EXPRESSION_LANGUAGES,
  DRC_RULES_VIEW_ID,
  EXTENSION_ID,
  FIX_QUEUE_VIEW_ID,
  QUALITY_GATE_VIEW_ID,
  NETLIST_VIEW_ID,
  PCB_EDITOR_VIEW_TYPE,
  S_EXPRESSION_DOCUMENT_SELECTOR,
  SCHEMATIC_EDITOR_VIEW_TYPE,
  SETTINGS,
  TREE_VIEW_ID,
  VARIANTS_VIEW_ID,
  OCTOPART_SECRET_KEY
} from './constants';
import { registerAllCommands } from './commands';
import { GitDiffDetector } from './git/gitDiffDetector';
import { KiCadLibraryIndexer } from './library/libraryIndexer';
import { LibrarySearchProvider } from './library/librarySearchProvider';
import { registerLanguageModelChatProvider } from './lm/languageModelChatProvider';
import { registerLanguageModelTools } from './lm/languageModelTools';
import { registerMcpServerDefinitionProvider } from './lm/mcpServerDefinitionProvider';
import { ContextBridge } from './mcp/contextBridge';
import { McpClient } from './mcp/mcpClient';
import { McpDetector } from './mcp/mcpDetector';
import { FixQueueProvider } from './mcp/fixQueueProvider';
import { KiCadDiagnosticsAggregator } from './language/diagnosticsAggregator';
import { KiCadDiagnosticsProvider } from './language/diagnosticsProvider';
import { KiCadHoverProvider } from './language/hoverProvider';
import { KiCadDocumentStore } from './language/kicadDocumentStore';
import { SExpressionParser } from './language/sExpressionParser';
import { KiCadSymbolProvider } from './language/symbolProvider';
import { KiCadCompletionProvider } from './language/completionProvider';
import { DrcRulesProvider } from './drc/drcRulesProvider';
import { BomViewProvider } from './providers/bomViewProvider';
import { DiffEditorProvider } from './providers/diffEditorProvider';
import { KiCadCodeActionProvider } from './providers/kicadCodeActionProvider';
import { NetlistViewProvider } from './providers/netlistViewProvider';
import { PcbEditorProvider } from './providers/pcbEditorProvider';
import { KiCadProjectTreeProvider } from './providers/projectTreeProvider';
import { QualityGateProvider } from './providers/qualityGateProvider';
import { SchematicEditorProvider } from './providers/schematicEditorProvider';
import { KiCadStatusBar } from './statusbar/kicadStatusBar';
import { KiCadTaskProvider } from './tasks/kicadTaskProvider';
import { VariantProvider } from './variants/variantProvider';
import { readConfiguredMcpProfile } from './commands/mcpProfilePicker';
import { Logger } from './utils/logger';
import { getAiSecretKey, isAiSecretProvider } from './utils/secrets';
import {
  getActiveResourceUri,
  workspaceHasVariants
} from './utils/workspaceUtils';
import { isWorkspaceTrusted } from './utils/workspaceTrust';
import type { DiagnosticSummary, McpInstallStatus } from './types';

let extensionLogger: Logger | undefined;
let extensionMcpClient: McpClient | undefined;
const S_EXPRESSION_LANGUAGE_IDS = new Set<string>(KICAD_S_EXPRESSION_LANGUAGES);

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const activationStartedAt = Date.now();
  const logger = new Logger('KiCad Studio');
  extensionLogger = logger;
  logger.info('Activating KiCad Studio...');
  await migrateDeprecatedSecretSettings(context, logger);
  let latestDrcRun:
    | {
        file: string;
        diagnostics: vscode.Diagnostic[];
        summary: DiagnosticSummary;
      }
    | undefined;
  let aiHealthy: boolean | undefined;

  const parser = new SExpressionParser();
  const languageServer = new KiCadDocumentStore(parser);
  const cliDetector = new KiCadCliDetector();
  const cliRunner = new KiCadCliRunner(cliDetector, logger);
  const importService = new KiCadImportService(cliRunner, cliDetector, logger);
  const statusBar = new KiCadStatusBar(context);
  const bomParser = new BomParser(parser);
  const bomExporter = new BomExporter();
  const presetStore = new ExportPresetStore(context);
  const exportService = new KiCadExportService(
    cliRunner,
    cliDetector,
    bomParser,
    bomExporter,
    presetStore,
    logger
  );
  const diagnosticsCollection = new KiCadDiagnosticsAggregator(
    vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME)
  );
  const diagnosticsProvider = new KiCadDiagnosticsProvider(
    parser,
    diagnosticsCollection
  );
  const checkService = new KiCadCheckService(cliRunner, parser, logger);
  const treeProvider = new KiCadProjectTreeProvider();
  const bomViewProvider = new BomViewProvider(context, parser);
  const netlistViewProvider = new NetlistViewProvider(
    context,
    parser,
    cliRunner,
    logger
  );
  const schematicEditorProvider = new SchematicEditorProvider(
    context,
    async (resource) => exportService.renderViewerSvg(resource)
  );
  const pcbEditorProvider = new PcbEditorProvider(context, async (resource) =>
    exportService.renderViewerSvg(resource)
  );
  const gitDiffDetector = new GitDiffDetector(parser);
  const diffEditorProvider = new DiffEditorProvider(context, gitDiffDetector);
  const aiProviders = new AIProviderRegistry(context);
  const mcpDetector = new McpDetector();
  const { McpLogger } = await import('./mcp/mcpLogger');
  const mcpLogger = new McpLogger();
  const mcpClient = new McpClient(context, mcpDetector, logger, {
    logger: mcpLogger
  });
  extensionMcpClient = mcpClient;
  const contextBridge = new ContextBridge(mcpClient);
  const variantProvider = new VariantProvider(mcpClient);
  const fixQueueProvider = new FixQueueProvider(mcpClient);
  const qualityGateProvider = new QualityGateProvider(context, mcpClient);
  const drcRulesProvider = new DrcRulesProvider(parser);
  const errorAnalyzer = new ErrorAnalyzer(aiProviders, logger);
  const circuitExplainer = new CircuitExplainer(aiProviders, logger);
  const libraryIndexer = new KiCadLibraryIndexer(context);
  const librarySearch = new LibrarySearchProvider(
    libraryIndexer,
    logger,
    cliDetector,
    cliRunner,
    context.extensionUri
  );
  const componentSearch = new ComponentSearchService(
    new OctopartClient(context.secrets),
    new LcscClient(),
    new ComponentSearchCache(context.globalState),
    libraryIndexer
  );

  context.subscriptions.push(
    logger,
    statusBar,
    contextBridge,
    diagnosticsCollection,
    libraryIndexer,
    schematicEditorProvider,
    pcbEditorProvider,
    bomViewProvider,
    netlistViewProvider,
    vscode.window.registerCustomEditorProvider(
      SCHEMATIC_EDITOR_VIEW_TYPE,
      schematicEditorProvider,
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: { retainContextWhenHidden: true }
      }
    ),
    vscode.window.registerCustomEditorProvider(
      PCB_EDITOR_VIEW_TYPE,
      pcbEditorProvider,
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: { retainContextWhenHidden: true }
      }
    ),
    vscode.languages.registerHoverProvider(
      S_EXPRESSION_DOCUMENT_SELECTOR,
      new KiCadHoverProvider(parser)
    ),
    vscode.languages.registerDocumentSymbolProvider(
      S_EXPRESSION_DOCUMENT_SELECTOR,
      new KiCadSymbolProvider(parser)
    ),
    vscode.languages.registerCompletionItemProvider(
      S_EXPRESSION_DOCUMENT_SELECTOR,
      new KiCadCompletionProvider(parser),
      '('
    ),
    vscode.languages.registerCodeActionsProvider(
      S_EXPRESSION_DOCUMENT_SELECTOR,
      new KiCadCodeActionProvider(fixQueueProvider),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
      }
    ),
    vscode.window.registerTreeDataProvider(TREE_VIEW_ID, treeProvider),
    vscode.window.registerTreeDataProvider(VARIANTS_VIEW_ID, variantProvider),
    vscode.window.registerTreeDataProvider(FIX_QUEUE_VIEW_ID, fixQueueProvider),
    vscode.window.registerTreeDataProvider(
      QUALITY_GATE_VIEW_ID,
      qualityGateProvider
    ),
    vscode.window.registerTreeDataProvider(DRC_RULES_VIEW_ID, drcRulesProvider),
    vscode.window.registerWebviewViewProvider(BOM_VIEW_ID, bomViewProvider),
    vscode.window.registerWebviewViewProvider(
      NETLIST_VIEW_ID,
      netlistViewProvider
    ),
    // Component search view — empty tree so viewsWelcome shows the action buttons.
    vscode.window.registerTreeDataProvider(COMPONENT_SEARCH_VIEW_ID, {
      getTreeItem: (element: vscode.TreeItem) => element,
      getChildren: () => []
    }),
    vscode.tasks.registerTaskProvider('kicad', new KiCadTaskProvider()),
    // Wire schematic viewer activation → BOM refresh so the BOM panel updates
    // when a .kicad_sch file is opened in the custom viewer (webview), not just
    // when it is the active text editor.
    schematicEditorProvider.onDidActivate((uri) =>
      bomViewProvider.setSchematicUri(uri)
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (!isSExpressionDocument(document)) {
        return;
      }
      languageServer.invalidate(document.uri);
      void languageServer.parseDocument(document);
      diagnosticsProvider.update(document);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!isSExpressionDocument(event.document)) {
        return;
      }
      languageServer.scheduleParse(event.document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!document.languageId.startsWith('kicad-')) {
        return;
      }
      if (isSExpressionDocument(document)) {
        languageServer.invalidate(document.uri);
        void languageServer.parseDocument(document);
        diagnosticsProvider.update(document);
      }
      treeProvider.refresh();
      variantProvider.refresh();
      drcRulesProvider.refresh();
      void refreshContexts();
      void runConfiguredSaveChecks(document);
      void pushStudioContext('save');
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnosticsCollection.delete(document.uri);
      languageServer.invalidate(document.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      void refreshContexts();
      variantProvider.refresh();
      drcRulesProvider.refresh();
      void pushStudioContext('focus');
    }),
    vscode.window.onDidChangeTextEditorSelection(() => {
      void pushStudioContext('cursor');
    }),
    vscode.window.tabGroups.onDidChangeTabs(() => {
      void refreshContexts();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(SETTINGS.cliPath) ||
        event.affectsConfiguration(SETTINGS.aiProvider) ||
        event.affectsConfiguration(SETTINGS.aiLanguage) ||
        event.affectsConfiguration(SETTINGS.aiOpenAIApiMode) ||
        event.affectsConfiguration(SETTINGS.mcpEndpoint) ||
        event.affectsConfiguration(SETTINGS.mcpAutoDetect) ||
        event.affectsConfiguration(SETTINGS.mcpProfile)
      ) {
        cliDetector.clearCache();
        aiHealthy = undefined;
        void refreshContexts();
        void refreshMcpState();
      }
      if (event.affectsConfiguration(SETTINGS.logLevel)) {
        logger.refreshLevel();
      }
      if (event.affectsConfiguration(SETTINGS.viewerTheme)) {
        const theme = vscode.workspace
          .getConfiguration()
          .get<string>(SETTINGS.viewerTheme, 'kicad');
        schematicEditorProvider.setTheme(theme);
        pcbEditorProvider.setTheme(theme);
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      const isDark =
        theme.kind === vscode.ColorThemeKind.Dark ||
        theme.kind === vscode.ColorThemeKind.HighContrast;
      const nextTheme = isDark ? 'dark' : 'light';
      schematicEditorProvider.setTheme(nextTheme);
      pcbEditorProvider.setTheme(nextTheme);
    })
  );

  registerAllCommands(context, {
    cliDetector,
    exportService,
    checkService,
    diffEditorProvider,
    fixQueueProvider,
    qualityGateProvider,
    diagnosticsCollection,
    statusBar,
    componentSearch,
    aiProviders,
    errorAnalyzer,
    circuitExplainer,
    importService,
    libraryIndexer,
    librarySearch,
    mcpClient,
    mcpLogger,
    variantProvider,
    drcRulesProvider,
    treeProvider,
    context,
    logger,
    getLatestDrcRun: () => latestDrcRun,
    setLatestDrcRun: (value) => {
      latestDrcRun = value;
    },
    setAiHealthy: (value) => {
      aiHealthy = value;
    },
    pushStudioContext: () => pushStudioContext('default'),
    refreshContexts,
    refreshMcpState
  });

  context.subscriptions.push(
    registerLanguageModelTools(context, {
      logger,
      checkService,
      cliDetector,
      cliRunner,
      componentSearch,
      libraryIndexer,
      variantProvider,
      diagnosticsCollection,
      getStudioContext: buildStudioContext,
      setLatestDrcRun: (value) => {
        latestDrcRun = value;
      }
    })
  );
  registerMcpServerDefinitionProvider(context, mcpDetector, logger);
  registerLanguageModelChatProvider(context, logger, buildStudioContext);

  if (isWorkspaceTrusted()) {
    void cliDetector.detect().then((cli) => {
      statusBar.update({ cli });
    });
  }
  if (typeof vscode.workspace.onDidGrantWorkspaceTrust === 'function') {
    context.subscriptions.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        void cliDetector.detect().then((cli) => {
          statusBar.update({ cli });
        });
        void refreshContexts();
        void refreshMcpState();
      })
    );
  }
  void refreshMcpState();
  variantProvider.refresh();
  drcRulesProvider.refresh();

  await refreshContexts();

  const isFirstInstall = !context.globalState.get<boolean>(
    'kicadstudio.installed'
  );
  if (isFirstInstall) {
    await context.globalState.update('kicadstudio.installed', true);
    await vscode.commands.executeCommand(
      'workbench.action.openWalkthrough',
      `${EXTENSION_ID}#kicadstudio.gettingStarted`
    );
  }

  logger.info('KiCad Studio activated successfully.');
  const activationDurationMs = Date.now() - activationStartedAt;
  logger.info(`KiCad Studio activated in ${activationDurationMs}ms`);
  if (activationDurationMs > 500) {
    logger.warn(`Activation exceeded 500ms (${activationDurationMs}ms).`);
  }

  async function refreshContexts(): Promise<void> {
    const activeUri = getActiveResourceUri();
    const hasProject =
      (
        await vscode.workspace.findFiles(
          '**/*.kicad_pro',
          '**/node_modules/**',
          1
        )
      ).length > 0 ||
      (
        await vscode.workspace.findFiles(
          '**/*.kicad_sch',
          '**/node_modules/**',
          1
        )
      ).length > 0 ||
      (
        await vscode.workspace.findFiles(
          '**/*.kicad_pcb',
          '**/node_modules/**',
          1
        )
      ).length > 0;
    const trusted = isWorkspaceTrusted();
    const provider = await aiProviders.getProvider();
    const cli = trusted ? await cliDetector.detect() : undefined;
    const kicadVersionMajor = Number(cli?.version.split('.')[0] ?? '0');
    const hasVariants = await workspaceHasVariants();
    const mcpProfile = readConfiguredMcpProfile();
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.hasProject,
      hasProject
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.schematicOpen,
      activeUri?.fsPath.endsWith('.kicad_sch') ?? false
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.pcbOpen,
      activeUri?.fsPath.endsWith('.kicad_pcb') ?? false
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.aiEnabled,
      Boolean(provider?.isConfigured())
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.aiHealthy,
      Boolean(provider?.isConfigured() && aiHealthy !== false)
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.kicad10Plus,
      kicadVersionMajor >= 10
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.hasVariants,
      hasVariants
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.workspaceTrusted,
      isWorkspaceTrusted()
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpProfile,
      mcpProfile ?? 'full'
    );
    statusBar.update({
      aiConfigured: Boolean(provider?.isConfigured()),
      aiHealthy,
      mcpProfile
    });
  }

  async function runConfiguredSaveChecks(
    document: vscode.TextDocument
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const shouldRunDrc =
      document.fileName.endsWith('.kicad_pcb') &&
      config.get<boolean>(SETTINGS.autoRunDRC, false);
    const shouldRunErc =
      document.fileName.endsWith('.kicad_sch') &&
      config.get<boolean>(SETTINGS.autoRunERC, false);

    if ((!shouldRunDrc && !shouldRunErc) || !isWorkspaceTrusted()) {
      return;
    }

    try {
      const result = shouldRunDrc
        ? await checkService.runDRC(document.fileName)
        : await checkService.runERC(document.fileName);
      diagnosticsCollection.set(
        vscode.Uri.file(document.fileName),
        result.diagnostics
      );
      statusBar.update(
        shouldRunDrc ? { drc: result.summary } : { erc: result.summary }
      );
      if (shouldRunDrc) {
        latestDrcRun = {
          file: document.fileName,
          diagnostics: result.diagnostics,
          summary: result.summary
        };
        qualityGateProvider.scheduleDrcRefresh();
        await maybeOfferProactiveDrc(result.summary, result.diagnostics.length);
        await pushStudioContext('drc');
      }
      if (result.diagnostics.length > 0) {
        await vscode.commands.executeCommand('workbench.actions.view.problems');
      }
    } catch (error) {
      logger.error('Auto DRC/ERC on save failed', error);
      void vscode.window.showErrorMessage(
        error instanceof Error
          ? `KiCad Studio auto-check failed: ${error.message}`
          : 'KiCad Studio auto-check failed. Confirm kicad-cli is configured and the file is valid.'
      );
    }
  }

  async function maybeOfferProactiveDrc(
    summary: DiagnosticSummary,
    diagnosticCount: number
  ): Promise<void> {
    const provider = await aiProviders.getProvider();
    if (!provider?.isConfigured() || diagnosticCount <= 0) {
      return;
    }
    const choice = await vscode.window.showInformationMessage(
      `DRC: ${summary.errors} errors found. Start AI analysis?`,
      'Yes, analyze',
      'No'
    );
    if (choice === 'Yes, analyze') {
      await vscode.commands.executeCommand(COMMANDS.aiProactiveDRC);
    }
  }

  async function refreshMcpState(): Promise<void> {
    if (!isWorkspaceTrusted()) {
      await setRestrictedMcpContexts();
      statusBar.update({
        mcpState: {
          kind: 'Disconnected',
          available: false,
          connected: false,
          message: 'MCP integration is disabled in Restricted Mode.'
        },
        mcpProfile: readConfiguredMcpProfile()
      });
      return;
    }

    const state = await mcpClient.testConnection();
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpAvailable,
      state.available
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpConnected,
      state.connected
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpCompatible,
      state.server?.compat === 'ok' || state.server?.compat === 'warn'
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpIncompatible,
      state.kind === 'Incompatible'
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpDisconnected,
      state.kind === 'Disconnected'
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpVsCodeStdio,
      state.kind === 'VsCodeStdio'
    );
    statusBar.update({
      mcpState: state,
      mcpProfile: readConfiguredMcpProfile()
    });

    if (
      state.available &&
      !state.connected &&
      state.kind !== 'Incompatible' &&
      vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.mcpAutoDetect, true)
    ) {
      await maybeOfferMcpBootstrap(state.install);
    }
  }

  async function setRestrictedMcpContexts(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpAvailable,
      false
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpConnected,
      false
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpCompatible,
      false
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpIncompatible,
      false
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpDisconnected,
      true
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpVsCodeStdio,
      false
    );
  }

  async function maybeOfferMcpBootstrap(
    installStatus: McpInstallStatus | undefined
  ): Promise<void> {
    if (!installStatus?.found) {
      return;
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }

    const mcpJsonPath = path.join(root, '.vscode', 'mcp.json');
    if (fs.existsSync(mcpJsonPath)) {
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      'kicad-mcp-pro was detected. Create .vscode/mcp.json for this project?',
      'Setup MCP',
      'Later'
    );
    if (choice === 'Setup MCP') {
      await mcpDetector.generateMcpJson(root, installStatus);
      await refreshMcpState();
    }
  }

  async function buildStudioContext(): Promise<{
    activeFile: string | undefined;
    fileType: 'schematic' | 'pcb' | 'other';
    drcErrors: string[];
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
    kicadVersion?: string | undefined;
    designBlocks?: string[] | undefined;
  }> {
    const activeUri = getActiveResourceUri();
    const activeEditor = vscode.window.activeTextEditor;
    const fileType = activeUri?.fsPath.endsWith('.kicad_sch')
      ? 'schematic'
      : activeUri?.fsPath.endsWith('.kicad_pcb')
        ? 'pcb'
        : 'other';
    const viewerState =
      fileType === 'pcb' && activeUri
        ? pcbEditorProvider.getViewerState(activeUri)
        : fileType === 'schematic' && activeUri
          ? schematicEditorProvider.getViewerState(activeUri)
          : undefined;
    const mcpState = isWorkspaceTrusted() ? mcpClient.getState() : undefined;
    const cli = isWorkspaceTrusted() ? await cliDetector.detect() : undefined;
    return {
      activeFile: activeUri?.fsPath,
      fileType,
      drcErrors:
        latestDrcRun?.diagnostics
          .map((diagnostic) => diagnostic.message)
          .slice(0, 20) ?? [],
      selectedReference: viewerState?.selectedReference,
      selectedArea: viewerState?.selectedArea,
      cursorPosition: activeEditor
        ? {
            line: activeEditor.selection.active.line,
            character: activeEditor.selection.active.character
          }
        : undefined,
      activeSheetPath:
        fileType === 'schematic' && activeUri
          ? path.relative(
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
              activeUri.fsPath
            )
          : undefined,
      visibleLayers: viewerState?.activeLayers,
      activeVariant: await variantProvider.getActiveVariantName(),
      mcpConnected: mcpState?.connected ?? false,
      kicadVersion: cli?.version,
      designBlocks: activeUri ? readDesignBlockNames(activeUri.fsPath) : []
    };
  }

  async function pushStudioContext(
    reason: 'save' | 'focus' | 'cursor' | 'drc' | 'default' = 'default'
  ): Promise<void> {
    if (!isWorkspaceTrusted()) {
      return;
    }
    await contextBridge.pushContext(await buildStudioContext(), reason);
  }
}

function readDesignBlockNames(file: string): string[] {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return [
      ...new Set(
        Array.from(
          text.matchAll(/\(\s*design_block\b[\s\S]*?\(\s*name\s+"([^"]+)"/g),
          (match) => match[1]
        ).filter((entry): entry is string => Boolean(entry))
      )
    ];
  } catch {
    return [];
  }
}

export async function deactivate(): Promise<void> {
  extensionLogger?.info('Deactivating KiCad Studio...');
  await extensionMcpClient?.deactivate();
}

function isSExpressionDocument(document: vscode.TextDocument): boolean {
  return S_EXPRESSION_LANGUAGE_IDS.has(document.languageId);
}

async function migrateDeprecatedSecretSettings(
  context: vscode.ExtensionContext,
  logger: Logger
): Promise<void> {
  await migrateDeprecatedSecretSetting({
    context,
    logger,
    settingKey: SETTINGS.aiApiKey,
    secretKey: getAiSecretKey(getConfiguredAiSecretProvider()),
    label: 'AI'
  });
  await migrateDeprecatedSecretSetting({
    context,
    logger,
    settingKey: SETTINGS.octopartApiKey,
    secretKey: OCTOPART_SECRET_KEY,
    label: 'Octopart/Nexar'
  });
}

function getConfiguredAiSecretProvider(): 'claude' | 'openai' | 'gemini' {
  const provider = vscode.workspace
    .getConfiguration()
    .get<string>(SETTINGS.aiProvider, 'claude');
  return isAiSecretProvider(provider) ? provider : 'claude';
}

async function migrateDeprecatedSecretSetting(args: {
  context: vscode.ExtensionContext;
  logger: Logger;
  settingKey: string;
  secretKey: string;
  label: string;
}): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const plaintextValue = config.get<string>(args.settingKey, '').trim();
  if (!plaintextValue) {
    return;
  }

  const existingSecret = await args.context.secrets.get(args.secretKey);
  if (!existingSecret) {
    await args.context.secrets.store(args.secretKey, plaintextValue);
  }

  await clearDeprecatedSetting(config, args.settingKey, args.logger);
  args.logger.warn(
    `${args.label} API key was migrated from deprecated plaintext settings to VS Code SecretStorage.`
  );
  void vscode.window.showInformationMessage(
    `${args.label} API key was moved from deprecated settings to VS Code SecretStorage. Plaintext runtime fallback is disabled in KiCad Studio v2.`
  );
}

async function clearDeprecatedSetting(
  config: vscode.WorkspaceConfiguration,
  settingKey: string,
  logger: Logger
): Promise<void> {
  for (const target of [
    vscode.ConfigurationTarget.Global,
    vscode.ConfigurationTarget.Workspace,
    vscode.ConfigurationTarget.WorkspaceFolder
  ]) {
    try {
      await config.update(settingKey, undefined, target);
    } catch (error) {
      logger.debug(
        `Could not clear deprecated setting ${settingKey} at target ${String(target)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
