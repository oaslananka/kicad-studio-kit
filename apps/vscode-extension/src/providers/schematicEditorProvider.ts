import { BaseKiCanvasEditorProvider } from './baseKiCanvasEditorProvider';
import type { ViewerMetadata } from '../types';
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

    if (!hopOvers.length) {
      return undefined;
    }

    const count = hopOvers.length;
    return {
      hopOvers,
      notes: [
        `${count} KiCad 10 hop-over arc${count === 1 ? '' : 's'} detected. ` +
          `Overlay hint${count === 1 ? '' : 's'} shown until KiCanvas renders them natively.`
      ]
    };
  }
}
