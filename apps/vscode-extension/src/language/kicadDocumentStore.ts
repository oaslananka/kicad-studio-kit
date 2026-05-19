import * as vscode from 'vscode';
import type { ParserError } from '../types';
import { SExpressionParser, type SNode } from './sExpressionParser';

export interface ParsedKiCadDocument {
  documentVersion: number;
  ast: SNode;
  errors: ParserError[];
}

/**
 * Caches parsed KiCad documents and coalesces repeated parse requests.
 */
export class KiCadDocumentStore {
  private readonly cache = new Map<string, ParsedKiCadDocument>();
  private readonly pendingParses = new Map<
    string,
    Promise<ParsedKiCadDocument>
  >();
  private readonly parseDebounce = new Map<string, NodeJS.Timeout>();

  constructor(private readonly parser: SExpressionParser) {}

  async parseDocument(
    document: vscode.TextDocument
  ): Promise<ParsedKiCadDocument> {
    const cacheKey = document.uri.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.documentVersion === document.version) {
      return cached;
    }

    const pending = this.pendingParses.get(cacheKey);
    if (pending) {
      return pending;
    }

    const next = Promise.resolve()
      .then(() => {
        const ast = this.parser.parse(document.getText());
        const parsed: ParsedKiCadDocument = {
          documentVersion: document.version,
          ast,
          errors: this.parser.getErrors(ast)
        };
        const current = this.cache.get(cacheKey);
        if (!current || current.documentVersion <= document.version) {
          this.cache.set(cacheKey, parsed);
        }
        return parsed;
      })
      .finally(() => {
        this.pendingParses.delete(cacheKey);
      });

    this.pendingParses.set(cacheKey, next);
    return next;
  }

  scheduleParse(document: vscode.TextDocument, debounceMs = 500): void {
    const cacheKey = document.uri.toString();
    const existing = this.parseDebounce.get(cacheKey);
    if (existing) {
      clearTimeout(existing);
    }
    this.parseDebounce.set(
      cacheKey,
      setTimeout(() => {
        this.parseDebounce.delete(cacheKey);
        void this.parseDocument(document);
      }, debounceMs)
    );
  }

  invalidate(uri?: vscode.Uri): void {
    if (!uri) {
      this.cache.clear();
      for (const timeout of this.parseDebounce.values()) {
        clearTimeout(timeout);
      }
      this.parseDebounce.clear();
      this.pendingParses.clear();
      return;
    }
    const key = uri.toString();
    this.cache.delete(key);
    const timeout = this.parseDebounce.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.parseDebounce.delete(key);
    }
  }
}
