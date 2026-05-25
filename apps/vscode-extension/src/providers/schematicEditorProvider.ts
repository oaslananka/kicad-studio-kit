import { BaseKiCanvasEditorProvider } from './baseKiCanvasEditorProvider';
import type { ViewerMetadata, ViewerSheetInfo } from '../types';
import * as vscode from 'vscode';

/**
 * Remove the (lib_symbols ...) block from a KiCad schematic text so that
 * subsequent regex searches don't accidentally match arcs that belong to
 * component symbol definitions rather than the schematic body.
 */
function stripLibSymbols(text: string): string {
  const marker = '(lib_symbols';
  const start = text.indexOf(marker);
  if (start < 0) {
    return text;
  }
  // Walk forward counting paren depth to find the matching close paren.
  let depth = 0;
  let i = start;
  for (; i < text.length; i++) {
    if (text[i] === '(') {
      depth++;
    } else if (text[i] === ')') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return text.slice(0, start) + text.slice(i);
}

function extractTopLevelBlocks(text: string, token: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(`^\\s*\\(\\s*${token}\\b`, 'gm');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const block = readBalancedExpression(text, match.index);
    if (block) {
      blocks.push(block);
      pattern.lastIndex = match.index + block.length;
    }
  }
  return blocks;
}

function readBalancedExpression(
  text: string,
  start: number
): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '(') {
      depth++;
      continue;
    }
    if (char !== ')') {
      continue;
    }
    depth--;
    if (depth === 0) {
      return text.slice(start, index + 1);
    }
  }

  return undefined;
}

function extractSchematicSheets(text: string): ViewerSheetInfo[] {
  const sheets = new Map<string, ViewerSheetInfo>();
  for (const block of extractTopLevelBlocks(text, 'sheet')) {
    const name = readSheetProperty(block, 'Sheetname');
    const file = readSheetProperty(block, 'Sheetfile');
    const uuid = block.match(/\(\s*uuid\s+"?([A-Fa-f0-9-]+)"?\s*\)/)?.[1];
    const id = file ?? uuid ?? name;
    const label = name ?? file ?? uuid;
    if (!id || !label || sheets.has(id)) {
      continue;
    }
    sheets.set(id, {
      id,
      name: label,
      ...(file ? { file } : {})
    });
  }
  return [...sheets.values()];
}

function readSheetProperty(
  block: string,
  propertyName: string
): string | undefined {
  const match = block.match(
    new RegExp(
      `\\(\\s*property\\s+"${propertyName}"\\s+"((?:\\\\.|[^"\\\\])*)"`,
      'm'
    )
  );
  const rawValue = match?.[1];
  return rawValue ? unescapeKiCadString(rawValue) : undefined;
}

function unescapeKiCadString(value: string): string {
  return value.replace(/\\(["\\nrt])/g, (_match, token: string) => {
    switch (token) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      default:
        return token;
    }
  });
}

export class SchematicEditorProvider extends BaseKiCanvasEditorProvider {
  protected override readonly fileExtension = '.kicad_sch';
  protected override readonly fileType = 'schematic' as const;
  protected override readonly viewerTitle = 'KiCad Studio Schematic Viewer';

  protected override buildViewerMetadata(
    _uri: vscode.Uri,
    text: string
  ): ViewerMetadata | undefined {
    // KiCad 10 hop-over arcs are stored as top-level (arc ...) elements in the
    // schematic body — NOT as (junction ...) elements. Junctions are intentional
    // wire connection dots and must NOT be treated as hop-overs.
    //
    // We strip the lib_symbols block first to exclude arcs that are part of
    // component symbol definitions (which live inside lib_symbols).
    const schBody = stripLibSymbols(text);

    // Top-level arc elements in a KiCad schematic are indented with exactly
    // 2 spaces. Symbol-internal arcs have 4+ spaces.
    const hopOvers = Array.from(
      schBody.matchAll(/^ {2}\(\s*arc\s+\(\s*start\s+([0-9.-]+)\s+([0-9.-]+)/gm)
    )
      .map((match) => ({
        x: Number(match[1]),
        y: Number(match[2])
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const sheets = extractSchematicSheets(schBody);

    if (!hopOvers.length && !sheets.length) {
      return undefined;
    }

    const count = hopOvers.length;
    return {
      ...(hopOvers.length
        ? {
            hopOvers,
            notes: [
              `${count} KiCad 10 hop-over arc${count === 1 ? '' : 's'} detected. ` +
                `Overlay hint${count === 1 ? '' : 's'} shown until KiCanvas renders them natively.`
            ]
          }
        : {}),
      ...(sheets.length ? { sheets } : {})
    };
  }
}
