import * as vscode from 'vscode';
import { CONTEXT_KEYS } from '../constants';
import type { AIProviderRegistry } from '../ai/aiProvider';
import type { KiCadCliDetector } from '../cli/kicadCliDetector';
import type { KiCadImportService } from '../cli/importCommands';
import { readConfiguredMcpProfile } from '../commands/mcpProfilePicker';
import type { KiCadProjectTreeProvider } from '../providers/projectTreeProvider';
import type {
  DiagnosticStateStore,
  ProjectStateStore
} from '../state/stateStores';
import type { KiCadStatusBar } from '../statusbar/kicadStatusBar';
import type { VariantProvider } from '../variants/variantProvider';
import type { Logger } from '../utils/logger';
import {
  getActiveResourceUri,
  workspaceHasVariants
} from '../utils/workspaceUtils';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';
import type { ProjectContext } from '../types';
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  discoverKiCadProjects,
  pickActiveProject
} from '../workspace/projectContext';
import type { ActivationState } from './activationState';
import type { PushStudioContextReason } from './studioContextController';

const REFRESH_PROJECTS_DEBOUNCE_MS = 500;

export interface WorkspaceContextControllerDeps {
  context: vscode.ExtensionContext;
  logger: Logger;
  projectState: ProjectStateStore;
  diagnosticState: DiagnosticStateStore;
  statusBar: KiCadStatusBar;
  aiProviders: AIProviderRegistry;
  cliDetector: KiCadCliDetector;
  importService: KiCadImportService;
  treeProvider: KiCadProjectTreeProvider;
  variantProvider: VariantProvider;
  activationState: ActivationState;
  pushStudioContext: (reason: PushStudioContextReason) => Promise<void>;
}

/**
 * Owns workspace/project discovery, the `setContext` keys that gate the UI, and
 * the active-project selection. Also coalesces rapid `.kicad_pro` filesystem
 * events into a single debounced refresh. Extracted unchanged from `activate()`
 * as part of the #397 composition-root split.
 */
export class WorkspaceContextController implements vscode.Disposable {
  private refreshProjectsTimer: NodeJS.Timeout | undefined;

  constructor(private readonly deps: WorkspaceContextControllerDeps) {}

  async refreshContexts(): Promise<void> {
    const {
      context,
      projectState,
      diagnosticState,
      statusBar,
      aiProviders,
      cliDetector,
      activationState
    } = this.deps;
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
    const allegroImportSupported = await this.detectAllegroImportSupport(
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
      Boolean(provider?.isConfigured() && activationState.aiHealthy !== false)
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
      aiHealthy: activationState.aiHealthy,
      mcpProfile,
      activeProjectName: projectSnapshot.activeProject?.name,
      drc: diagnosticState.getSnapshot().drc,
      erc: diagnosticState.getSnapshot().erc
    });
  }

  private async detectAllegroImportSupport(
    trusted: boolean,
    cliDetected: boolean
  ): Promise<boolean> {
    if (!trusted || !cliDetected) {
      return false;
    }

    try {
      return await this.deps.importService.isImportFormatSupported('allegro');
    } catch (error) {
      this.deps.logger.error('Allegro import capability probe failed', error);
      return false;
    }
  }

  async selectActiveProject(
    projectOrId: ProjectContext | string
  ): Promise<void> {
    const { context, projectState, diagnosticState, statusBar, treeProvider } =
      this.deps;
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
    await this.deps.pushStudioContext('focus');
  }

  scheduleProjectRefresh(): void {
    const { treeProvider, variantProvider } = this.deps;
    if (this.refreshProjectsTimer) {
      clearTimeout(this.refreshProjectsTimer);
    }
    this.refreshProjectsTimer = setTimeout(() => {
      this.refreshProjectsTimer = undefined;
      void this.refreshContexts();
      treeProvider.refresh();
      variantProvider.refresh();
    }, REFRESH_PROJECTS_DEBOUNCE_MS);
  }

  dispose(): void {
    if (this.refreshProjectsTimer) {
      clearTimeout(this.refreshProjectsTimer);
      this.refreshProjectsTimer = undefined;
    }
  }
}
