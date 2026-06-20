import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  COMMANDS,
  PCB_EDITOR_VIEW_TYPE,
  SCHEMATIC_EDITOR_VIEW_TYPE
} from '../constants';
import type { DrcRuleItem } from '../drc/drcRulesProvider';
import { getActiveResourceUri } from '../utils/workspaceUtils';
import {
  isWorkspaceTrusted,
  registerTrustedCommand
} from '../utils/workspaceTrust';
import { resolveKiCadExecutable, launchDetached } from './kicadLauncher';
import { buildStatusMenuItems } from './viewerStatusMenu';
import type { CommandServices } from './types';
import { findFirstWorkspaceFile, getWorkspaceRoot } from '../utils/pathUtils';
import type { KiCadVariant, ProjectContext, ProjectTreeNode } from '../types';
import { unwrapPcmPackage } from '../library/pcmLibraryProvider';
import type { PcmPackage } from '../library/pcmService';

/**
 * Register viewer, tree, library, variant, and general navigation commands.
 */
export function registerViewerCommands(
  services: CommandServices
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.showStatusMenu, async () => {
      const trusted = isWorkspaceTrusted();
      const cli = trusted
        ? await services.cliDetector.detect(false)
        : undefined;
      const capabilities = cli
        ? await services.cliDetector.getCapabilitySnapshot()
        : undefined;
      if (cli) {
        services.statusBar.update({ cli });
      }
      const snapshot = services.statusBar.getSnapshot();
      const picked = await vscode.window.showQuickPick(
        buildStatusMenuItems({ trusted, cli, capabilities, snapshot }),
        { title: 'KiCad Studio Commands' }
      );
      if (picked?.command) {
        await vscode.commands.executeCommand(
          picked.command,
          ...(picked.args ?? [])
        );
      }
    }),

    vscode.commands.registerCommand(
      COMMANDS.selectActiveProject,
      async (
        target?: vscode.Uri | ProjectContext | ProjectTreeNode | string
      ) => {
        const directProject = resolveCommandProject(services, target);
        const project =
          directProject ?? (await pickProjectFromQuickPick(services));
        if (!project) {
          return;
        }
        await services.selectActiveProject(project);
      }
    ),

    vscode.commands.registerCommand(
      COMMANDS.openSchematic,
      async (resource?: vscode.Uri) => {
        const uri = resource ?? getActiveResourceUri();
        if (uri) {
          await vscode.commands.executeCommand(
            'vscode.openWith',
            uri,
            SCHEMATIC_EDITOR_VIEW_TYPE
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      COMMANDS.openPCB,
      async (resource?: vscode.Uri) => {
        const uri = resource ?? getActiveResourceUri();
        if (uri) {
          await vscode.commands.executeCommand(
            'vscode.openWith',
            uri,
            PCB_EDITOR_VIEW_TYPE
          );
        }
      }
    ),

    registerTrustedCommand(
      COMMANDS.openInKiCad,
      async (resource?: vscode.Uri) => {
        try {
          const uri = resource ?? getActiveResourceUri();
          if (!uri) {
            return;
          }
          const executable = resolveKiCadExecutable(uri.fsPath);
          await launchDetached(executable.command, [
            ...executable.args,
            uri.fsPath
          ]);
        } catch (error) {
          services.logger.error('Open in KiCad failed', error);
          void vscode.window.showErrorMessage(
            error instanceof Error
              ? `Unable to open KiCad.\nWhat happened: ${error.message}\nHow to fix: install KiCad or configure kicadstudio.kicadPath.`
              : 'Unable to open KiCad.\nWhat happened: KiCad executable was not found.\nHow to fix: install KiCad or configure kicadstudio.kicadPath.'
          );
        }
      },
      'Open in KiCad'
    ),

    registerTrustedCommand(
      COMMANDS.detectCli,
      async () => {
        const cli = await services.cliDetector.detect(true);
        services.statusBar.update({ cli });
      },
      'Detect kicad-cli'
    ),

    vscode.commands.registerCommand(COMMANDS.searchComponent, () =>
      services.componentSearch.search()
    ),

    vscode.commands.registerCommand(
      COMMANDS.showDiff,
      (resource?: vscode.Uri) => services.diffEditorProvider.show(resource)
    ),

    vscode.commands.registerCommand(COMMANDS.refreshProjectTree, () =>
      services.treeProvider.refresh()
    ),

    vscode.commands.registerCommand(COMMANDS.searchLibrarySymbol, () =>
      services.librarySearch.searchSymbols()
    ),

    vscode.commands.registerCommand(COMMANDS.searchLibraryFootprint, () =>
      services.librarySearch.searchFootprints()
    ),

    vscode.commands.registerCommand(COMMANDS.reindexLibraries, async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'KiCad libraries are being reindexed...'
        },
        (progress) => services.libraryIndexer.indexAll(progress)
      );
      void vscode.window.showInformationMessage('Library index updated.');
    }),

    vscode.commands.registerCommand(COMMANDS.refreshPcmLibraries, async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'KiCad PCM repositories are being refreshed...'
        },
        () => services.pcmLibraryProvider.refresh()
      );
    }),

    vscode.commands.registerCommand(COMMANDS.filterPcmLibraries, () =>
      services.pcmLibraryProvider.pickFilter()
    ),

    registerTrustedCommand(
      COMMANDS.installPcmPackage,
      async (target?: unknown) => {
        const pkg = await resolvePcmCommandPackage(services, target, 'install');
        if (!pkg) {
          return;
        }
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Installing ${pkg.metadata.name} from KiCad PCM...`
          },
          () => services.pcmService.installPackage(pkg)
        );
        await services.pcmLibraryProvider.refresh();
        void vscode.window.showInformationMessage(
          `${pkg.metadata.name} installed from KiCad PCM.`
        );
      },
      'Install PCM package'
    ),

    registerTrustedCommand(
      COMMANDS.updatePcmPackage,
      async (target?: unknown) => {
        const pkg = await resolvePcmCommandPackage(services, target, 'update');
        if (!pkg) {
          return;
        }
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Updating ${pkg.metadata.name} from KiCad PCM...`
          },
          () => services.pcmService.updatePackage(pkg)
        );
        await services.pcmLibraryProvider.refresh();
        void vscode.window.showInformationMessage(
          `${pkg.metadata.name} updated from KiCad PCM.`
        );
      },
      'Update PCM package'
    ),

    registerTrustedCommand(
      COMMANDS.updateAllPcmPackages,
      async () => {
        const updated = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Updating KiCad PCM packages...'
          },
          () => services.pcmService.updateAllPackages()
        );
        await services.pcmLibraryProvider.refresh();
        void vscode.window.showInformationMessage(
          updated.length
            ? `${updated.length} KiCad PCM package(s) updated.`
            : 'No KiCad PCM updates were available.'
        );
      },
      'Update all PCM packages'
    ),

    registerTrustedCommand(
      COMMANDS.uninstallPcmPackage,
      async (target?: unknown) => {
        const pkg = await resolvePcmCommandPackage(
          services,
          target,
          'uninstall'
        );
        if (!pkg) {
          return;
        }
        await services.pcmService.uninstallPackage(pkg);
        await services.pcmLibraryProvider.refresh();
        void vscode.window.showInformationMessage(
          `${pkg.metadata.name} uninstalled from KiCad PCM.`
        );
      },
      'Uninstall PCM package'
    ),

    registerTrustedCommand(
      COMMANDS.createVariant,
      async () => {
        await services.variantProvider.createVariant();
        await services.refreshContexts();
        await services.pushStudioContext();
      },
      'Create Variant'
    ),

    registerTrustedCommand(
      COMMANDS.setActiveVariant,
      async (variant: KiCadVariant) => {
        await services.variantProvider.setActive(variant);
        await services.refreshContexts();
        await services.pushStudioContext();
      },
      'Set Active Variant'
    ),

    vscode.commands.registerCommand(COMMANDS.diffVariantBom, () =>
      services.variantProvider.diffBom()
    ),

    vscode.commands.registerCommand(COMMANDS.refreshVariants, () =>
      services.variantProvider.refresh()
    ),

    vscode.commands.registerCommand(
      COMMANDS.revealDrcRule,
      (item: DrcRuleItem) => services.drcRulesProvider.reveal(item)
    ),

    registerTrustedCommand(
      COMMANDS.createDrcRulesFile,
      async () => {
        await createDrcRulesFile(services, 'default');
      },
      'Create .kicad_dru'
    ),

    registerTrustedCommand(
      COMMANDS.importDrcRulesTemplate,
      async () => {
        await createDrcRulesFile(services, 'fabrication');
      },
      'Import .kicad_dru template'
    )
  ];
}

