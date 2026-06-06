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
import {
  getActiveResourceUri,
  workspaceHasVariants
} from './utils/workspaceUtils';
import { isWorkspaceTrusted } from './utils/workspaceTrust';
import type {
  DiagnosticSummary,
  McpInstallStatus,
  ProjectContext,
  StudioContext
} from './types';
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  discoverKiCadProjects,
  pickActiveProject
} from './workspace/projectContext';

let extensionLogger: Logger | undefined;
let extensionMcpClient: McpClient | undefined;
const S_EXPRESSION_LANGUAGE_IDS = new Set<string>(KICAD_S_EXPRESSION_LANGUAGES);

// Debounced project re-scan — coalesces rapid file-system events into a single
// refresh so that externally-created or deleted .kicad_pro files are picked up
// without overwhelming the extension host.
let refreshProjectsTimer: NodeJS.Timeout | undefined;
const REFRESH_PROJECTS_DEBOUNCE_MS = 500;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const activationStartedAt = Date.now();
  const logger = new Logger('KiCad Studio');
  extensionLogger = logger;
  logger.info('Activating KiCad Studio...');
  await runSettingsMigrations(context, logger);
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
  const componentSearch = new ComponentSearchService(
    new OctopartClient(context.secrets),
    new LcscClient(),
    new ComponentSearchCache(context.globalState),
    libraryIndexer,
    pcmService,
    context,
    () => buildStudioContext()
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
        event.affectsConfiguration(SETTINGS.mcpProfile) ||
        event.affectsConfiguration(SETTINGS.pcmRepositoryUrls) ||
        event.affectsConfiguration(SETTINGS.pcmConfigDir) ||
        event.affectsConfiguration(SETTINGS.pcmThirdPartyDir)
      ) {
        cliDetector.clearCache();
        aiHealthy = undefined;
        void refreshContexts();
        void refreshMcpState();
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
  // switch or editor focus change.
  const projectFileWatcher =
    vscode.workspace.createFileSystemWatcher('**/*.kicad_pro');
  context.subscriptions.push(
    projectFileWatcher,
    projectFileWatcher.onDidCreate(refreshProjectsScheduled),
    projectFileWatcher.onDidDelete(refreshProjectsScheduled)
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
      latestDrcRun,
    setLatestDrcRun: (value) => {
      latestDrcRun = value;
    },
    setAiHealthy: (value) => {
      aiHealthy = value;
    },
    pushStudioContext: () => pushStudioContext('default'),
    selectActiveProject,
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
      diagnosticState,
      projectState,
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
    const projects = await discoverKiCadProjects(
      vscode.workspace.workspaceFolders
    );
    const hasProject =
      projects.length > 0 ||
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
    const allegroImportSupported = await detectAllegroImportSupport(
      trusted,
      Boolean(cli)
    );
    const hasVariants = await workspaceHasVariants();
    const mcpProfile = readConfiguredMcpProfile();
    const persistedProjectId = context.workspaceState.get<string>(
      ACTIVE_PROJECT_STORAGE_KEY
    );
    const activeProject = pickActiveProject(projects, {
      previousActiveProjectId: projectState.getActiveProject()?.id,
      persistedActiveProjectId: persistedProjectId,
      activeResourcePath: activeUri?.fsPath
    });
    const projectSnapshot = projectState.update({
      activeResource: activeUri,
      projects,
      activeProject,
      hasProject,
      hasVariants,
      workspaceTrusted: trusted
    });
    diagnosticState.setActiveProject(projectSnapshot.activeProject?.id);
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.hasProject,
      projectSnapshot.hasProject
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
      projectSnapshot.hasVariants
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.allegroImportSupported,
      allegroImportSupported
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
      mcpProfile,
      activeProjectName: projectSnapshot.activeProject?.name,
      drc: diagnosticState.getSnapshot().drc,
      erc: diagnosticState.getSnapshot().erc
    });
  }

  async function detectAllegroImportSupport(
    trusted: boolean,
    cliDetected: boolean
  ): Promise<boolean> {
    if (!trusted || !cliDetected) {
      return false;
    }

    try {
      return await importService.isImportFormatSupported('allegro');
    } catch (error) {
      logger.error('Allegro import capability probe failed', error);
      return false;
    }
  }

  async function selectActiveProject(
    projectOrId: ProjectContext | string
  ): Promise<void> {
    const project =
      typeof projectOrId === 'string'
        ? projectState.findProjectById(projectOrId)
        : projectOrId;
    if (!project) {
      return;
    }
    await context.workspaceState.update(ACTIVE_PROJECT_STORAGE_KEY, project.id);
    const snapshot = projectState.update({ activeProject: project });
    diagnosticState.setActiveProject(project.id);
    const diagnostics = diagnosticState.getSnapshot();
    statusBar.update({
      activeProjectName: snapshot.activeProject?.name,
      drc: diagnostics.drc,
      erc: diagnostics.erc
    });
    treeProvider.refresh();
    await pushStudioContext('focus');
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
      diagnosticState.applyValidationResult(
        vscode.Uri.file(document.fileName),
        result.diagnostics,
        result.summary,
        {
          project: projectState.findProjectForResource(document.fileName)
        }
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
      diagnosticState.recordValidationFailure(
        shouldRunDrc ? 'drc' : 'erc',
        vscode.Uri.file(document.fileName),
        error,
        {
          project: projectState.findProjectForResource(document.fileName)
        }
      );
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
      mcpState.update({
        kind: 'Disconnected',
        available: false,
        connected: false,
        message: 'MCP integration is disabled in Restricted Mode.'
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
    const activeMode =
      state.server?.capabilities.serverInfo?.operatingMode.active ?? 'unknown';
    await setMcpOperatingModeContexts(activeMode);
    mcpState.update(state);

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

  function refreshProjectsScheduled(): void {
    if (refreshProjectsTimer) {
      clearTimeout(refreshProjectsTimer);
    }
    refreshProjectsTimer = setTimeout(() => {
      refreshProjectsTimer = undefined;
      void refreshContexts();
      treeProvider.refresh();
      variantProvider.refresh();
    }, REFRESH_PROJECTS_DEBOUNCE_MS);
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
    await setMcpOperatingModeContexts('unknown');
  }

  async function setMcpOperatingModeContexts(mode: string): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpOperatingMode,
      mode
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpWriteMode,
      mode === 'write' || mode === 'experimental'
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpManufacturingMode,
      mode === 'manufacturing' || mode === 'experimental'
    );
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.mcpExperimentalMode,
      mode === 'experimental'
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

  async function buildStudioContext(): Promise<StudioContext> {
    const activeUri = getActiveResourceUri();
    const activeEditor = vscode.window.activeTextEditor;
    const selectedProject = projectState.getActiveProject();
    const resourceProject = activeUri
      ? projectState.findProjectForResource(activeUri)
      : undefined;
    const activeProject = selectedProject ?? resourceProject;
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
    const latestProjectDrcRun =
      diagnosticState.getLatestDrcRun(activeProject?.id) ?? latestDrcRun;
    return {
      activeFile: activeUri?.fsPath,
      fileType,
      project: activeProject,
      projectId: activeProject?.id,
      projectName: activeProject?.name,
      projectRoot: activeProject?.rootPath,
      projectFile: activeProject?.projectFile,
      drcErrors:
        latestProjectDrcRun?.diagnostics
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
              activeProject?.rootPath ??
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
                '',
              activeUri.fsPath
            )
          : undefined,
      visibleLayers: viewerState?.activeLayers,
      viewerEngine: viewerState?.engine,
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
