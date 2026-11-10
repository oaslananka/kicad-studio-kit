import * as vscode from 'vscode';

interface SourcePoint {
  x: number;
  y: number;
  line: number;
  column: number;
  order: number;
}

// Match only a real KiCad (at <x> <y> ...) list opening. The scanner
// handles strings/escapes/comments before trying this anchored expression.
const AT_POSITION =
  /\(at[ \t\r\n]+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)[ \t\r\n]+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?=[\s)])/y;

const UUID_TOKEN =
  /\((?:uuid|tstamp)[ \t\r\n]+"?([0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})"?[ \t\r\n]*\)/y;

/**
 * Index genuine KiCad PCB positions and UUID object anchors without building
 * an enormous AST. A 70 MB PCB can exceed a 2 GB V8 heap when expanded.
 * Memory is proportional to real position and UUID expressions, not AST size.
 */

export class DrcSourceCoordinates {
  private readonly byX: SourcePoint[];
  private readonly byUuid = new Map<
    string,
    { line: number; column: number } | null
  >();

  constructor(source: string) {
    const points: SourcePoint[] = [];
    let line = 0;
    let column = 0;
    let inString = false;
    let escaped = false;
    let inComment = false;
    let previousWasCR = false;
    for (let i = 0; i < source.length; i += 1) {
      const ch = source.charCodeAt(i);
      if (ch === 13 || ch === 10) {
        if (ch === 13 || !previousWasCR) line += 1;
        previousWasCR = ch === 13;
        column = 0;
        inComment = false;
        continue;
      }
      previousWasCR = false;
      if (inComment) {
        column += 1;
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === 92) escaped = true;
        else if (ch === 34) inString = false;
        column += 1;
        continue;
      }
      if (ch === 59) {
        inComment = true;
      } else if (ch === 34) {
        inString = true;
      } else if (
        ch === 40 &&
        source.charCodeAt(i + 1) === 97 &&
        source.charCodeAt(i + 2) === 116
      ) {
        AT_POSITION.lastIndex = i;
        const match = AT_POSITION.exec(source);
        if (match) {
          const x = Number(match[1]);
          const y = Number(match[2]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            points.push({ x, y, line, column, order: points.length });
          }
        }
      }
      if (
        ch === 40 &&
        (source.startsWith('(uuid', i) || source.startsWith('(tstamp', i))
      ) {
        UUID_TOKEN.lastIndex = i;
        const match = UUID_TOKEN.exec(source);
        if (match) {
          const uuid = match[1]!.toLowerCase();
          // A repeated UUID cannot identify one authoritative source object.
          if (this.byUuid.has(uuid)) this.byUuid.set(uuid, null);
          else this.byUuid.set(uuid, { line, column });
        }
      }
      column += 1;
    }
    this.byX = points.sort((a, b) => a.x - b.x || a.order - b.order);
  }

  /** Return only source-confirmed UUID anchors, never guessed geometry. */
  exactUuid(items: unknown): vscode.Range | undefined {
    if (!Array.isArray(items)) return undefined;
    for (const item of items) {
      if (item === null || typeof item !== 'object') continue;
      const uuid = (item as Record<string, unknown>)['uuid'];
      if (typeof uuid !== 'string') continue;
      const anchor = this.byUuid.get(uuid.toLowerCase());
      if (anchor) {
        return new vscode.Range(
          anchor.line,
          anchor.column,
          anchor.line,
          anchor.column + 5
        );
      }
    }
    return undefined;
  }

  get length(): number {
    return this.byX.length;
  }

  /**
   * Exact nearest Manhattan coordinate. X-sorting prunes candidates whose
   * X-distance already exceeds the best full distance. Original source order
   * breaks ties, matching the small-board S-expression reduction.
   */
  closest(position: { x: number; y: number } | undefined): vscode.Range {
    if (!position || this.byX.length === 0) {
      return new vscode.Range(0, 0, 0, 1);
    }

    let low = 0;
    let high = this.byX.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.byX[mid]!.x < position.x) low = mid + 1;
      else high = mid;
    }
    let left = low - 1;
    let right = low;
    let closest: SourcePoint | undefined;
    let bestDistance = Infinity;
    while (left >= 0 || right < this.byX.length) {
      const fromLeft =
        left >= 0 ? Math.abs(this.byX[left]!.x - position.x) : Infinity;
      const fromRight =
        right < this.byX.length
          ? Math.abs(this.byX[right]!.x - position.x)
          : Infinity;
      if (Math.min(fromLeft, fromRight) > bestDistance) break;
      const next =
        fromLeft <= fromRight ? this.byX[left--]! : this.byX[right++]!;
      const distance =
        Math.abs(next.x - position.x) + Math.abs(next.y - position.y);
      if (
        distance < bestDistance ||
        (distance === bestDistance &&
          (closest === undefined || next.order < closest.order))
      ) {
        bestDistance = distance;
        closest = next;
      }
    }

    return closest
      ? new vscode.Range(
          closest.line,
          closest.column,
          closest.line,
          closest.column + 3
        )
      : new vscode.Range(0, 0, 0, 1);
  }
}
