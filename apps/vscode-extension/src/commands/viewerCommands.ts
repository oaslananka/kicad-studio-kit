import * as vscode from 'vscode';
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
      if (cli) {
        services.statusBar.update({ cli });
      }
      const snapshot = services.statusBar.getSnapshot();
      const picked = await vscode.window.showQuickPick(
        buildStatusMenuItems({ trusted, cli, snapshot }),
        { title: 'KiCad Studio Commands' }
      );
      if (picked) {
        await vscode.commands.executeCommand(
          picked.command,
          ...(picked.args ?? [])
        );
      }
    }),

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

    vscode.commands.registerCommand(COMMANDS.createVariant, async () => {
      await services.variantProvider.createVariant();
      await services.refreshContexts();
      await services.pushStudioContext();
    }),

    vscode.commands.registerCommand(
      COMMANDS.setActiveVariant,
      async (variant) => {
        await services.variantProvider.setActive(variant);
        await services.refreshContexts();
        await services.pushStudioContext();
      }
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
    )
  ];
}
