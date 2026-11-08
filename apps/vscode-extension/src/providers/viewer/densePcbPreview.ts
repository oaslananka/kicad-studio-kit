/**
 * Bounded, read-only source selection for experimental dense PCB previews.
 *
 * This is NOT a complete PCB or a manufacturing/DRC source. The selection
 * always advertises omitted objects and must never replace a user's file.
 * No file-system, VS Code, or KiCanvas dependencies belong in this module.
 */
export interface PcbPreviewBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PcbPreviewSelection {
  viewport: PcbPreviewBounds;
  layers?: readonly string[];
  maxBytes?: number;
  limits?: Partial<Record<PcbDrawableKind, number>>;
}

export type PcbDrawableKind =
  'footprint' | 'segment' | 'via' | 'arc' | 'gr_line' | 'gr_arc';

export interface BoundedPcbPreview {
  readonly text: string;
  readonly included: Readonly<Record<string, number>>;
  readonly omitted: Readonly<Record<string, number>>;
  readonly sourceObjects: Readonly<Record<string, number>>;
  readonly eligibleInViewport: Readonly<Record<string, number>>;
  readonly omittedInViewport: Readonly<Record<string, number>>;
  readonly viewportTruncated: boolean;
  readonly complete: false;
  readonly warning: string;
  readonly viewport: PcbPreviewBounds;
  readonly layers: readonly string[];
}

const SOURCE_HEADERS = new Set([
  'version',
  'generator',
  'generator_version',
  'general',
  'paper',
  'title_block',
  'layers',
  'setup',
  'net',
  'embedded_fonts'
]);

const DEFAULT_LIMITS: Readonly<Record<PcbDrawableKind, number>> = {
  footprint: 48,
  segment: 400,
  via: 100,
  arc: 30,
  gr_line: 60,
  gr_arc: 30
};