export function resolveCommandProject(
  services: CommandServices,
  target: vscode.Uri | ProjectContext | ProjectTreeNode | string | undefined
): ProjectContext | undefined {
  if (!target) {
    return undefined;
  }
  if (typeof target === 'string') {
    return services.projectState.findProjectById(target);
  }
  if ('projectFile' in target) {
    return target;
  }
  if ('project' in target && target.project) {
    return target.project;
  }
  if ('fsPath' in target) {
    return services.projectState.findProjectForResource(target);
  }
  return undefined;
}

export async function pickProjectFromQuickPick(
  services: CommandServices
): Promise<ProjectContext | undefined> {
  const projects = services.projectState.getProjects();
  if (!projects.length) {
    void vscode.window.showWarningMessage(
      'No KiCad project file was found in this workspace.'
    );
    return undefined;
  }
  if (projects.length === 1) {
    return projects[0];
  }

  const picked = await vscode.window.showQuickPick(
    projects.map((project) => ({
      label: project.name,
      description: path.relative(project.workspaceFolder, project.rootPath),
      detail: project.projectFile,
      project
    })),
    { title: 'Select Active KiCad Project' }
  );
  return picked?.project;
}

async function resolvePcmCommandPackage(
  services: CommandServices,
  target: unknown,
  action: 'install' | 'update' | 'uninstall'
): Promise<PcmPackage | undefined> {
  const direct = unwrapPcmPackage(target);
  if (direct) {
    return direct;
  }
  const identifier = typeof target === 'string' ? target : undefined;
  if (identifier) {
    const availablePackages = services.pcmService.getPackages().length
      ? services.pcmService.getPackages()
      : await services.pcmService.refreshRepositories();
    const found = availablePackages.find(
      (pkg) => pkg.metadata.identifier === identifier
    );
    if (found) {
      return found;
    }
  }
  const packages = services.pcmService.getPackages().length
    ? services.pcmService.getPackages()
    : await services.pcmService.refreshRepositories();
  const candidates = packages.filter((pkg) => {
    if (action === 'install') {
      return pkg.state === 'available' || pkg.state === 'update-available';
    }
    if (action === 'update') {
      return pkg.state === 'update-available';
    }
    return pkg.state === 'installed' || pkg.state === 'update-available';
  });
  if (!candidates.length) {
    void vscode.window.showInformationMessage(
      action === 'update'
        ? 'No KiCad PCM updates were available.'
        : 'No KiCad PCM packages matched this action.'
    );
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    candidates.map((pkg) => ({
      label: pkg.metadata.name,
      description: pkg.latestVersion?.version ?? pkg.metadata.identifier,
      detail: pkg.metadata.description,
      pkg
    })),
    { title: `Select PCM package to ${action}` }
  );
  return picked?.pkg;
}

