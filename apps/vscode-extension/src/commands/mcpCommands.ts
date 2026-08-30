import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { McpDetector } from '../mcp/mcpDetector';
import { KICAD_MCP_PROFILES } from '../mcp/profileCatalog';
import { DesignIntentPanel } from '../mcp/designIntentPanel';
import { DrcRuleEditorPanel } from '../drc/drcRuleEditorPanel';
import { registerTrustedCommand } from '../utils/workspaceTrust';
import { DOCUMENTATION_URLS } from '../documentation/documentationUrls';
import {
  showStructuredError,
  structuredErrorFromUnknown,
  troubleshootingUri
} from '../utils/notifications';
import type { CommandServices } from './types';
import type { FixItem } from '../types';

function createTaskProcessCompletion(task: vscode.Task): {
  promise: Promise<number | undefined>;
  dispose(): void;
} {
  let disposable: vscode.Disposable | undefined;
  const promise = new Promise<number | undefined>((resolve) => {
    disposable = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution.task !== task) {
        return;
      }
      disposable?.dispose();
      resolve(event.exitCode);
    });
  });
  return {
    promise,
    dispose: () => disposable?.dispose()
  };
}

/**
 * Register MCP integration commands.
 */
export function registerMcpCommands(
  extensionContext: vscode.ExtensionContext,
  services: CommandServices
): vscode.Disposable[] {
  return [
    registerTrustedCommand(
      COMMANDS.setupMcpIntegration,
      async () => {
        const install = await services.mcpClient.detectInstall();
        if (!install.found) {
          const choice = await vscode.window.showWarningMessage(
            'kicad-mcp-pro could not be detected. Install it first, then rerun setup.',
            'Install',
            'Open Repository'
          );
          if (choice === 'Install') {
            await vscode.commands.executeCommand(COMMANDS.installMcp);
            return;
          }
          if (choice === 'Open Repository') {
            await vscode.env.openExternal(
              vscode.Uri.parse('https://github.com/oaslananka/kicad-studio-kit')
            );
          }
          return;
        }
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
          void vscode.window.showWarningMessage(
            'Open a workspace folder before configuring MCP integration.'
          );
          return;
        }

        // ── Step 1: transport ─────────────────────────────────────────────────
        const transport = await vscode.window.showQuickPick(
          [
            {
              label: '$(plug) stdio — VS Code MCP (default)',
              description:
                'Managed by VS Code; works with Copilot, Claude Code, Cursor. Quality Gates and Fix Queue require HTTP.',
              value: 'stdio'
            },
            {
              label: '$(server) HTTP — port 27185',
              description:
                'Starts kicad-mcp-pro as a standalone HTTP server. Enables Quality Gates and AI Fix Queue in KiCad Studio.',
              value: 'http'
            }
          ],
          {
            title: 'Select kicad-mcp-pro transport',
            placeHolder: 'How should kicad-mcp-pro run?'
          }
        );
        if (!transport) {
          return;
        }

        // ── Step 2: profile ───────────────────────────────────────────────────
        const detector = new McpDetector();
        const profile = await vscode.window.showQuickPick(
          KICAD_MCP_PROFILES.map((profile) => profile.id),
          {
            title: 'Select kicad-mcp-pro profile',
            placeHolder: 'Choose the MCP tool profile'
          }
        );
        if (!profile) {
          return;
        }

        if (transport.value === 'http') {
          await detector.generateHttpConfig(root, install, profile);
        } else {
          await detector.generateMcpJson(root, install, profile);
        }
        await services.refreshMcpState();
      },
      'Setup MCP Integration'
    ),

    registerTrustedCommand(
      COMMANDS.launchMcpHttp,
      async () => {
        const install = await services.mcpClient.detectInstall();
        if (!install.found) {
          const choice = await vscode.window.showWarningMessage(
            'kicad-mcp-pro could not be detected. Install it first.',
            'Install',
            'Cancel'
          );
          if (choice === 'Install') {
            await vscode.commands.executeCommand(COMMANDS.installMcp);
          }
          return;
        }
        const root =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
        const detector = new McpDetector();
        const profile = await vscode.window.showQuickPick(
          KICAD_MCP_PROFILES.map((profile) => profile.id),
          {
            title: 'Select kicad-mcp-pro profile',
            placeHolder: 'Profile for the HTTP server'
          }
        );
        if (!profile) {
          return;
        }
        const port = vscode.workspace
          .getConfiguration()
          .get<string>('kicadstudio.mcp.endpoint', 'http://127.0.0.1:27185')
          .match(/:(\d+)/)?.[1];
        const portNum = port ? parseInt(port, 10) : 27185;
        await detector.generateHttpConfig(root, install, profile, portNum);
        await services.refreshMcpState();
      },
      'Launch kicad-mcp-pro (HTTP)'
    ),

    registerTrustedCommand(
      COMMANDS.installMcp,
      async () => {
        const detector = new McpDetector();
        const candidates = await detector.detectInstallers();
        if (candidates.length === 0) {
          const action = await vscode.window.showWarningMessage(
            'kicad-mcp-pro requires Python 3.13 or newer. Install Python 3.13+ or uv, then retry.',
            'Open install docs'
          );
          if (action === 'Open install docs') {
            await vscode.env.openExternal(
              vscode.Uri.parse(DOCUMENTATION_URLS.mcpServerInstallation)
            );
          }
          return;
        }

        const choice = await vscode.window.showQuickPick(
          [
            ...candidates.map((candidate) => ({
              label: candidate.label,
              description: candidate.description,
              candidate
            })),
            {
              label: 'Open install docs',
              description: 'Open kicad-mcp-pro installation documentation'
            }
          ],
          {
            title: 'Install kicad-mcp-pro'
          }
        );
        if (!choice) {
          return;
        }
        if (!('candidate' in choice)) {
          await vscode.env.openExternal(
            vscode.Uri.parse(
              'https://github.com/oaslananka/kicad-studio-kit#installation'
            )
          );
          return;
        }
        const task = new vscode.Task(
          {
            type: 'shell',
            task: 'install-kicad-mcp-pro'
          },
          vscode.TaskScope.Workspace,
          'Install kicad-mcp-pro',
          'KiCad',
          new vscode.ProcessExecution(
            choice.candidate.command,
            choice.candidate.args
          )
        );
        const completion = createTaskProcessCompletion(task);
        let exitCode: number | undefined;
        try {
          await vscode.tasks.executeTask(task);
          exitCode = await completion.promise;
        } finally {
          completion.dispose();
        }
        if (exitCode === 0) {
          await services.refreshMcpState();
          void vscode.window.showInformationMessage(
            'kicad-mcp-pro installation completed. MCP detection refreshed.'
          );
          return;
        }

        void vscode.window.showErrorMessage(
          'kicad-mcp-pro installation failed. Review the install task output and retry after resolving the prerequisite.'
        );
      },
      'Install kicad-mcp-pro'
    ),

    vscode.commands.registerCommand(COMMANDS.retryMcp, async () => {
      await services.mcpClient.retryNow();
      await services.refreshMcpState();
    }),

    vscode.commands.registerCommand(COMMANDS.openMcpUpgradeGuide, () =>
      vscode.env.openExternal(
        vscode.Uri.parse(DOCUMENTATION_URLS.mcpServerInstallation)
      )
    ),

    registerTrustedCommand(
      COMMANDS.pickMcpProfile,
      async () => {
        const { pickMcpProfile } = await import('./mcpProfilePicker');
        await pickMcpProfile(services);
      },
      'Pick MCP Profile'
    ),

    registerTrustedCommand(
      COMMANDS.openDesignIntent,
      () => {
        DesignIntentPanel.createOrShow(extensionContext, services.mcpAdapter);
      },
      'Design Intent'
    ),

    vscode.commands.registerCommand(COMMANDS.refreshFixQueue, () =>
      services.fixQueueProvider.refresh()
    ),

    registerTrustedCommand(
      COMMANDS.applyFixQueueItem,
      async (item: FixItem) =>
        runWithStructuredMcpErrorHandling(services, () =>
          services.fixQueueProvider.applyFix(item)
        ),
      'Apply MCP Fix'
    ),

    registerTrustedCommand(
      COMMANDS.applyFixQueueById,
      async (id: string) =>
        runWithStructuredMcpErrorHandling(services, () =>
          services.fixQueueProvider.applyFixById(id)
        ),
      'Apply MCP Fix'
    ),

    registerTrustedCommand(
      COMMANDS.applyAllFixQueueItems,
      async () =>
        runWithStructuredMcpErrorHandling(services, () =>
          services.fixQueueProvider.applyAll()
        ),
      'Apply MCP Fixes'
    ),

    registerTrustedCommand(
      COMMANDS.addDrcRuleWithMcp,
      async () => {
        await DrcRuleEditorPanel.createOrShow(
          extensionContext,
          services.mcpAdapter
        );
      },
      'DRC Rule MCP Editing'
    ),

    registerTrustedCommand(
      COMMANDS.manufacturingRelease,
      async () => {
        const { runManufacturingReleaseWizard } =
          await import('./manufacturingReleaseWizard');
        await runManufacturingReleaseWizard(services);
      },
      'Manufacturing Release'
    )
  ];
}

async function runWithStructuredMcpErrorHandling(
  services: CommandServices,
  action: () => Promise<void>
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const structured = structuredErrorFromUnknown(error);
    if (structured) {
      await showStructuredError(
        structured,
        troubleshootingUri(services.context.extensionUri, structured.code)
      );
      return;
    }
    throw error;
  }
}
