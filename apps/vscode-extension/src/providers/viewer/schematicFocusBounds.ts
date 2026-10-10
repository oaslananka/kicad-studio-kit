import {
  SExpressionParser,
  type SNode
} from '../../language/sExpressionParser';

export interface SchematicFocusBounds {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

function tag(node: SNode): string | undefined {
  const head = node.children?.[0];
  return head && head.type !== 'list' ? String(head.value) : undefined;
}

function coordinate(node: SNode): [number, number] | undefined {
  const x = Number(node.children?.[1]?.value);
  const y = Number(node.children?.[2]?.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }
  // KiCad sheet coordinates are millimetres. Reject impossible input before
  // transferring geometry into a webview-controlled SVG viewport.
  if (Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000) {
    return undefined;
  }
  return [x, y];
}

/** Conservative placed-object bounds, not a substitute for a KiCad render geometry API. */
export function schematicFocusBounds(
  base64: string
): SchematicFocusBounds | undefined {
  if (!base64 || base64.length > 8_000_000) {
    return undefined;
  }
  try {
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > 6_000_000) {
      return undefined;
    }
    const parser = new SExpressionParser();
    const root = parser.parse(bytes.toString('utf8'));
    if (parser.getErrors(root).length) {
      return undefined;
    }
    const schematic = parser.findNode(root, 'kicad_sch') ?? root;
    const points: Array<[number, number]> = [];
    let symbols = 0;
    for (const node of schematic.children ?? []) {
      const nodeTag = tag(node);
      if (nodeTag === 'symbol') {
        // Only top-level placed symbols; lib_symbols are definitions, not drawing objects.
        const at = node.children?.find((child) => tag(child) === 'at');
        const xy = at && coordinate(at);
        if (xy) {
          points.push(xy);
          symbols++;
        }
      } else if (nodeTag === 'wire' || nodeTag === 'polyline') {
        const pts = node.children?.find((child) => tag(child) === 'pts');
        for (const xyNode of pts?.children ?? []) {
          if (tag(xyNode) === 'xy') {
            const xy = coordinate(xyNode);
            if (xy) points.push(xy);
          }
        }
      } else if (
        [
          'junction',
          'no_connect',
          'label',
          'global_label',
          'hierarchical_label'
        ].includes(nodeTag ?? '')
      ) {
        const at = node.children?.find((child) => tag(child) === 'at');
        const xy = at && coordinate(at);
        if (xy) points.push(xy);
      }
      if (points.length > 100_000) return undefined;
    }
    if (!symbols || !points.length) return undefined;
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    // Include footprint/labels around anchors without overfitting tiny drawings.
    const pad = 12;
    return {
      minX: left - pad,
      minY: top - pad,
      width: Math.max(24, right - left + pad * 2),
      height: Math.max(24, bottom - top + pad * 2)
    };
  } catch {
    return undefined; // Malformed KiCad source retains the existing full-page fit.
  }
}
