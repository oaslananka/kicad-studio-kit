import * as vscode from 'vscode';
import { LARGE_FILE_BYTES, PARTIAL_PARSE_LINE_LIMIT } from '../constants';
import type { ParserError } from '../types';

export interface SNode {
  type: 'atom' | 'string' | 'number' | 'list';
  value?: string | number | undefined;
  children?: SNode[] | undefined;
  position: { line: number; col: number; end: number };
}

interface CursorState {
  index: number;
  line: number;
  col: number;
}

interface RangeMeta {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

interface ParseContext {
  text: string;
  cursor: CursorState;
  baseOffset: number;
  errors: ParserError[];
  allowPartialEof: boolean;
}

export class SExpressionParser {
  private readonly ranges = new WeakMap<SNode, RangeMeta>();
  private readonly errors = new WeakMap<SNode, ParserError[]>();
  private readonly lazyFullText = new WeakMap<SNode, string>();
  private readonly nodeIndexes = new WeakMap<SNode, Map<string, SNode[]>>();

  parse(text: string): SNode {
    if (Buffer.byteLength(text, 'utf8') > LARGE_FILE_BYTES) {
      const head = text
        .split(/\r?\n/)
        .slice(0, PARTIAL_PARSE_LINE_LIMIT)
        .join('\n');
      const partial = this.parseInternal(head, true);
      this.lazyFullText.set(partial, text);
      this.errors.set(partial, []);
      return partial;
    }

    return this.parseInternal(text, false);
  }

  getErrors(root: SNode): ParserError[] {
    this.ensureExpanded(root);
    return [...(this.errors.get(root) ?? [])];
  }

  findNode(root: SNode, ...path: string[]): SNode | undefined {
    this.ensureExpanded(root);
    let current: SNode | undefined = root;
    for (const tag of path) {
      if (!current?.children) {
        return undefined;
      }
      current = current.children.find(
        (child) => this.getListTag(child) === tag
      );
    }
    return current;
  }

  findAllNodes(root: SNode, tag: string): SNode[] {
    this.ensureExpanded(root);
    return [...(this.getNodeIndex(root).get(tag) ?? [])];
  }

  getAtomValue(node: SNode, childTag: string): string | undefined {
    this.ensureExpanded(node);
    const child = node.children?.find(
      (candidate) => this.getListTag(candidate) === childTag
    );
    if (!child?.children || child.children.length < 2) {
      return undefined;
    }
    const valueNode = child.children[1];
    if (!valueNode) {
      return undefined;
    }
    if (
      valueNode.type === 'string' ||
      valueNode.type === 'atom' ||
      valueNode.type === 'number'
    ) {
      return String(valueNode.value ?? '');
    }
    return undefined;
  }

  getPosition(node: SNode): vscode.Range {
    this.ensureExpanded(node);
    const range = this.ranges.get(node);
    if (!range) {
      return new vscode.Range(
        node.position.line,
        node.position.col,
        node.position.line,
        node.position.col
      );
    }
    return new vscode.Range(
      range.startLine,
      range.startCol,
      range.endLine,
      range.endCol
    );
  }

  private ensureExpanded(root: SNode): void {
    const fullText = this.lazyFullText.get(root);
    if (!fullText) {
      return;
    }

    const expanded = this.parseInternal(fullText, false);
    root.type = expanded.type;
    root.value = expanded.value;
    root.children = expanded.children;
    root.position = expanded.position;
    this.ranges.set(
      root,
      this.ranges.get(expanded) ?? {
        startLine: root.position.line,
        startCol: root.position.col,
        endLine: root.position.line,
        endCol: root.position.col
      }
    );
    this.errors.set(root, this.errors.get(expanded) ?? []);
    this.lazyFullText.delete(root);
    this.nodeIndexes.delete(root);
  }

  private getNodeIndex(root: SNode): Map<string, SNode[]> {
    const existing = this.nodeIndexes.get(root);
    if (existing) {
      return existing;
    }

    const index = new Map<string, SNode[]>();
    const visit = (node: SNode): void => {
      const tag = this.getListTag(node);
      if (tag) {
        const nodes = index.get(tag) ?? [];
        nodes.push(node);
        index.set(tag, nodes);
      }
      node.children?.forEach(visit);
    };
    visit(root);
    this.nodeIndexes.set(root, index);
    return index;
  }

  private parseInternal(text: string, allowPartialEof: boolean): SNode {
    const context: ParseContext = {
      text,
      cursor: { index: 0, line: 0, col: 0 },
      baseOffset: 0,
      errors: [],
      allowPartialEof
    };

    const rootChildren: SNode[] = [];
    while (this.skipTrivia(context)) {
      const node = this.parseNode(context);
      if (!node) {
        break;
      }
      rootChildren.push(node);
    }

    const root: SNode = {
      type: 'list',
      children: rootChildren,
      position: {
        line: 0,
        col: 0,
        end: text.length
      }
    };
    this.ranges.set(root, {
      startLine: 0,
      startCol: 0,
      endLine: context.cursor.line,
      endCol: context.cursor.col
    });
    this.errors.set(root, context.errors);
    return root;
  }