const DRAWABLE_KINDS = new Set<string>(Object.keys(DEFAULT_LIMITS));
const KEY = /^\(\s*([a-z_][a-z0-9_]*)/;
const COORDINATE =
  /\((?:at|start|end|mid|center)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
const LAYER = /\((?:layer|layers)\s+((?:"[^"]+"\s*)+)/;

/**
 * Selects authentic top-level KiCad source expressions intersecting a spatial
 * window. Inclusion uses origin/track endpoint envelopes; footprint pads,
 * zone fills and objects crossing the viewport without an in-bounds anchor
 * are not guaranteed. The result is explicitly incomplete by contract.
 */
export function selectBoundedPcbPreview(
  source: string,
  options: PcbPreviewSelection
): BoundedPcbPreview {
  if (!/^\s*\(kicad_pcb\b/.test(source)) {
    throw new Error('Expected a KiCad PCB source file.');
  }

  const bounds = options.viewport;
  if (
    ![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(
      Number.isFinite
    ) ||
    bounds.minX >= bounds.maxX ||
    bounds.minY >= bounds.maxY
  ) {
    throw new Error('A finite, non-empty preview viewport is required.');
  }

  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 4096 ||
    maxBytes > 8 * 1024 * 1024
  ) {
    throw new Error('The preview byte budget must be between 4 KiB and 8 MiB.');
  }
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000) {
      throw new Error(
        'The preview object caps must be bounded nonnegative integers.'
      );
    }
  }

  const requestedLayers = options.layers ?? [];
  const layerSet = new Set(requestedLayers);
  if (
    layerSet.size > 64 ||
    [...layerSet].some((layer) => !/^(?:F|B|In\d+)\.Cu$/.test(layer))
  ) {
    throw new Error('Only bounded KiCad copper-layer filters are allowed.');
  }

  const parts: string[] = [];
  const included: Record<string, number> = {};
  const omitted: Record<string, number> = {};
  const sourceObjects: Record<string, number> = {};
  const eligibleInViewport: Record<string, number> = {};
  let usedBytes = Buffer.byteLength('(kicad_pcb\n\n)\n');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let comment = false;
  let start = 0;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (comment) {
      if (ch === '\n') comment = false;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === ';') {
      comment = true;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === '(') {
      if (depth === 1) start = i;
      depth += 1;
      continue;
    }
    if (ch !== ')') continue;
    depth -= 1;
    if (depth < 0) throw new Error('KiCad source has unbalanced parentheses.');
    if (depth !== 1) continue;

    const header = source.slice(start, Math.min(i + 1, start + 90));
    const key = KEY.exec(header)?.[1];
    if (!key) continue;
    sourceObjects[key] = (sourceObjects[key] ?? 0) + 1;

    const headerField = SOURCE_HEADERS.has(key);
    const drawable = DRAWABLE_KINDS.has(key);
    if (!headerField && !drawable) {
      omitted[key] = (omitted[key] ?? 0) + 1;
      continue;
    }

    if (drawable) {
      if (
        !intersectsWindow(source.slice(start, i + 1), bounds, layerSet, key)
      ) {
        omitted[key] = (omitted[key] ?? 0) + 1;
        continue;
      }

      eligibleInViewport[key] = (eligibleInViewport[key] ?? 0) + 1;
      if ((included[key] ?? 0) >= limits[key as PcbDrawableKind]) {
        omitted[key] = (omitted[key] ?? 0) + 1;
        continue;
      }
    }

    const part = source.slice(start, i + 1);
    const bytes = Buffer.byteLength(part, 'utf8') + 1;
    if (usedBytes + bytes > maxBytes) {
      if (headerField) {
        throw new Error(
          'The KiCad board header exceeds the preview byte budget.'
        );
      }
      omitted[key] = (omitted[key] ?? 0) + 1;
      continue;
    }
    parts.push(part);
    included[key] = (included[key] ?? 0) + 1;
    usedBytes += bytes;
  }

  if (depth !== 0 || quoted) {
    throw new Error('KiCad source ends with an incomplete expression.');
  }
  if (included['layers'] !== 1) {
    throw new Error('Cannot preview a PCB without a complete layer table.');
  }

  const omittedInViewport: Record<string, number> = {};
  for (const [key, eligible] of Object.entries(eligibleInViewport)) {
    omittedInViewport[key] = eligible - (included[key] ?? 0);
  }

  return {
    text: '(kicad_pcb\n' + parts.join('\n') + '\n)\n',
    included,
    omitted,
    sourceObjects,
    eligibleInViewport,
    omittedInViewport,
    viewportTruncated: Object.values(omittedInViewport).some(
      (count) => count > 0
    ),
    complete: false,
    warning:
      'PARTIAL PREVIEW — many source objects and all zones are omitted. ' +
      'Not a complete board; do not use for DRC, exports or manufacturing.',
    viewport: { ...bounds },
    layers: [...layerSet]
  };
}

function intersectsWindow(
  expression: string,
  bounds: PcbPreviewBounds,
  requestedLayers: ReadonlySet<string>,
  kind: string
): boolean {
  if (requestedLayers.size > 0) {
    const match = LAYER.exec(expression.slice(0, 1200));
    if (!match) return false;
    const sourceLayers = [...(match[1] ?? '').matchAll(/"([^"]+)"/g)]
      .map((entry) => entry[1])
      .filter((layer): layer is string => layer !== undefined);
    const throughVia =
      kind === 'via' &&
      sourceLayers.includes('F.Cu') &&
      sourceLayers.includes('B.Cu');
    if (
      !throughVia &&
      !sourceLayers.some((layer) => requestedLayers.has(layer))
    ) {
      return false;
    }
  }

  const points: Array<{ x: number; y: number }> = [];
  COORDINATE.lastIndex = 0;
  const source = kind === 'footprint' ? expression.slice(0, 1200) : expression;
  for (const match of source.matchAll(COORDINATE)) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
      if (kind === 'footprint' || kind === 'via') break;
    }
  }
  if (points.length === 0) return false;

  const margin = kind === 'footprint' ? 3 : 0.5;
  return (
    Math.min(...points.map((point) => point.x)) <= bounds.maxX + margin &&
    Math.max(...points.map((point) => point.x)) >= bounds.minX - margin &&
    Math.min(...points.map((point) => point.y)) <= bounds.maxY + margin &&
    Math.max(...points.map((point) => point.y)) >= bounds.minY - margin
  );
}
