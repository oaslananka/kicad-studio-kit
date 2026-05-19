import * as vscode from 'vscode';
import {
  AI_SECRET_KEY_LEGACY,
  COMMANDS,
  OCTOPART_SECRET_KEY,
  SETTINGS
} from '../constants';
import {
  getAiSecretProviders,
  isAiSecretProvider,
  maskApiKey,
  type AiSecretProvider
} from '../utils/secrets';
import type { CommandServices } from './types';

/**
 * Register secret/API-key management commands.
 */
export function registerSecretCommands(
  services: CommandServices
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.setOctopartApiKey, async () => {
      const value = await vscode.window.showInputBox({
        title: 'Store Octopart/Nexar API key',
        password: true,
        ignoreFocusOut: true
      });
      if (!value) {
        return;
      }
      await services.context.secrets.store(OCTOPART_SECRET_KEY, value);
      void vscode.window.showInformationMessage(
        'Octopart/Nexar API key stored securely.'
      );
    }),

    vscode.commands.registerCommand(COMMANDS.setAiApiKey, async () => {
      const provider = await pickAiSecretProvider();
      if (!provider) {
        return;
      }
      const value = await vscode.window.showInputBox({
        title: `Store ${formatProviderName(provider)} API key`,
        password: true,
        ignoreFocusOut: true
      });
      if (!value) {
        return;
      }
      await services.aiProviders.setApiKey(provider, value);
      void vscode.window.showInformationMessage(
        `${formatProviderName(provider)} API key stored securely.`
      );
    }),

    vscode.commands.registerCommand(COMMANDS.clearAiKey, async () => {
      const provider = await pickAiSecretProvider();
      if (!provider) {
        return;
      }
      await services.aiProviders.clearApiKey(provider);
      void vscode.window.showInformationMessage(
        `${formatProviderName(provider)} API key cleared.`
      );
    }),

    vscode.commands.registerCommand(COMMANDS.clearSecrets, async () => {
      await services.aiProviders.clearAllApiKeys();
      await services.context.secrets.delete(AI_SECRET_KEY_LEGACY);
      await services.context.secrets.delete(OCTOPART_SECRET_KEY);
      void vscode.window.showInformationMessage(
        'Stored KiCad Studio secrets cleared.'
      );
    }),

    vscode.commands.registerCommand(COMMANDS.showStoredSecrets, async () => {
      const aiSecrets = await Promise.all(
        getAiSecretProviders().map(async (provider) => {
          const value = await services.aiProviders.getApiKey(provider);
          return value
            ? `${formatProviderName(provider)} (${maskApiKey(value)})`
            : undefined;
        })
      );
      const octopartSecret =
        await services.context.secrets.get(OCTOPART_SECRET_KEY);
      const configured = [
        ...aiSecrets,
        octopartSecret ? 'Octopart/Nexar key' : undefined
      ].filter(Boolean);
      void vscode.window.showInformationMessage(
        configured.length
          ? `Stored secrets: ${configured.join(', ')}`
          : 'No KiCad Studio secrets are currently stored.'
      );
    })
  ];
}

async function pickAiSecretProvider(): Promise<AiSecretProvider | undefined> {
  const configuredProvider = vscode.workspace
    .getConfiguration()
    .get<string>(SETTINGS.aiProvider, 'none');
  if (isAiSecretProvider(configuredProvider)) {
    return configuredProvider;
  }

  const picked = await vscode.window.showQuickPick(
    getAiSecretProviders().map((provider) => ({
      label: formatProviderName(provider),
      provider
    })),
    {
      title: 'Choose AI provider',
      placeHolder: 'Select which provider key to manage'
    }
  );
  return picked?.provider;
}

function formatProviderName(provider: AiSecretProvider): string {
  return provider === 'openai'
    ? 'OpenAI'
    : provider === 'gemini'
      ? 'Gemini'
      : 'Claude';
}
