import * as vscode from 'vscode';
import { LANGUAGE_COMPLETIONS } from './kicadSchemas';
import { SExpressionParser } from './sExpressionParser';

export class KiCadCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly _parser: SExpressionParser) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const completions = LANGUAGE_COMPLETIONS[document.languageId] ?? [];
    const linePrefix = document
      .lineAt(position)
      .text.slice(0, position.character);
    const isAfterOpenParen = linePrefix.endsWith('(');

    return completions.map((tag) => {
      const item = new vscode.CompletionItem(
        tag,
        vscode.CompletionItemKind.Keyword
      );
      item.detail = 'KiCad S-expression node';
      item.insertText = isAfterOpenParen ? tag : `(${tag})`;
      const range = document.getWordRangeAtPosition(
        position,
        /[A-Za-z0-9_.:-]*/
      );
      if (range) {
        item.range = range;
      }
      return item;
    });
  }
}
