import * as vscode from 'vscode';
import { KEYWORD_DESCRIPTIONS } from './kicadSchemas';
import { SExpressionParser } from './sExpressionParser';

export class KiCadHoverProvider implements vscode.HoverProvider {
  constructor(private readonly parser: SExpressionParser) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const range = document.getWordRangeAtPosition(position, /[A-Za-z0-9_.:-]+/);
    if (!range) {
      return undefined;
    }

    const text = document.getText(range);
    const descriptions = KEYWORD_DESCRIPTIONS[document.languageId];
    const description = descriptions?.get(text);
    if (description) {
      const markdown = new vscode.MarkdownString(
        `**${text}**\n\n${description}`
      );
      markdown.isTrusted = false;
      return new vscode.Hover(markdown, range);
    }

    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        text
      )
    ) {
      return new vscode.Hover('KiCad UUID');
    }

    const parsed = this.parser.parse(document.getText());
    const hit = this.parser.findAllNodes(parsed, text)[0];
    if (hit) {
      return new vscode.Hover(`KiCad node \`${text}\``, range);
    }

    return undefined;
  }
}
