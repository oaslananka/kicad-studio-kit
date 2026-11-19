/**
 * Inspects the KiCad output of a non-KiCad PCB import.
 *
 * KiCad 10 can return process success while emitting graphic primitives on
 * the pseudo-layer UNDEFINED. Such a board cannot be parsed by subsequent
 * KiCad CLI commands. Do not infer copper/pad/zone mappings from their name.
 *
 * Only explicit drawing-only shapes and dimension annotations may be relocated to the non-production
 * Dwgs.User layer, and only with an explicit user decision and backup.
 */
export interface UndefinedImportLayerAssessment {
  count: number;
  safeDrawingCount: number;
  /** Available only when all unresolved layers belong to known drawing-only shapes. */
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

  let safeDrawingCount = 0;
  let inString = false;
  const stack: string[] = [];

  // A lightweight lexical walk tracks immediate S-expression parents without
  // interpreting coordinates/nets. Quoted text may contain parentheses.
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
      stack.pop();
      continue;
    }
    if (char !== '(') {
      continue;
    }
    let cursor = index + 1;
    while (/\s/.test(text[cursor] ?? '')) {
      cursor++;
    }
    const nameStart = cursor;
    while (/[a-zA-Z0-9_.-]/.test(text[cursor] ?? '')) {
      cursor++;
    }
    const name = text.slice(nameStart, cursor);
    if (name === 'layer' && text.startsWith(UNDEFINED_LAYER, index)) {
      const parent = stack[stack.length - 1];
      const grandparent = stack[stack.length - 2];
      const ancestor = stack[stack.length - 3];
      const footprintDrawing =
        SAFE_FOOTPRINT_DRAWINGS.has(parent ?? '') &&
        grandparent === 'footprint';
      const boardAnnotation =
        (parent === 'gr_text' && grandparent === 'kicad_pcb') ||
        (parent === 'dimension' && grandparent === 'kicad_pcb') ||
        (parent === 'gr_text' &&
          grandparent === 'dimension' &&
          ancestor === 'kicad_pcb');
      if (footprintDrawing || boardAnnotation) {
        safeDrawingCount++;
      }
    }
    stack.push(name);
  }

  const canRepair =
    safeDrawingCount === unknownReferences.length &&
    !inString &&
    stack.length === 0;

  return {
    count: unknownReferences.length,
    safeDrawingCount,
    ...(canRepair
      ? {
          repairedText: text.replaceAll(UNDEFINED_LAYER, '(layer "Dwgs.User")')
        }
      : {})
  };
}