  private parseNode(context: ParseContext): SNode | undefined {
    if (this.isEof(context)) {
      return undefined;
    }

    const char = context.text[context.cursor.index];
    if (char === '(') {
      return this.parseList(context);
    }
    if (char === '"') {
      return this.parseString(context);
    }
    if (char === ')') {
      const start = this.captureStart(context);
      this.advance(context, ')');
      context.errors.push({
        message: 'Unexpected closing parenthesis.',
        line: start.line,
        col: start.col,
        endLine: context.cursor.line,
        endCol: context.cursor.col
      });
      return {
        type: 'atom',
        value: ')',
        position: {
          line: start.line,
          col: start.col,
          end: start.index + 1
        }
      };
    }
    return this.parseAtomOrNumber(context);
  }

  private parseList(context: ParseContext): SNode {
    const start = this.captureStart(context);
    this.advance(context, '(');
    const children: SNode[] = [];

    while (this.skipTrivia(context)) {
      if (this.currentChar(context) === ')') {
        break;
      }
      const child = this.parseNode(context);
      if (!child) {
        break;
      }
      children.push(child);
    }

    if (this.currentChar(context) === ')') {
      this.advance(context, ')');
    } else if (!context.allowPartialEof) {
      context.errors.push({
        message: 'Unterminated list; expected closing parenthesis.',
        line: start.line,
        col: start.col,
        endLine: context.cursor.line,
        endCol: context.cursor.col
      });
    }

    const node: SNode = {
      type: 'list',
      children,
      position: {
        line: start.line,
        col: start.col,
        end: context.cursor.index
      }
    };
    this.ranges.set(node, {
      startLine: start.line,
      startCol: start.col,
      endLine: context.cursor.line,
      endCol: context.cursor.col
    });
    return node;
  }

  private parseString(context: ParseContext): SNode {
    const start = this.captureStart(context);
    this.advance(context, '"');
    let value = '';

    while (!this.isEof(context)) {
      const char = this.currentChar(context);
      if (char === '"') {
        this.advance(context, '"');
        break;
      }
      if (char === '\\') {
        this.advance(context, '\\');
        if (!this.isEof(context)) {
          value += this.currentChar(context);
          this.advance(context, this.currentChar(context));
        }
        continue;
      }
      value += char;
      this.advance(context, char);
    }

    if (
      this.isEof(context) &&
      context.text[context.cursor.index - 1] !== '"' &&
      !context.allowPartialEof
    ) {
      context.errors.push({
        message: 'Unterminated string literal.',
        line: start.line,
        col: start.col,
        endLine: context.cursor.line,
        endCol: context.cursor.col
      });
    }

    const node: SNode = {
      type: 'string',
      value,
      position: {
        line: start.line,
        col: start.col,
        end: context.cursor.index
      }
    };
    this.ranges.set(node, {
      startLine: start.line,
      startCol: start.col,
      endLine: context.cursor.line,
      endCol: context.cursor.col
    });
    return node;
  }

  private parseAtomOrNumber(context: ParseContext): SNode {
    const start = this.captureStart(context);
    let raw = '';

    while (!this.isEof(context)) {
      const char = this.currentChar(context);
      if (/\s/.test(char) || char === '(' || char === ')' || char === '#') {
        break;
      }
      raw += char;
      this.advance(context, char);
    }

    const numeric = Number(raw);
    const isNumber =
      raw.length > 0 && !Number.isNaN(numeric) && /^-?\d+(\.\d+)?$/.test(raw);
    const node: SNode = {
      type: isNumber ? 'number' : 'atom',
      value: isNumber ? numeric : raw,
      position: {
        line: start.line,
        col: start.col,
        end: context.cursor.index
      }
    };
    this.ranges.set(node, {
      startLine: start.line,
      startCol: start.col,
      endLine: context.cursor.line,
      endCol: context.cursor.col
    });
    return node;
  }

  private skipTrivia(context: ParseContext): boolean {
    while (!this.isEof(context)) {
      const char = this.currentChar(context);
      if (char === '#' || char === ';') {
        while (!this.isEof(context) && this.currentChar(context) !== '\n') {
          this.advance(context, this.currentChar(context));
        }
        continue;
      }
      if (/\s/.test(char)) {
        this.advance(context, char);
        continue;
      }
      return true;
    }
    return false;
  }

  private getListTag(node: SNode): string | undefined {
    if (node.type !== 'list' || !node.children?.length) {
      return undefined;
    }
    const first = node.children[0];
    if (!first) {
      return undefined;
    }
    if (first.type === 'atom' || first.type === 'string') {
      return String(first.value ?? '');
    }
    return undefined;
  }

  private captureStart(context: ParseContext): CursorState {
    return {
      index: context.cursor.index,
      line: context.cursor.line,
      col: context.cursor.col
    };
  }

  private currentChar(context: ParseContext): string {
    return context.text[context.cursor.index] ?? '';
  }

  private isEof(context: ParseContext): boolean {
    return context.cursor.index >= context.text.length;
  }

  private advance(context: ParseContext, char: string): void {
    context.cursor.index += 1;
    if (char === '\n') {
      context.cursor.line += 1;
      context.cursor.col = 0;
    } else {
      context.cursor.col += 1;
    }
  }
}
