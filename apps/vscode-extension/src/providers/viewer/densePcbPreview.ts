import { createHash } from 'node:crypto';

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
  /** Zero-based in-window source occurrence to start each drawable kind. */
  cursor?: Partial<Record<PcbDrawableKind, number>>;
  /** Mandatory provenance for nonzero cursor continuations. */
  continuationToken?: string;
}

export type PcbDrawableKind =
  'footprint' | 'segment' | 'via' | 'arc' | 'gr_line' | 'gr_arc';

export interface BoundedPcbPreview {
  readonly text: string;
  readonly included: Readonly<Record<string, number>>;
  readonly omitted: Readonly<Record<string, number>>;
  readonly sourceObjects: Readonly<Record<string, number>>;
  /** Actual direct-child pad definitions across all source footprints. */
  readonly sourceFootprintPads: number;
  /** Intact pad definitions copied within the selected parent footprints. */
  readonly includedFootprintPads: number;
  /** Omitted top-level zone definitions grouped by their declared copper layer. */
  readonly omittedZonesByLayer: Readonly<Record<string, number>>;
  /** Classifiable source outlines overlapping this viewport per declared layer, not fills. */
  readonly omittedZoneOutlinesInViewportByLayer: Readonly<
    Record<string, number>
  >;
  /** Zone outlines whose overlap cannot be determined per declared layer. */
  readonly unclassifiedZoneOutlinesByLayer: Readonly<Record<string, number>>;
  /** Source-only zone outlines intersecting the chosen region; no copper fill. */
  readonly omittedZoneOutlinesInViewport: number;
  /** Zone outlines with unsupported/ambiguous source geometry or layer data. */
  readonly unclassifiedZoneOutlines: number;
  readonly eligibleInViewport: Readonly<Record<string, number>>;
  readonly omittedInViewport: Readonly<Record<string, number>>;
  readonly viewportTruncated: boolean;
  /** Next stable occurrence index in this exact source, viewport and layer selection. */
  readonly nextCursor: Readonly<Record<PcbDrawableKind, number>>;
  /** Binds nextCursor to the exact source, viewport and copper layers. */
  readonly continuationToken: string;
  /** In-window objects left after this and prior pages, excluding unsupported zones. */
  readonly remainingAfterPage: Readonly<Record<string, number>>;
  readonly hasNextPage: boolean;
  readonly madeProgress: boolean;
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
const COORDINATE =
  /\((?:at|start|end|mid|center)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
const LAYER = /\((?:layer|layers)\s+((?:"[^"]+"\s*)+)/;

/**
 * Selects authentic top-level KiCad source expressions intersecting a spatial
 * window. Straight track segments and three-point copper arcs are intersected
 * against the viewport; footprint pads, board graphics, zone fills and other
 * objects crossing without an in-bounds anchor are not guaranteed. The result is
 * explicitly incomplete by contract.
 */
export function selectBoundedPcbPreview(
  source: string,
  options: PcbPreviewSelection
): BoundedPcbPreview {
  const { bounds, maxBytes, limits, cursor, layerSet, continuationToken } =
    validatePreviewRequest(source, options);

  const parts: string[] = [];
  const included: Record<string, number> = {};
  const omitted: Record<string, number> = {};
  const sourceObjects: Record<string, number> = {};
  const omittedZonesByLayer: Record<string, number> = {};
  const omittedZoneOutlinesInViewportByLayer: Record<string, number> = {};
  const unclassifiedZoneOutlinesByLayer: Record<string, number> = {};
  let omittedZoneOutlinesInViewport = 0;
  let unclassifiedZoneOutlines = 0;
  let sourceFootprintPads = 0;
  let includedFootprintPads = 0;
  const eligibleInViewport: Record<string, number> = {};
  const declaredCopperLayers = new Set<string>();
  let usedBytes = Buffer.byteLength('(kicad_pcb\n\n)\n');
  let drawableBudgetExhausted = false;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let comment = false;
  let start = 0;
  let topLevelKind: string | undefined;
  let footprintPadCount = 0;
  let footprintPadOnRequestedLayer = false;
  let inDirectFootprintPad = false;
  let padLayersStart = -1;
  let zonePolygonStart = -1;
  let zonePolygonCount = 0;
  let zonePolygon: string | undefined;

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
      if (depth === 1) {
        start = i;
        topLevelKind = readSourceKey(source.slice(i, i + 90));
        footprintPadCount = 0;
        footprintPadOnRequestedLayer = false;
        inDirectFootprintPad = false;
        padLayersStart = -1;
        zonePolygonStart = -1;
        zonePolygonCount = 0;
        zonePolygon = undefined;
      } else if (
        depth === 2 &&
        topLevelKind === 'zone' &&
        readSourceKey(source.slice(i, i + 20)) === 'polygon'
      ) {
        zonePolygonStart = i;
        zonePolygonCount += 1;
      } else if (
        depth === 2 &&
        topLevelKind === 'footprint' &&
        readSourceKey(source.slice(i, i + 20)) === 'pad'
      ) {
        // Count direct pad children only, never strings, comments or nested
        // pad-shaped custom primitives. Pad geometry is not being inferred.
        footprintPadCount += 1;
        inDirectFootprintPad = true;
      } else if (
        depth === 3 &&
        inDirectFootprintPad &&
        layerSet.size > 0 &&
        readSourceKey(source.slice(i, i + 20)) === 'layers'
      ) {
        // Only direct (layers ...) children of source pads count. Neither
        // footprint side nor quoted/nested graphics prove pad copper layers.
        padLayersStart = i;
      }
      depth += 1;
      continue;
    }
    if (ch !== ')') continue;
    depth -= 1;
    if (depth < 0) throw new Error('KiCad source has unbalanced parentheses.');
    if (depth === 3 && padLayersStart >= 0) {
      if (i + 1 - padLayersStart <= 256) {
        const layers = stripSexprComments(source.slice(padLayersStart, i + 1));
        for (const match of layers.matchAll(/"([^"]+)"/g)) {
          const layer = match[1];
          if (
            layer !== undefined &&
            [...layerSet].some(
              (selected) =>
                layer === selected ||
                layer === '*.Cu' ||
                (layer === 'F&B.Cu' &&
                  (selected === 'F.Cu' || selected === 'B.Cu'))
            )
          ) {
            footprintPadOnRequestedLayer = true;
          }
        }
      }
      padLayersStart = -1;
    }
    if (depth === 2 && inDirectFootprintPad) {
      inDirectFootprintPad = false;
    }
    if (depth === 2 && topLevelKind === 'zone' && zonePolygonStart >= 0) {
      // Only the source outline, not potentially enormous filled polygons.
      if (i + 1 - zonePolygonStart <= 64 * 1024) {
        zonePolygon = source.slice(zonePolygonStart, i + 1);
      }
      zonePolygonStart = -1;
    }
    if (depth !== 1) continue;

    const header = source.slice(start, Math.min(i + 1, start + 90));
    const key = readSourceKey(header);
    if (!key) continue;
    sourceObjects[key] = (sourceObjects[key] ?? 0) + 1;
    if (key === 'footprint') sourceFootprintPads += footprintPadCount;
    if (key === 'zone') {
      const layerHeader = LAYER.exec(
        source.slice(start, Math.min(i + 1, start + 2048))
      );
      const declared = [...(layerHeader?.[1] ?? '').matchAll(/"([^"]+)"/g)]
        .map((match) => match[1])
        .filter((layer): layer is string => layer !== undefined);
      // One zone may declare multiple copper layers; counts per layer may
      // overlap. Unsupported declarations remain explicitly unclassified.
      for (const layer of declared.length > 0 ? declared : ['unknown']) {
        omittedZonesByLayer[layer] = (omittedZonesByLayer[layer] ?? 0) + 1;
      }
      if (
        declared.length === 0 ||
        layerSet.size === 0 ||
        declared.some((layer) => layerSet.has(layer))
      ) {
        const relation =
          declared.length === 0
            ? 'unknown'
            : classifyZoneOutlineViewport(
                zonePolygonCount === 1 ? zonePolygon : undefined,
                bounds
              );
        if (relation === 'overlap') omittedZoneOutlinesInViewport += 1;
        if (relation === 'unknown') unclassifiedZoneOutlines += 1;
        // Keep layer-specific outline evidence distinct from source-zone
        // declarations and (potentially missing) cached copper fills.
        for (const layer of declared) {
          if (layerSet.size > 0 && !layerSet.has(layer)) continue;
          if (relation === 'overlap') {
            omittedZoneOutlinesInViewportByLayer[layer] =
              (omittedZoneOutlinesInViewportByLayer[layer] ?? 0) + 1;
          } else if (relation === 'unknown') {
            unclassifiedZoneOutlinesByLayer[layer] =
              (unclassifiedZoneOutlinesByLayer[layer] ?? 0) + 1;
          }
        }
      }
    }

    if (key === 'layers') {
      // Validate against the actual KiCad layer table, not a syntactically
      // plausible but nonexistent In99.Cu. Empty previews must not look like
      // evidence that a selected layer contains no copper.
      for (const match of stripSexprComments(
        source.slice(start, i + 1)
      ).matchAll(/\(\s*\d+\s+"((?:F|B|In\d+)\.Cu)"(?=\s|\))/g)) {
        if (match[1]) declaredCopperLayers.add(match[1]);
      }
    }

    const headerField = SOURCE_HEADERS.has(key);
    const drawable = DRAWABLE_KINDS.has(key);
    if (!headerField && !drawable) {
      omitted[key] = (omitted[key] ?? 0) + 1;
      continue;
    }

    if (drawable) {
      if (
        !intersectsWindow(
          source.slice(start, i + 1),
          bounds,
          layerSet,
          key,
          key === 'footprint' && footprintPadOnRequestedLayer
        )
      ) {
        omitted[key] = (omitted[key] ?? 0) + 1;
        continue;
      }

      const index = eligibleInViewport[key] ?? 0;
      eligibleInViewport[key] = index + 1;
      if (
        index < cursor[key as PcbDrawableKind] ||
        drawableBudgetExhausted ||
        (included[key] ?? 0) >= limits[key as PcbDrawableKind]
      ) {
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
      // A global page budget must yield a source-order prefix per kind.
      // Accepting smaller later items would make cursor paging skip objects.
      drawableBudgetExhausted = true;
      continue;
    }
    parts.push(part);
    included[key] = (included[key] ?? 0) + 1;
    if (key === 'footprint') includedFootprintPads += footprintPadCount;
    usedBytes += bytes;
  }

  if (depth !== 0 || quoted) {
    throw new Error('KiCad source ends with an incomplete expression.');
  }
  if (included['layers'] !== 1) {
    throw new Error('Cannot preview a PCB without a complete layer table.');
  }
  for (const requested of layerSet) {
    if (!declaredCopperLayers.has(requested)) {
      throw new Error(
        'Requested copper layer is not declared by this KiCad PCB.'
      );
    }
  }

  const omittedInViewport: Record<string, number> = {};
  for (const [key, eligible] of Object.entries(eligibleInViewport)) {
    omittedInViewport[key] = eligible - (included[key] ?? 0);
  }

  const nextCursor = {} as Record<PcbDrawableKind, number>;
  const remainingAfterPage: Record<string, number> = {};
  let madeProgress = false;
  for (const key of Object.keys(DEFAULT_LIMITS) as PcbDrawableKind[]) {
    const selected = included[key] ?? 0;
    nextCursor[key] = cursor[key] + selected;
    madeProgress ||= selected > 0;
    remainingAfterPage[key] = Math.max(
      0,
      (eligibleInViewport[key] ?? 0) - nextCursor[key]
    );
  }

  return {
    text: '(kicad_pcb\n' + parts.join('\n') + '\n)\n',
    included,
    omitted,
    sourceObjects,
    sourceFootprintPads,
    includedFootprintPads,
    omittedZonesByLayer,
    omittedZoneOutlinesInViewportByLayer,
    unclassifiedZoneOutlinesByLayer,
    omittedZoneOutlinesInViewport,
    unclassifiedZoneOutlines,
    eligibleInViewport,
    omittedInViewport,
    viewportTruncated: Object.values(omittedInViewport).some(
      (count) => count > 0
    ),
    nextCursor,
    continuationToken,
    remainingAfterPage,
    hasNextPage: Object.values(remainingAfterPage).some((count) => count > 0),
    madeProgress,
    complete: false,
    warning:
      'PARTIAL PREVIEW — all zones are omitted (' +
      (sourceObjects['zone'] ?? 0) +
      ' source zones); ' +
      omittedZoneOutlinesInViewport +
      ' source outlines overlap this region' +
      (unclassifiedZoneOutlines > 0
        ? ', ' + unclassifiedZoneOutlines + ' unclassified'
        : '') +
      '; ' +
      includedFootprintPads +
      '/' +
      sourceFootprintPads +
      ' footprint pads are copied only with their parent footprints. ' +
      'Not a complete board; do not use for DRC, exports or manufacturing.',
    viewport: { ...bounds },
    layers: [...layerSet]
  };
}

/** Ignore KiCad ; comments without stripping semicolons inside quoted names. */
function stripSexprComments(input: string): string {
  let quoted = false;
  let escaped = false;
  let comment = false;
  let output = '';
  for (const ch of input) {
    if (comment) {
      if (ch === '\n') {
        comment = false;
        output += ch;
      }
      continue;
    }
    if (quoted) {
      output += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === ';') {
      comment = true;
      continue;
    }
    if (ch === '"') quoted = true;
    output += ch;
  }
  return output;
}

interface ValidatedPreviewRequest {
  bounds: PcbPreviewBounds;
  maxBytes: number;
  limits: Record<PcbDrawableKind, number>;
  cursor: Record<PcbDrawableKind, number>;
  layerSet: Set<string>;
  continuationToken: string;
}

function isSourceWhitespace(code: number): boolean {
  return code === 32 || (code >= 9 && code <= 13) || code === 0xfeff;
}

// Read a fixed ASCII KiCad root keyword without applying regex to untrusted
// multi-megabyte input. Whitespace at the beginning is scanned once.
function isKiCadPcbSource(source: string): boolean {
  let index = 0;
  while (
    index < source.length &&
    isSourceWhitespace(source.charCodeAt(index))
  ) {
    index += 1;
  }
  const root = '(kicad_pcb';
  if (!source.startsWith(root, index)) return false;
  const next = source.charCodeAt(index + root.length);
  return (
    Number.isNaN(next) ||
    isSourceWhitespace(next) ||
    next === 40 || // (
    next === 41 || // )
    next === 59 // ;
  );
}

function isKeyStart(code: number): boolean {
  return code === 95 || (code >= 97 && code <= 122);
}

function isKeyPart(code: number): boolean {
  return isKeyStart(code) || (code >= 48 && code <= 57);
}

// Caller bounds the source header to 90 UTF-16 code units.
function readSourceKey(header: string): string | undefined {
  if (header[0] !== '(') return undefined;
  let index = 1;
  while (
    index < header.length &&
    isSourceWhitespace(header.charCodeAt(index))
  ) {
    index += 1;
  }
  const begin = index;
  if (!isKeyStart(header.charCodeAt(index))) return undefined;
  index += 1;
  while (index < header.length && isKeyPart(header.charCodeAt(index))) {
    index += 1;
  }
  return header.slice(begin, index);
}

function validatePreviewRequest(
  source: string,
  options: PcbPreviewSelection
): ValidatedPreviewRequest {
  if (!isKiCadPcbSource(source)) {
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

  const cursor = Object.fromEntries(
    Object.keys(DEFAULT_LIMITS).map((key) => {
      const value = options.cursor?.[key as PcbDrawableKind] ?? 0;
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(
          'Preview cursor positions must be nonnegative integers.'
        );
      }
      return [key, value];
    })
  ) as Record<PcbDrawableKind, number>;

  const requestedLayers = options.layers ?? [];
  const layerSet = new Set(requestedLayers);
  if (
    layerSet.size > 64 ||
    [...layerSet].some((layer) => !/^(?:F|B|In\d+)\.Cu$/.test(layer))
  ) {
    throw new Error('Only bounded KiCad copper-layer filters are allowed.');
  }

  const continuationToken = createHash('sha256')
    .update(source, 'utf8')
    .update('\0')
    .update(
      JSON.stringify({
        bounds: [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY],
        layers: [...layerSet].sort((left, right) => left.localeCompare(right))
      })
    )
    .digest('hex');
  const resuming = Object.values(cursor).some((value) => value > 0);
  if (resuming && options.continuationToken !== continuationToken) {
    throw new Error(
      'Preview continuation is stale: source, viewport or layers changed.'
    );
  }

  return { bounds, maxBytes, limits, cursor, layerSet, continuationToken };
}

/**
 * Reconstruct a single coherent, bounded preview of every source object
 * reached by a sequence of cursor pages. This is a testable bridge to an
 * eventual single-canvas preview; it does NOT patch KiCanvas internals or
 * make the region authoritative.
 *
 * Rebuild from the original source to preserve KiCad's expression ordering,
 * rather than concatenating complete PCB documents or duplicating headers.
 */
export function rebuildAccumulatedPcbPreview(
  source: string,
  latestPage: BoundedPcbPreview,
  maxBytes = 8 * 1024 * 1024
): BoundedPcbPreview {
  const snapshot = selectBoundedPcbPreview(source, {
    viewport: latestPage.viewport,
    layers: latestPage.layers,
    maxBytes,
    limits: latestPage.nextCursor
  });
  if (snapshot.continuationToken !== latestPage.continuationToken) {
    throw new Error(
      'Cannot rebuild a preview from a changed PCB, viewport or layer selection.'
    );
  }
  for (const kind of Object.keys(DEFAULT_LIMITS) as PcbDrawableKind[]) {
    if (snapshot.nextCursor[kind] !== latestPage.nextCursor[kind]) {
      throw new Error(
        'The accumulated source geometry exceeds the bounded preview budget.'
      );
    }
  }
  return snapshot;
}

/** Clip a KiCad straight copper track to the bounded viewport (Liang–Barsky). */
function trackSegmentIntersectsViewport(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: PcbPreviewBounds,
  margin: number
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let enter = 0;
  let leave = 1;
  const edges: readonly (readonly [number, number])[] = [
    [-dx, start.x - (bounds.minX - margin)],
    [dx, bounds.maxX + margin - start.x],
    [-dy, start.y - (bounds.minY - margin)],
    [dy, bounds.maxY + margin - start.y]
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const ratio = q / p;
    if (p < 0) enter = Math.max(enter, ratio);
    else leave = Math.min(leave, ratio);
    if (enter > leave) return false;
  }
  return true;
}
/**
 * KiCad canonical copper-layer IDs are physical stack positions: F.Cu = 0,
 * In1.Cu through In30.Cu = 1..30 and B.Cu = 31. The bottom layer's ID is
 * not renumbered when the board uses fewer than 32 copper layers.
 */
/**
 * Zone boundary intersection ONLY. A KiCad outline is not filled copper:
 * clearances, holes, priorities and computed filled_polygon differ. Parse a
 * single, straight-edged polygon with a bounded input size; mark arcs, multiple
 * contours and malformed coordinates unknown instead of claiming absence.
 */
function classifyZoneOutlineViewport(
  polygon: string | undefined,
  bounds: PcbPreviewBounds
): 'overlap' | 'outside' | 'unknown' {
  if (!polygon || polygon.length > 64 * 1024) return 'unknown';
  const clean = stripSexprComments(polygon).replace(/"(?:\\.|[^"\\])*"/g, '""');
  if (
    !/^\(polygon\b/.test(clean) ||
    (clean.match(/\(pts\b/g) ?? []).length !== 1 ||
    /\(arc\b/.test(clean)
  ) {
    return 'unknown';
  }
  const coordinate =
    /\(xy\s+(-?(?:\d+(?:\.\d*)?|\.\d+))\s+(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\)/g;
  const parsed = [...clean.matchAll(coordinate)];
  if (
    parsed.length < 3 ||
    parsed.length !== (clean.match(/\(xy\b/g) ?? []).length
  ) {
    return 'unknown';
  }
  const points = parsed.map((match) => ({
    x: Number(match[1]),
    y: Number(match[2])
  }));
  if (
    points.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
    )
  ) {
    return 'unknown';
  }
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if (trackSegmentIntersectsViewport(a, b, bounds, 0)) return 'overlap';
  }
  // A window entirely enclosed by a large zone outline has no crossing edges.
  // The even/odd test is for a simple outline, NOT a copper-fill area test.
  const x = bounds.minX;
  const y = bounds.minY;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside ? 'overlap' : 'outside';
}

/** Arc point uses genuine KiCad (start), (mid), (end) coordinates. */
function arcIntersectsViewport(
  start: { x: number; y: number },
  mid: { x: number; y: number },
  end: { x: number; y: number },
  bounds: PcbPreviewBounds,
  margin: number
): boolean {
  const left = bounds.minX - margin;
  const right = bounds.maxX + margin;
  const top = bounds.minY - margin;
  const bottom = bounds.maxY + margin;
  const inside = (point: { x: number; y: number }): boolean =>
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  if (inside(start) || inside(mid) || inside(end)) return true;

  // Compute the circumcentre in translated coordinates to avoid squaring
  // large absolute board positions. Collinear input is a polyline fallback.
  const ax = mid.x - start.x;
  const ay = mid.y - start.y;
  const bx = end.x - start.x;
  const by = end.y - start.y;
  const divisor = 2 * (ax * by - ay * bx);
  const scale = Math.max(
    Math.abs(ax),
    Math.abs(ay),
    Math.abs(bx),
    Math.abs(by)
  );
  if (Math.abs(divisor) <= 1e-12 * scale * scale) {
    return (
      trackSegmentIntersectsViewport(start, mid, bounds, margin) ||
      trackSegmentIntersectsViewport(mid, end, bounds, margin)
    );
  }
  const aSquared = ax * ax + ay * ay;
  const bSquared = bx * bx + by * by;
  const centerX = start.x + (aSquared * by - bSquared * ay) / divisor;
  const centerY = start.y + (bSquared * ax - aSquared * bx) / divisor;
  const radius = Math.hypot(start.x - centerX, start.y - centerY);
  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(radius)
  ) {
    return false;
  }
  const fullTurn = 2 * Math.PI;
  const angle = (point: { x: number; y: number }): number =>
    Math.atan2(point.y - centerY, point.x - centerX);
  const positiveSweep = (from: number, to: number): number =>
    (to - from + fullTurn) % fullTurn;
  const startAngle = angle(start);
  const midAngle = angle(mid);
  const endAngle = angle(end);
  const clockwise =
    positiveSweep(startAngle, midAngle) >
    positiveSweep(startAngle, endAngle) + 1e-9;
  const maxSweep = clockwise
    ? positiveSweep(endAngle, startAngle)
    : positiveSweep(startAngle, endAngle);
  const onArc = (x: number, y: number): boolean => {
    const candidate = Math.atan2(y - centerY, x - centerX);
    return (
      (clockwise
        ? positiveSweep(candidate, startAngle)
        : positiveSweep(startAngle, candidate)) <=
      maxSweep + 1e-9
    );
  };
  // Intersections with the four sides of the viewport. A three-point
  // bounding box is not sufficient: cardinal arc extrema may lie beyond it,
  // while a diagonal's box may overlap a region the arc never touches.
  const circleIntersections = (delta: number): readonly number[] => {
    const squared = radius * radius - delta * delta;
    return squared >= -1e-9 * Math.max(1, radius * radius)
      ? [Math.sqrt(Math.max(0, squared)), -Math.sqrt(Math.max(0, squared))]
      : [];
  };
  for (const x of [left, right]) {
    for (const dy of circleIntersections(x - centerX)) {
      const y = centerY + dy;
      if (y >= top && y <= bottom && onArc(x, y)) return true;
    }
  }
  for (const y of [top, bottom]) {
    for (const dx of circleIntersections(y - centerY)) {
      const x = centerX + dx;
      if (x >= left && x <= right && onArc(x, y)) return true;
    }
  }
  return false;
}
function copperLayerPosition(name: string): number | undefined {
  if (name === 'F.Cu') return 0;
  if (name === 'B.Cu') return 31;
  const inner = /^In([1-9]|[12]\d|30)\.Cu$/.exec(name);
  return inner ? Number(inner[1]) : undefined;
}

/**
 * Blind and buried vias span all the copper layers between their two
 * declared endpoints. This only decides source-preview eligibility:
 * KiCad may remove unused annular rings on some intermediate layers.
 */
function viaSpansRequestedLayers(
  viaLayers: readonly string[],
  requestedLayers: ReadonlySet<string>
): boolean {
  if (viaLayers.length !== 2) return false;
  const top = copperLayerPosition(viaLayers[0]!);
  const bottom = copperLayerPosition(viaLayers[1]!);
  if (top === undefined || bottom === undefined) return false;
  const low = Math.min(top, bottom);
  const high = Math.max(top, bottom);
  for (const layer of requestedLayers) {
    const position = copperLayerPosition(layer);
    if (position !== undefined && position >= low && position <= high) {
      return true;
    }
  }
  return false;
}
function intersectsWindow(
  expression: string,
  bounds: PcbPreviewBounds,
  requestedLayers: ReadonlySet<string>,
  kind: string,
  footprintPadOnRequestedLayer = false
): boolean {
  if (requestedLayers.size > 0) {
    const match = LAYER.exec(expression.slice(0, 1200));
    if (!match && !footprintPadOnRequestedLayer) return false;
    const sourceLayers = [...(match?.[1] ?? '').matchAll(/"([^"]+)"/g)]
      .map((entry) => entry[1])
      .filter((layer): layer is string => layer !== undefined);
    const onSelectedLayer =
      kind === 'via'
        ? viaSpansRequestedLayers(sourceLayers, requestedLayers)
        : sourceLayers.some((layer) => requestedLayers.has(layer)) ||
          (kind === 'footprint' && footprintPadOnRequestedLayer);
    if (!onSelectedLayer) return false;
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
  // An endpoint-only envelope misses a straight track crossing the entire
  // viewport, while its bbox also admits diagonals that pass outside it.
  // KiCad segment geometry is exactly (start X Y) -> (end X Y).
  if (kind === 'segment' && points.length >= 2) {
    return trackSegmentIntersectsViewport(
      points[0]!,
      points[1]!,
      bounds,
      margin
    );
  }
  if (kind === 'arc' && points.length >= 3) {
    return arcIntersectsViewport(
      points[0]!,
      points[1]!,
      points[2]!,
      bounds,
      margin
    );
  }
  return (
    Math.min(...points.map((point) => point.x)) <= bounds.maxX + margin &&
    Math.max(...points.map((point) => point.x)) >= bounds.minX - margin &&
    Math.min(...points.map((point) => point.y)) <= bounds.maxY + margin &&
    Math.max(...points.map((point) => point.y)) >= bounds.minY - margin
  );
}
