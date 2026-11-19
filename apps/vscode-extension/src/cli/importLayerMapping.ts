/**
 * Inspects the KiCad output of a non-KiCad PCB import.
 *
 * KiCad 10 can return process success while emitting graphic primitives on
 * the pseudo-layer UNDEFINED. Such a board cannot be parsed by subsequent
 * KiCad CLI commands. Do not infer copper/pad/zone mappings from their name.
 *
 * Only known drawing-only shapes and dimension annotations can be moved to
 * Dwgs.User with explicit user approval and an unmodified backup.
 */
export interface UndefinedImportLayerAssessment {
  count: number;
  safeDrawingCount: number;
  /** Available only when every unresolved reference is a drawing-only shape. */
  repairedText?: string;
}

const UNDEFINED_LAYER = '(layer "UNDEFINED")';
const UNDEFINED_LAYER_PATTERN = /\(\s*layers?\s+"UNDEFINED"\s*\)/g;
const SAFE_FOOTPRINT_DRAWINGS = new Set([
  'fp_line',
  'fp_arc',
  'fp_circle',
  'fp_rect',
  'fp_poly',
  'fp_curve'
]);

export function assessUndefinedImportLayers(
  text: string
): UndefinedImportLayerAssessment {
  const unknownReferences = [...text.matchAll(UNDEFINED_LAYER_PATTERN)];
  if (unknownReferences.length === 0) {
    return { count: 0, safeDrawingCount: 0 };
  }

  const scan = scanDrawingLayerContexts(text);
  const result = {
    count: unknownReferences.length,
    safeDrawingCount: scan.safeCount
  };
  if (!scan.complete || scan.safeCount !== unknownReferences.length) {
    return result;
  }

  return {
    ...result,
    repairedText: text.replaceAll(UNDEFINED_LAYER, '(layer "Dwgs.User")')
  };
}

function isDrawingOnlyContext(stack: readonly string[]): boolean {
  const parent = stack.at(-1);
  const container = stack.at(-2);
  const ancestor = stack.at(-3);

  if (container === 'footprint' && SAFE_FOOTPRINT_DRAWINGS.has(parent ?? '')) {
    return true;
  }
  if (container === 'kicad_pcb') {
    return parent === 'gr_text' || parent === 'dimension';
  }
  return (
    parent === 'gr_text' &&
    container === 'dimension' &&
    ancestor === 'kicad_pcb'
  );
}

function readListTag(text: string, openParenIndex: number): string {
  let cursor = openParenIndex + 1;
  while (/\s/.test(text[cursor] ?? '')) {
    cursor++;
  }
  const start = cursor;
  while (/[a-zA-Z0-9_.-]/.test(text[cursor] ?? '')) {
    cursor++;
  }
  return text.slice(start, cursor);
}

function scanDrawingLayerContexts(text: string): {
  safeCount: number;
  complete: boolean;
} {
  const stack: string[] = [];
  let inString = false;
  let invalidNesting = false;
  let safeCount = 0;

  // Track enclosing S-expressions. Never inspect layer-looking text inside
  // quoted property values or reinterpret copper/milling attributes.
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (char === '\\') {
        index++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === ')') {
      if (stack.length === 0) {
        invalidNesting = true;
      } else {
        stack.pop();
      }
      continue;
    }
    if (char !== '(') {
      continue;
    }
    if (
      text.startsWith(UNDEFINED_LAYER, index) &&
      isDrawingOnlyContext(stack)
    ) {
      safeCount++;
    }
    stack.push(readListTag(text, index));
  }

  return {
    safeCount,
    complete: !inString && !invalidNesting && stack.length === 0
  };
}
