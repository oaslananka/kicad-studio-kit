import * as vscode from 'vscode';
import { SExpressionParser, type SNode } from './sExpressionParser';

const SYMBOL_TAGS = new Set([
  'symbol',
  'sheet',
  'footprint',
  'net',
  'property',
  'wire',
  'segment',
  'zone'
]);

export class KiCadSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private readonly parser: SExpressionParser) {}

  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const ast = this.parser.parse(document.getText());
    const symbols: vscode.DocumentSymbol[] = [];

    const visit = (node: SNode): void => {
      const tag = this.getTag(node);
      if (tag && SYMBOL_TAGS.has(tag)) {
        const range = this.parser.getPosition(node);
        const symbol = new vscode.DocumentSymbol(
          this.getLabel(tag, node),
          tag,
          this.getKind(tag),
          range,
          range
        );
        symbols.push(symbol);
      }
      node.children?.forEach(visit);
    };

    ast.children?.forEach(visit);
    return symbols;
  }

  private getTag(node: SNode): string | undefined {
    if (node.type !== 'list' || !node.children?.length) {
      return undefined;
    }
    const first = node.children[0];
    if (!first) {
      return undefined;
    }
    return first.type === 'atom' || first.type === 'string'
      ? String(first.value ?? '')
      : undefined;
  }

  private getLabel(tag: string, node: SNode): string {
    const maybeName = node.children
      ?.slice(1)
      .find(
        (child) =>
          child.type === 'string' ||
          child.type === 'atom' ||
          child.type === 'number'
      );
    return maybeName ? `${tag} ${String(maybeName.value)}` : tag;
  }

  private getKind(tag: string): vscode.SymbolKind {
    switch (tag) {
      case 'symbol':
      case 'footprint':
        return vscode.SymbolKind.Object;
      case 'net':
      case 'wire':
      case 'segment':
        return vscode.SymbolKind.Field;
      case 'sheet':
        return vscode.SymbolKind.Module;
      case 'property':
        return vscode.SymbolKind.Property;
      default:
        return vscode.SymbolKind.String;
    }
  }
}
