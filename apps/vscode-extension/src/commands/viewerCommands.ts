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
      if (picked?.command) {
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