type DrcTemplate = 'default' | 'fabrication';

async function createDrcRulesFile(
  services: CommandServices,
  template: DrcTemplate
): Promise<void> {
  const target = await resolveDrcRulesPath();
  if (!target) {
    void vscode.window.showWarningMessage(
      'Open a KiCad workspace before creating a .kicad_dru rules file.'
    );
    return;
  }

  if (!fs.existsSync(target)) {
    const content = drcRulesTemplate(template);
    const document = await vscode.workspace.openTextDocument({
      content,
      language: 'kicad-drc'
    });
    await vscode.window.showTextDocument(document, { preview: true });
    const choice = await vscode.window.showInformationMessage(
      `.kicad_dru will be created at ${target}.`,
      { modal: true },
      'Create File',
      'Cancel'
    );
    if (choice !== 'Create File') {
      return;
    }
    fs.writeFileSync(target, content, 'utf8');
  }

  const document = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(document, { preview: false });
  services.drcRulesProvider.refresh();
}

async function resolveDrcRulesPath(): Promise<string | undefined> {
  const existing = await findFirstWorkspaceFile('**/*.kicad_dru');
  if (existing) {
    return existing;
  }

  const project = await findFirstWorkspaceFile('**/*.kicad_pro');
  if (project) {
    return path.join(
      path.dirname(project),
      `${path.parse(project).name}.kicad_dru`
    );
  }

  const root = getWorkspaceRoot();
  return root ? path.join(root, 'kicad-studio.kicad_dru') : undefined;
}

function drcRulesTemplate(template: DrcTemplate): string {
  if (template === 'fabrication') {
    return `(version 1)

(rule "Fabrication minimum clearance"
  (constraint clearance (min 0.20mm)))

(rule "Fabrication minimum track width"
  (constraint track_width (min 0.20mm)))

(rule "Fabrication silk to copper clearance"
  (constraint silk_clearance (min 0.15mm)))
`;
  }

  return `(version 1)

(rule "Minimum copper clearance"
  (constraint clearance (min 0.20mm)))
`;
}
