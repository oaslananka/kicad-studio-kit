import * as vscode from 'vscode';
import { AIProviderRegistry } from './aiProvider';
import { getActiveAiContext } from './context';
import { Logger } from '../utils/logger';
import { SETTINGS } from '../constants';
import {
  buildCircuitExplanationPrompt,
  buildSystemPrompt,
  DEFAULT_AI_LANGUAGE,
  normalizeAiLanguage
} from './prompts';

export class CircuitExplainer {
  constructor(
    private readonly providers: AIProviderRegistry,
    private readonly logger: Logger
  ) {}

  async explainSelection(): Promise<void> {
    const provider = await this.providers.getProvider();
    if (!provider?.isConfigured()) {
      void vscode.window.showWarningMessage(
        'AI provider is not configured. Choose a provider and store an API key first.'
      );
      return;
    }

    const editor = vscode.window.activeTextEditor;
    const selectedText = editor?.document.getText(editor.selection).trim();
    if (!selectedText) {
      void vscode.window.showWarningMessage(
        'Select a schematic block or relevant text before running AI Explain Circuit.'
      );
      return;
    }

    const language = normalizeAiLanguage(
      vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.aiLanguage, DEFAULT_AI_LANGUAGE)
    );
    const activeContext = getActiveAiContext();
    const response = await provider.analyze(
      buildCircuitExplanationPrompt(),
      [
        activeContext.description,
        'Selected content:',
        selectedText,
        activeContext.documentPreview
          ? `File preview:\n${activeContext.documentPreview}`
          : ''
      ]
        .filter(Boolean)
        .join('\n\n'),
      buildSystemPrompt(language, activeContext.projectContext)
    );
    this.logger.info(`Circuit explanation (${provider.name})\n${response}`);
    this.logger.show();
    void vscode.window.showInformationMessage(
      'Circuit explanation written to the KiCad Studio output channel.'
    );
  }
}
