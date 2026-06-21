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
  COMPONENT_SEARCH_VIEW_ID,
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
  OCTOPART_SECRET_KEY,
  VALIDATION_VIEW_ID,
  LIBRARY_VIEW_ID,
  MCP_TOOLS_VIEW_ID
} from './constants';
import { registerAllCommands } from './commands';
import { GitDiffDetector } from './git/gitDiffDetector';
import { KiCadLibraryIndexer } from './library/libraryIndexer';
import { LibrarySearchProvider } from './library/librarySearchProvider';
import { PcmLibraryProvider } from './library/pcmLibraryProvider';
import { PcmService } from './library/pcmService';
import { registerLanguageModelChatProvider } from './lm/languageModelChatProvider';
import { registerLanguageModelTools } from './lm/languageModelTools';
import { registerMcpServerDefinitionProvider } from './lm/mcpServerDefinitionProvider';
import { ContextBridge } from './mcp/contextBridge';
import { McpClient } from './mcp/mcpClient';
import { McpDetector } from './mcp/mcpDetector';
import { McpToolAdapter } from './mcp/mcpToolAdapter';
import { McpToolsProvider } from './mcp/mcpToolsProvider';
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
import { ValidationViewProvider } from './providers/validationViewProvider';
import { KiCadStatusBar } from './statusbar/kicadStatusBar';
import {
  DiagnosticStateStore,
  ExportStateStore,
  McpStateStore,
  ProjectStateStore,
  ViewerStateStore
} from './state/stateStores';
import { KiCadTaskProvider } from './tasks/kicadTaskProvider';
import { VariantProvider } from './variants/variantProvider';
import { readConfiguredMcpProfile } from './commands/mcpProfilePicker';
import { Logger } from './utils/logger';
import { runSettingsMigrations } from './settings/settingsMigrations';
import {
  getAiSecretKey,
  isAiSecretProvider,
  migratePlaintextSettingToSecret
} from './utils/secrets';
import { isWorkspaceTrusted } from './utils/workspaceTrust';
import type { ProjectContext } from './types';
import { ActivationState } from './activation/activationState';
import { McpActivationController } from './activation/mcpActivationController';
import { SaveCheckController } from './activation/saveCheckController';
import { StudioContextController } from './activation/studioContextController';
import { WorkspaceContextController } from './activation/workspaceContextController';

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
  await runSettingsMigrations(context, logger);
  await migrateDeprecatedSecretSettings(context, logger);

  // Activation-scoped shared state (previously closure variables in this
  // function). The focused controllers below read and write it.
  const activationState = new ActivationState();

  const parser = new SExpressionParser();
  const languageServer = new KiCadDocumentStore(parser);
  const cliDetector = new KiCadCliDetector();
  const cliRunner = new KiCadCliRunner(cliDetector, logger);
  const importService = new KiCadImportService(cliRunner, cliDetector, logger);
  const statusBar = new KiCadStatusBar(context);
  const projectState = new ProjectStateStore();
  const viewerState = new ViewerStateStore();
  const mcpState = new McpStateStore();
  const exportState = new ExportStateStore();
  const bomParser = new BomParser(parser);
  const bomExporter = new BomExporter();
  const presetStore = new ExportPresetStore(context);
  const exportService = new KiCadExportService(
    cliRunner,
    cliDetector,
    bomParser,
    bomExporter,
    presetStore,
    logger,
    exportState
  );
  const diagnosticsCollection = new KiCadDiagnosticsAggregator(
    vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME)
  );
  const diagnosticState = new DiagnosticStateStore(diagnosticsCollection);
  const diagnosticsProvider = new KiCadDiagnosticsProvider(
    parser,
    diagnosticsCollection
  );
  const checkService = new KiCadCheckService(cliRunner, parser, logger);
  const markViewerDiagnosticsStale = (
    resource: vscode.Uri,
    project: ProjectContext | undefined
  ): void => {
    diagnosticState.markStaleForResource(
      resource,
      'Viewer reloaded after source file changed.',
      { project }
    );
  };
  const treeProvider = new KiCadProjectTreeProvider();
  const validationViewProvider = new ValidationViewProvider(diagnosticState);
  const bomViewProvider = new BomViewProvider(context, parser, exportState);
  const netlistViewProvider = new NetlistViewProvider(
    context,
    parser,
    cliRunner,
    logger,
    exportState
  );
  const schematicEditorProvider = new SchematicEditorProvider(
    context,
    async (resource) => exportService.renderViewerSvg(resource),
    viewerState,
    (resource) => projectState.findProjectForResource(resource),
    markViewerDiagnosticsStale
  );
  const pcbEditorProvider = new PcbEditorProvider(
    context,
    async (resource) => exportService.renderViewerSvg(resource),
    viewerState,
    (resource) => projectState.findProjectForResource(resource),
    markViewerDiagnosticsStale
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
  const mcpToolAdapter = new McpToolAdapter(mcpClient, () =>
    projectState.getActiveProject()
  );
  const contextBridge = new ContextBridge(mcpToolAdapter);
  const mcpToolsProvider = new McpToolsProvider(mcpState);
  const variantProvider = new VariantProvider(mcpToolAdapter);
  const fixQueueProvider = new FixQueueProvider(mcpToolAdapter, mcpState);
  const qualityGateProvider = new QualityGateProvider(
    context,
    mcpToolAdapter,
    mcpState
  );
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
  const pcmService = new PcmService(
    context,
    cliDetector,
    cliRunner,
    libraryIndexer,
    logger
  );
  const pcmLibraryProvider = new PcmLibraryProvider(pcmService);

  // Focused activation controllers (#397). They own the activation logic that
  // previously lived as nested closures in this function.
  const studioContext = new StudioContextController({
    projectState,
    diagnosticState,
    pcbEditorProvider,
    schematicEditorProvider,
    variantProvider,
    cliDetector,
    mcpClient,
    contextBridge,
    activationState
  });
  const mcpActivation = new McpActivationController({
    mcpClient,
    mcpState,
    mcpDetector
  });
  const workspaceContext = new WorkspaceContextController({
    context,
    logger,
    projectState,
    diagnosticState,
    statusBar,
    aiProviders,
    cliDetector,
    importService,
    treeProvider,
    variantProvider,
    activationState,
    pushStudioContext: (reason) => studioContext.pushStudioContext(reason)
  });
  const saveCheck = new SaveCheckController({
    checkService,
    diagnosticState,
    projectState,
    qualityGateProvider,
    aiProviders,
    activationState,
    logger,
    pushStudioContext: (reason) => studioContext.pushStudioContext(reason)
  });

  const componentSearch = new ComponentSearchService(
    new OctopartClient(context.secrets),
    new LcscClient(),
    new ComponentSearchCache(context.globalState),
    libraryIndexer,
    pcmService,
    context,
    () => studioContext.buildStudioContext()
  );

  context.subscriptions.push(
    logger,
    statusBar,
    projectState,
    diagnosticState,
    viewerState,
    mcpState,
    exportState,
    contextBridge,
    diagnosticsCollection,
    libraryIndexer,
    pcmService,
    pcmLibraryProvider,
    schematicEditorProvider,
    pcbEditorProvider,
    bomViewProvider,
    netlistViewProvider,
    validationViewProvider,
    workspaceContext,
    diagnosticState.onDidChange((state) => {
      statusBar.update({ drc: state.drc, erc: state.erc });
    }),
    mcpState.onDidChange((state) => {
      statusBar.update({
        mcpState: state,
        mcpProfile: readConfiguredMcpProfile()
      });
      mcpToolsProvider.refresh();
      qualityGateProvider.refresh();
      void fixQueueProvider.refresh().catch(() => undefined);
    }),
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
    vscode.window.registerWebviewViewProvider(
      COMPONENT_SEARCH_VIEW_ID,
      componentSearch,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerTreeDataProvider(
      VALIDATION_VIEW_ID,
      validationViewProvider
    ),
    vscode.window.registerTreeDataProvider(LIBRARY_VIEW_ID, pcmLibraryProvider),
    vscode.window.registerTreeDataProvider(MCP_TOOLS_VIEW_ID, mcpToolsProvider),
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
      void workspaceContext.refreshContexts();
      void saveCheck.runConfiguredSaveChecks(document);
      void studioContext.pushStudioContext('save');
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnosticsCollection.delete(document.uri);
      languageServer.invalidate(document.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      void workspaceContext.refreshContexts();
      variantProvider.refresh();
      drcRulesProvider.refresh();
      void studioContext.pushStudioContext('focus');
    }),
    vscode.window.onDidChangeTextEditorSelection(() => {
      void studioContext.pushStudioContext('cursor');
    }),
    vscode.window.tabGroups.onDidChangeTabs(() => {
      void workspaceContext.refreshContexts();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(SETTINGS.cliPath) ||
        event.affectsConfiguration(SETTINGS.aiProvider) ||
        event.affectsConfiguration(SETTINGS.aiLanguage) ||
        event.affectsConfiguration(SETTINGS.aiOpenAIApiMode) ||
        event.affectsConfiguration(SETTINGS.mcpEndpoint) ||
        event.affectsConfiguration(SETTINGS.mcpAutoDetect) ||
        event.affectsConfiguration(SETTINGS.mcpProfile) ||
        event.affectsConfiguration(SETTINGS.pcmRepositoryUrls) ||
        event.affectsConfiguration(SETTINGS.pcmConfigDir) ||
        event.affectsConfiguration(SETTINGS.pcmThirdPartyDir)
      ) {
        cliDetector.clearCache();
        activationState.aiHealthy = undefined;
        void workspaceContext.refreshContexts();
        void mcpActivation.refreshMcpState();
      }
      if (
        event.affectsConfiguration(SETTINGS.pcmRepositoryUrls) ||
        event.affectsConfiguration(SETTINGS.pcmConfigDir) ||
        event.affectsConfiguration(SETTINGS.pcmThirdPartyDir)
      ) {
        void pcmLibraryProvider.refresh();
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

  // Watch for externally-created/deleted .kicad_pro files so that the project
  // tree, status bar, and context keys stay current without requiring a tab
  // switch or editor focus change. The controller debounces the refresh.
  const projectFileWatcher =
    vscode.workspace.createFileSystemWatcher('**/*.kicad_pro');
  context.subscriptions.push(
    projectFileWatcher,
    projectFileWatcher.onDidCreate(() =>
      workspaceContext.scheduleProjectRefresh()
    ),
    projectFileWatcher.onDidDelete(() =>
      workspaceContext.scheduleProjectRefresh()
    )
  );

  registerAllCommands(context, {
    cliDetector,
    exportService,
    checkService,
    diffEditorProvider,
    fixQueueProvider,
    qualityGateProvider,
    diagnosticsCollection,
    projectState,
    diagnosticState,
    statusBar,
    componentSearch,
    aiProviders,
    errorAnalyzer,
    circuitExplainer,
    importService,
    libraryIndexer,
    librarySearch,
    pcmService,
    pcmLibraryProvider,
    mcpClient,
    mcpAdapter: mcpToolAdapter,
    mcpLogger,
    variantProvider,
    drcRulesProvider,
    treeProvider,
    context,
    logger,
    getLatestDrcRun: () =>
      diagnosticState.getLatestDrcRun(projectState.getActiveProject()?.id) ??
      activationState.latestDrcRun,
    setLatestDrcRun: (value) => {
      activationState.latestDrcRun = value;
    },
    setAiHealthy: (value) => {
      activationState.aiHealthy = value;
    },
    pushStudioContext: () => studioContext.pushStudioContext('default'),
    selectActiveProject: (projectOrId) =>
      workspaceContext.selectActiveProject(projectOrId),
    refreshContexts: () => workspaceContext.refreshContexts(),
    refreshMcpState: () => mcpActivation.refreshMcpState()
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
      diagnosticState,
      projectState,
      getStudioContext: () => studioContext.buildStudioContext(),
      setLatestDrcRun: (value) => {
        activationState.latestDrcRun = value;
      }
    })
  );
  registerMcpServerDefinitionProvider(context, mcpDetector, logger);
  registerLanguageModelChatProvider(context, logger, () =>
    studioContext.buildStudioContext()
  );

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
        void workspaceContext.refreshContexts();
        void mcpActivation.refreshMcpState();
      })
    );
  }
  void mcpActivation.refreshMcpState();
  variantProvider.refresh();
  drcRulesProvider.refresh();

  await workspaceContext.refreshContexts();

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

function getConfiguredAiSecretProvider():
  | 'claude'
  | 'openai'
  | 'openrouter'
  | 'gemini' {
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
  const migrated = await migratePlaintextSettingToSecret({
    config: vscode.workspace.getConfiguration(),
    secrets: args.context.secrets,
    settingKey: args.settingKey,
    secretKey: args.secretKey,
    clearTargets: [
      vscode.ConfigurationTarget.Global,
      vscode.ConfigurationTarget.Workspace,
      vscode.ConfigurationTarget.WorkspaceFolder
    ],
    onClearError: (target, error) => {
      args.logger.debug(
        `Could not clear deprecated setting ${args.settingKey} at target ${String(target)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });
  if (!migrated) {
    return;
  }

  args.logger.warn(
    `${args.label} API key was migrated from deprecated plaintext settings to VS Code SecretStorage.`
  );
  void vscode.window.showInformationMessage(
    `${args.label} API key was moved from deprecated settings to VS Code SecretStorage. Plaintext runtime fallback is disabled in KiCad Studio v2.`
  );
}
