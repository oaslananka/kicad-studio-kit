import * as vscode from 'vscode';
import { COMMANDS, SETTINGS } from '../constants';
import { KiCadChatPanel } from '../ai/chatPanel';
import { formatDiagnosticSummary, getActiveAiContext } from '../ai/context';
import {
  getDefaultModel,
  getProviderModels,
  type AiProviderId
} from '../ai/modelCatalog';
import { buildProactiveDRCPrompt } from '../ai/prompts';
import { resolveTargetFile } from '../utils/workspaceUtils';
import { requireWorkspaceTrust } from '../utils/workspaceTrust';
import type { CommandServices } from './types';

/**
 * Register AI analysis and chat commands.
 */
export function registerAiCommands(
  extensionContext: vscode.ExtensionContext,
  services: CommandServices
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.aiAnalyzeError, () =>
      services.errorAnalyzer.analyzeSelectedError()
    ),

    vscode.commands.registerCommand(COMMANDS.aiProactiveDRC, async () => {
      const latest = services.getLatestDrcRun();
      const provider = await services.aiProviders.getProvider();
      if (!provider?.isConfigured()) {
        void vscode.window.showWarningMessage(
          'AI provider is not configured. Choose a provider and store an API key first.'
        );
        return;
      }
      let drcRun = latest;
      if (!drcRun) {
        if (!(await requireWorkspaceTrust('Run proactive DRC analysis'))) {
          return;
        }
        const file = await resolveTargetFile(undefined, '.kicad_pcb');
        if (!file) {
          return;
        }
        const result = await services.checkService.runDRC(file);
        drcRun = {
          file,
          diagnostics: result.diagnostics,
          summary: result.summary
        };
        services.setLatestDrcRun(drcRun);
      }
      const rankedDiagnostics = [...drcRun.diagnostics].sort(
        (left, right) => right.severity - left.severity
      );
      const prompt = buildProactiveDRCPrompt(
        rankedDiagnostics
          .slice(0, 5)
          .map(
            (diagnostic) =>
              `${diagnostic.code ?? 'rule'}: ${diagnostic.message}`
          ),
        [
          formatDiagnosticSummary(drcRun.summary),
          getActiveAiContext().description
        ]
          .filter(Boolean)
          .join('\n')
      );
      const panel = KiCadChatPanel.createOrShow(
        extensionContext,
        services.aiProviders,
        services.logger,
        services.mcpClient
      );
      await panel.submitPrompt(
        'Analyze the latest DRC results and prioritize fixes.',
        prompt
      );
    }),

    vscode.commands.registerCommand(COMMANDS.aiExplainCircuit, () =>
      services.circuitExplainer.explainSelection()
    ),

    vscode.commands.registerCommand(COMMANDS.openAiChat, () => {
      KiCadChatPanel.createOrShow(
        extensionContext,
        services.aiProviders,
        services.logger,
        services.mcpClient
      );
    }),

    vscode.commands.registerCommand(COMMANDS.testAiConnection, async () => {
      const provider = await services.aiProviders.getProvider();
      if (!provider?.isConfigured()) {
        services.setAiHealthy(undefined);
        services.statusBar.update({
          aiConfigured: false,
          aiHealthy: undefined
        });
        void vscode.window.showWarningMessage(
          'AI provider is not configured. Choose a provider and store an API key first.'
        );
        return;
      }
      const result = await provider.testConnection();
      services.setAiHealthy(result.ok);
      services.statusBar.update({ aiConfigured: true, aiHealthy: result.ok });
      if (result.ok) {
        void vscode.window.showInformationMessage(
          `${provider.name} connection OK (${result.latencyMs} ms).`
        );
      } else {
        void vscode.window.showErrorMessage(
          `${provider.name} connection failed after ${result.latencyMs} ms. ${result.error ?? ''}`.trim()
        );
      }
    }),

    vscode.commands.registerCommand(COMMANDS.manageChatProvider, async () => {
      const picked = await vscode.window.showQuickPick(
        [
          {
            label: 'Pick AI provider',
            description:
              'Choose Claude, OpenAI, Copilot, Gemini, or disable AI.',
            action: 'pick-provider'
          },
          {
            label: 'Set provider API key',
            description: 'Store the API key for the selected provider.',
            action: 'set-key'
          },
          {
            label: 'Clear provider API key',
            description: 'Remove the API key for the selected provider.',
            action: 'clear-key'
          },
          {
            label: 'Clear all AI API keys',
            description:
              'Remove Claude, OpenAI, and Gemini keys from SecretStorage.',
            action: 'clear-all'
          },
          {
            label: 'Pick provider model',
            description: 'Choose a known model or enter a custom model string.',
            action: 'pick-model'
          },
          {
            label: 'Test chat provider',
            description:
              'Verify the selected provider can answer a test request.',
            action: 'test'
          }
        ],
        {
          title: 'Manage KiCad Studio chat provider',
          placeHolder: 'Choose a provider, key, model, or test action'
        }
      );
      if (!picked) {
        return;
      }

      if (picked.action === 'pick-provider') {
        const currentProvider = services.aiProviders.getSelection().provider;
        const provider = await vscode.window.showQuickPick(
          [
            { label: 'Disabled', provider: 'none' },
            { label: 'Claude', provider: 'claude' },
            { label: 'OpenAI', provider: 'openai' },
            { label: 'GitHub Copilot', provider: 'copilot' },
            { label: 'Gemini', provider: 'gemini' }
          ],
          {
            title: 'AI provider',
            placeHolder: `Current: ${currentProvider}`
          }
        );
        if (!provider) {
          return;
        }
        await vscode.workspace
          .getConfiguration()
          .update(
            SETTINGS.aiProvider,
            provider.provider,
            vscode.ConfigurationTarget.Global
          );
        const defaultModel =
          provider.provider === 'none'
            ? ''
            : services.aiProviders.getDefaultModel(provider.provider);
        await vscode.workspace
          .getConfiguration()
          .update(
            SETTINGS.aiModel,
            defaultModel,
            vscode.ConfigurationTarget.Global
          );
        await services.refreshContexts();
        void vscode.window.showInformationMessage(
          'KiCad Studio AI provider updated.'
        );
        return;
      }

      if (picked.action === 'set-key') {
        await vscode.commands.executeCommand(COMMANDS.setAiApiKey);
        await services.refreshContexts();
        return;
      }

      if (picked.action === 'clear-key') {
        await vscode.commands.executeCommand(COMMANDS.clearAiKey);
        await services.refreshContexts();
        return;
      }

      if (picked.action === 'clear-all') {
        await services.aiProviders.clearAllApiKeys();
        await services.refreshContexts();
        void vscode.window.showInformationMessage(
          'Stored AI API keys cleared.'
        );
        return;
      }

      if (picked.action === 'pick-model') {
        const selectedProvider = services.aiProviders.getSelection().provider;
        const provider = (
          selectedProvider === 'claude' ||
          selectedProvider === 'openai' ||
          selectedProvider === 'copilot' ||
          selectedProvider === 'gemini'
            ? selectedProvider
            : 'claude'
        ) as AiProviderId;
        const knownModels =
          provider === 'claude' ||
          provider === 'openai' ||
          provider === 'copilot' ||
          provider === 'gemini'
            ? getProviderModels(provider)
            : [];
        const currentModel = vscode.workspace
          .getConfiguration()
          .get<string>(SETTINGS.aiModel, '');
        const modelPick = await vscode.window.showQuickPick(
          [
            ...knownModels.map((model) => ({
              label: model.id,
              description: model.recommended ? 'Recommended' : model.label,
              model: model.id
            })),
            {
              label: 'Custom model...',
              description: 'Enter an explicit provider model id.',
              model: '__custom__'
            }
          ],
          {
            title: 'AI model',
            placeHolder: currentModel || getDefaultModel(provider)
          }
        );
        if (!modelPick) {
          return;
        }
        const model =
          modelPick.model === '__custom__'
            ? await vscode.window.showInputBox({
                title: 'Custom AI model',
                value: currentModel,
                prompt: 'Leave empty to use the provider default.'
              })
            : modelPick.model;
        if (typeof model !== 'string') {
          return;
        }

        await vscode.workspace
          .getConfiguration()
          .update(
            SETTINGS.aiModel,
            model.trim(),
            vscode.ConfigurationTarget.Global
          );
        void vscode.window.showInformationMessage(
          'KiCad Studio chat provider settings updated.'
        );
        return;
      }

      if (picked.action === 'test') {
        await vscode.commands.executeCommand(COMMANDS.testAiConnection);
      }
    })
  ];
}
