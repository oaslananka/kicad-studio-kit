import * as vscode from 'vscode';
import { getActiveAiContext } from './context';
import { AIProviderRegistry } from './aiProvider';
import { Logger } from '../utils/logger';
import { SETTINGS } from '../constants';
import {
  buildErrorAnalysisPrompt,
  buildSystemPrompt,
  DEFAULT_AI_LANGUAGE,
  normalizeAiLanguage
} from './prompts';

export class ErrorAnalyzer {
  constructor(
    private readonly providers: AIProviderRegistry,
    private readonly logger: Logger
  ) {}

  async analyzeSelectedError(): Promise<void> {
    const provider = await this.providers.getProvider();
    if (!provider?.isConfigured()) {
      void vscode.window.showWarningMessage(
        'AI provider is not configured. Choose a provider and store an API key first.'
      );
      return;
    }

    const activeDiagnostic = this.getActiveProblemsPanelDiagnostic();
    const activeContext = getActiveAiContext();
    const message =
      activeDiagnostic?.message ||
      (await vscode.window.showInputBox({
        title: 'Paste the DRC/ERC error description',
        prompt: 'Example: Clearance violation between U1 pad 1 and net GND'
      }));
    if (!message) {
      return;
    }

    const ruleName = activeDiagnostic?.code
      ? String(activeDiagnostic.code)
      : await vscode.window.showInputBox({
          title: 'Rule name',
          prompt: 'Example: clearance'
        });
    const boardInfo =
      activeContext.description ||
      (await vscode.window.showInputBox({
        title: 'Board context',
        prompt: 'Example: MainBoard, 4 layers'
      }));

    const language = normalizeAiLanguage(
      vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.aiLanguage, DEFAULT_AI_LANGUAGE)
    );
    const promptArgs: {
      message: string;
      ruleName?: string;
      boardInfo?: string;
    } = { message };
    if (ruleName) {
      promptArgs.ruleName = ruleName;
    }
    if (boardInfo) {
      promptArgs.boardInfo = boardInfo;
    }
    const response = await provider.analyze(
      buildErrorAnalysisPrompt(promptArgs),
      boardInfo ?? '',
      buildSystemPrompt(language)
    );
    this.logger.info(`AI analysis (${provider.name})\n${response}`);
    this.logger.show();
    await vscode.env.clipboard.writeText(response);
    void vscode.window.showInformationMessage(
      'AI analysis copied to clipboard and written to the KiCad Studio output channel.'
    );
  }

  private getActiveProblemsPanelDiagnostic(): vscode.Diagnostic | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const selectedLine = editor.selection.active.line;
    return (
      diagnostics.find(
        (diagnostic) =>
          diagnostic.range.start.line <= selectedLine &&
          diagnostic.range.end.line >= selectedLine
      ) ?? diagnostics[0]
    );
  }
}
