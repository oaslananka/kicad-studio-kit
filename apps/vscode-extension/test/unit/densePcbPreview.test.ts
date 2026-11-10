import {
  rebuildAccumulatedPcbPreview,
  selectBoundedPcbPreview
} from '../../src/providers/viewer/densePcbPreview';

const realGeometry = String.raw`(kicad_pcb
  (version 20250114)
  (generator "pcbnew")
  ; This comment contains a fake (zone) with unmatched ( braces.
  (layers
    (0 "F.Cu" signal)
    (1 "In1.Cu" signal)
    (31 "B.Cu" signal)
  )
  (net 0 "")
  (net 1 "GND")
  (footprint "Local:F-Cu"
    (layer "F.Cu")
    (at 10 10)
    (property "Reference" "R(1)")
    (pad "1" smd rect (at 0 0) (net 1 "GND"))
  )
  (footprint "Local:B-Cu" (layer "B.Cu") (at 12 12)
    (pad "1" smd rect (at 0 0) (net 1 "GND"))
  )
  (footprint "Outside" (layer "F.Cu") (at 250 250))
  (segment (start -10 10) (end 30 10) (layer "F.Cu") (net 1))
  (segment (start 150 150) (end 160 160) (layer "F.Cu") (net 1))
  (via (at 11 11) (layers "F.Cu" "B.Cu") (net 1))
  (zone (net 1) (layer "F.Cu") (polygon (pts (xy 1 1) (xy 20 20))))
)`;

const VIEWPORT = { minX: 0, maxX: 20, minY: 0, maxY: 20 };

describe('bounded genuine KiCad PCB spatial preview', () => {
  it('preserves source expressions without implying complete copper geometry', () => {
    const result = selectBoundedPcbPreview(realGeometry, {
      viewport: VIEWPORT,
      maxBytes: 1024 * 1024
    });
    expect(result.complete).toBe(false);
    expect(result.warning).toContain('PARTIAL PREVIEW');
    expect(result.warning).toContain('all zones are omitted');
    expect(result.included).toMatchObject({
      layers: 1,
      net: 2,
      footprint: 2,
      segment: 1,
      via: 1
    });
    expect(result.omitted).toMatchObject({ footprint: 1, segment: 1, zone: 1 });
    expect(result.eligibleInViewport).toMatchObject({
      footprint: 2,
      segment: 1,
      via: 1
    });
    expect(result.viewportTruncated).toBe(false);
    expect(result.text).toContain('(property "Reference" "R(1)")');
    expect(result.text).toContain('(start -10 10) (end 30 10)');
    expect(result.text).not.toContain('(start 150 150)');
    expect(result.text).not.toContain('(zone');
    expect(result.text).not.toContain('unmatched ( braces');
    expect(result.sourceObjects).toMatchObject({
      footprint: 3,
      segment: 2,
      zone: 1
    });
  });

  it('accounts for original footprint pads, net headers, and omitted zone layers without inventing copper fill', () => {
    const source = String.raw`(kicad_pcb
      (version 20250114)
      (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
      (net 0 "") (net 1 "GND") (net 2 "SIGNAL")
      (footprint "Retained" (layer "F.Cu") (at 10 10)
        (property "Description" "not a (pad \"fake\" entry")
        ; (pad "comment" smd rect (net 200))
        (pad "A" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "GND"))
        (pad "B" smd rect (at 1 0) (size 1 1) (layers "F.Cu") (net 2 "SIGNAL"))
      )
      (footprint "Back" (layer "B.Cu") (at 11 11)
        (pad "C" smd rect (at 0 0) (size 1 1) (layers "B.Cu") (net 1 "GND"))
      )
      (footprint "Far" (layer "F.Cu") (at 300 300)
        (pad "D" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 2 "SIGNAL"))
      )
      (zone (net 1) (layer "F.Cu") (polygon (pts (xy 1 1) (xy 20 20)))
        (filled_polygon (layer "F.Cu") (pts (xy 1 1) (xy 20 20))))
      (zone (net 1) (layers "F.Cu" "B.Cu")
        (polygon (pts (xy 3 3) (xy 10 10))))
      (zone (net 1) (layer "B.Cu")
        (polygon (pts (xy 40 40) (xy 50 50))))
    )`;
    const preview = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['F.Cu']
    });
    expect(preview.sourceObjects['zone']).toBe(3);
    expect(preview.omitted['zone']).toBe(3);
    expect(preview.omittedZonesByLayer).toEqual({ 'F.Cu': 2, 'B.Cu': 2 });
    expect(preview.sourceFootprintPads).toBe(4);
    expect(preview.includedFootprintPads).toBe(2);
    expect(preview.included).toMatchObject({ footprint: 1, net: 3 });
    expect(preview.text).toContain('(pad "A" smd rect');
    expect(preview.text).toContain('(net 2 "SIGNAL")');
    expect(preview.text).not.toContain('(pad "C"');
    expect(preview.text).not.toContain('(filled_polygon');
    expect(preview.warning).toContain('all zones are omitted (3 source zones)');
    expect(preview.warning).toContain('2/4 footprint pads');
    expect(preview.complete).toBe(false);

    const noFootprints = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['F.Cu'],
      limits: { footprint: 0 }
    });
    expect(noFootprints.sourceFootprintPads).toBe(4);
    expect(noFootprints.includedFootprintPads).toBe(0);
    expect(noFootprints.included['net']).toBe(3);
    expect(noFootprints.warning).toContain('0/4 footprint pads');
  });
  it('distinguishes actual intersecting source zone outlines from bbox-only and unknown polygons', () => {
    const zone = (layer: string, polygon: string) =>
      '(zone (net 1) (layer "' + layer + '") ' + polygon + ')';
    const shape = (points: ReadonlyArray<readonly [number, number]>) =>
      '(polygon (pts ' +
      points.map(([x, y]) => '(xy ' + x + ' ' + y + ')').join(' ') +
      '))';
    const crossing = shape([
      [-10, 10],
      [30, 10],
      [30, 11],
      [-10, 11]
    ]);
    const enclosing = shape([
      [-10, -10],
      [30, -10],
      [30, 30],
      [-10, 30]
    ]);
    const bboxOnly = shape([
      [0, 41],
      [41, 0],
      [41, 41]
    ]);
    const distant = shape([
      [40, 40],
      [45, 40],
      [45, 45]
    ]);
    const unknownArc =
      '(polygon (pts (xy -10 10) (arc (start -10 10) (mid 0 0) (end 10 10)) (xy 10 10)))';
    const source = `(kicad_pcb
      (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
      (net 0 "") (net 1 "GND")
      ${zone('F.Cu', crossing)}
      ${zone('F.Cu', enclosing)}
      ${zone('F.Cu', bboxOnly)}
      ${zone('F.Cu', distant)}
      ${zone('B.Cu', crossing)}
      ${zone('F.Cu', '')}
      ${zone('F.Cu', unknownArc)}
      ; A fake (zone (polygon (pts (xy 1 1)))) is not source.
    )`;
    const front = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['F.Cu']
    });
    expect(front.sourceObjects['zone']).toBe(7);
    expect(front.omitted['zone']).toBe(7);
    expect(front.omittedZoneOutlinesInViewport).toBe(2);
    expect(front.unclassifiedZoneOutlines).toBe(2);
    expect(front.omittedZonesByLayer).toEqual({ 'F.Cu': 6, 'B.Cu': 1 });
    expect(front.omittedZoneOutlinesInViewportByLayer).toEqual({ 'F.Cu': 2 });
    expect(front.unclassifiedZoneOutlinesByLayer).toEqual({ 'F.Cu': 2 });
    expect(front.warning).toContain('2 source outlines overlap this region');
    expect(front.warning).toContain('2 unclassified');
    expect(front.text).not.toContain('(zone ');
    expect(front.complete).toBe(false);

    const back = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['B.Cu']
    });
    expect(back.omittedZoneOutlinesInViewport).toBe(1);
    expect(back.unclassifiedZoneOutlines).toBe(0);
    expect(back.omittedZoneOutlinesInViewportByLayer).toEqual({ 'B.Cu': 1 });
    expect(back.unclassifiedZoneOutlinesByLayer).toEqual({});
    expect(back.warning).not.toContain('unclassified');

    // Multiple direct zone polygons cannot be treated as one valid contour.
    const ambiguous = selectBoundedPcbPreview(
      `(kicad_pcb (layers (0 "F.Cu" signal)) ${zone('F.Cu', crossing + ' ' + enclosing)})`,
      { viewport: VIEWPORT }
    );
    expect(ambiguous.sourceObjects['zone']).toBe(1);
    expect(ambiguous.omittedZoneOutlinesInViewport).toBe(0);
    expect(ambiguous.unclassifiedZoneOutlines).toBe(1);
    expect(ambiguous.omittedZoneOutlinesInViewportByLayer).toEqual({});
    expect(ambiguous.unclassifiedZoneOutlinesByLayer).toEqual({ 'F.Cu': 1 });
    const allLayers = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT
    });
    expect(allLayers.omittedZoneOutlinesInViewport).toBe(3);
    expect(allLayers.omittedZoneOutlinesInViewportByLayer).toEqual({
      'F.Cu': 2,
      'B.Cu': 1
    });
    expect(allLayers.unclassifiedZoneOutlinesByLayer).toEqual({ 'F.Cu': 2 });
  });
  it('includes real through-hole pads on inner copper even when their footprint is on F.Cu', () => {
    const source = String.raw`(kicad_pcb
      (layers (0 "F.Cu" signal) (4 "In1.Cu" signal) (31 "B.Cu" signal))
      (net 0 "") (net 1 "THROUGH")
      (footprint "SMD-only" (layer "F.Cu") (at 10 10)
        (property "Description" "text contains (pad (layers *.Cu))")
        (pad "1" smd rect (at 0 0) (layers "F.Cu" "F.Mask") (net 1 "THROUGH")))
      (footprint "Through-hole" (layer "F.Cu") (at 11 11)
        (pad "1" thru_hole circle (at 0 0) (size 2 2) (drill 0.8)
          (layers "*.Cu" "*.Mask") (net 1 "THROUGH")))
      (footprint "Back-side" (layer "B.Cu") (at 12 12)
        (pad "1" smd rect (at 0 0) (layers "B.Cu" "B.Mask") (net 1 "THROUGH")))
      (footprint "Nested-decoy" (layer "F.Cu") (at 13 13)
        (fp_line (layers "*.Cu") (start 0 0) (end 1 1)))
    )`;
    const inner = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['In1.Cu']
    });
    expect(inner.eligibleInViewport['footprint']).toBe(1);
    expect(inner.included['footprint']).toBe(1);
    expect(inner.text).toContain('(footprint "Through-hole"');
    expect(inner.text).not.toContain('(footprint "SMD-only"');
    expect(inner.text).not.toContain('(footprint "Nested-decoy"');
    expect(inner.text).not.toContain('(footprint "Back-side"');
    expect(inner.includedFootprintPads).toBe(1);
    expect(inner.complete).toBe(false);
    const back = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['B.Cu']
    });
    expect(back.eligibleInViewport['footprint']).toBe(2);
    expect(back.text).toContain('(footprint "Back-side"');
    expect(back.text).toContain('(footprint "Through-hole"');
  });

  it('rejects long untrusted prefixes and invented PCB keyword suffixes', () => {
    for (const source of [
      ' '.repeat(200_000) + '(other_document)',
      '(kicad_pcb_extra (layers (0 "F.Cu" signal)))',
      '(kicad_pcb0 (layers (0 "F.Cu" signal)))'
    ]) {
      expect(() =>
        selectBoundedPcbPreview(source, {
          viewport: VIEWPORT,
          maxBytes: 4096
        })
      ).toThrow('Expected a KiCad PCB source file.');
    }
    expect(() =>
      selectBoundedPcbPreview('  \n(kicad_pcb (layers (0 "F.Cu" signal)))', {
        viewport: VIEWPORT,
        maxBytes: 4096
      })
    ).not.toThrow();
  });

  it('includes straight copper segments crossing the viewport without an endpoint inside', () => {
    const source = `(kicad_pcb
      (version 20250114)
      (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
      (net 0 "")
      (net 1 "GND")
      (segment (start -10 10) (end 30 10) (layer "F.Cu") (net 1) (uuid "horizontal"))
      (segment (start 10 -10) (end 10 30) (layer "F.Cu") (net 1) (uuid "vertical"))
      (segment (start -10 -10) (end 30 30) (layer "F.Cu") (net 1) (uuid "diagonal"))
      (segment (start -10 0) (end 0 30) (layer "F.Cu") (net 1) (uuid "bbox-outside"))
      (segment (start 35 35) (end 35 35) (layer "F.Cu") (net 1) (uuid "point-outside"))
      (segment (start 10 10) (end 10 10) (layer "F.Cu") (net 1) (uuid "point-inside"))
      (segment (start -10 10) (end 30 10) (layer "B.Cu") (net 1) (uuid "back"))
    )`;
    const preview = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['F.Cu'],
      limits: { segment: 2 }
    });
    expect(preview.complete).toBe(false);
    expect(preview.included).toMatchObject({ net: 2, segment: 2 });
    expect(preview.eligibleInViewport['segment']).toBe(4);
    expect(preview.remainingAfterPage['segment']).toBe(2);
    expect(preview.text).toContain('(net 1 "GND")');
    expect(preview.text).toContain('(net 1) (uuid "horizontal")');
    expect(preview.text).toContain('(uuid "vertical")');
    expect(preview.text).not.toContain('(uuid "bbox-outside")');
    expect(preview.text).not.toContain('(uuid "back")');

    const next = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['F.Cu'],
      limits: { segment: 2 },
      cursor: preview.nextCursor,
      continuationToken: preview.continuationToken
    });
    expect(next.text).toContain('(uuid "diagonal")');
    expect(next.text).toContain('(uuid "point-inside")');
    expect(next.text).not.toContain('(uuid "horizontal")');
    expect(next.remainingAfterPage['segment']).toBe(0);
    expect(next.hasNextPage).toBe(false);

    const combined = rebuildAccumulatedPcbPreview(source, next);
    expect(combined.included['segment']).toBe(4);
    expect(combined.text).toContain('(uuid "horizontal")');
    expect(combined.text).toContain('(uuid "diagonal")');
    expect(combined.text).not.toContain('(uuid "bbox-outside")');

    const back = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['B.Cu']
    });
    expect(back.included['segment']).toBe(1);
    expect(back.text).toContain('(uuid "back")');
    expect(back.text).not.toContain('(uuid "horizontal")');
  });

  it('does not confuse straight track bounding boxes with copper crossing a region', () => {
    const source = `(kicad_pcb
      (layers (0 "F.Cu" signal))
      (segment (start -20 -20) (end 30 30) (layer "F.Cu") (uuid "cross"))
      (segment (start -10 0) (end 0 30) (layer "F.Cu") (uuid "bbox-only"))
      (segment (start 10 10) (end 10 10) (layer "F.Cu") (uuid "inside-point"))
      (segment (start -2 -2) (end -2 -2) (layer "F.Cu") (uuid "outside-point"))
    )`;
    const preview = selectBoundedPcbPreview(source, { viewport: VIEWPORT });
    expect(preview.included['segment']).toBe(2);
    expect(preview.text).toContain('(uuid "cross")');
    expect(preview.text).toContain('(uuid "inside-point")');
    expect(preview.text).not.toContain('(uuid "bbox-only")');
    expect(preview.text).not.toContain('(uuid "outside-point")');
    expect(preview.omitted['segment']).toBe(2);
    expect(preview.warning).toContain('PARTIAL PREVIEW');
  });
  it('selects blind, buried and through vias across their physical copper-layer spans', () => {
    const innerLayers = Array.from(
      { length: 10 },
      (_, index) => `(${4 + 2 * index} "In${index + 1}.Cu" signal)`
    ).join('\n');
    const source = `(kicad_pcb
      (version 20250114)
      (layers (0 "F.Cu" signal) ${innerLayers} (31 "B.Cu" signal))
      (net 0 "") (net 1 "GND") (net 2 "SIGNAL")
      (via (at 11 11) (layers "F.Cu" "In3.Cu") (net 2) (uuid "blind"))
      (via (at 12 12) (layers "In3.Cu" "In5.Cu") (net 1) (uuid "buried"))
      (via (at 13 13) (layers "In5.Cu" "B.Cu") (net 1) (uuid "lower"))
      (via (at 14 14) (layers "F.Cu" "B.Cu") (net 2) (uuid "through"))
      (via (at 40 40) (layers "F.Cu" "B.Cu") (net 2) (uuid "outside"))
      (via (at 15 15) (layers "F.Cu" "In99.Cu") (net 1) (uuid "invalid"))
      (zone (net 1) (layer "F.Cu") (polygon (pts (xy 1 1) (xy 20 20))))
    )`;
    const cases: ReadonlyArray<[string, readonly string[]]> = [
      ['F.Cu', ['blind', 'through']],
      ['In2.Cu', ['blind', 'through']],
      ['In3.Cu', ['blind', 'buried', 'through']],
      ['In4.Cu', ['buried', 'through']],
      ['In5.Cu', ['buried', 'lower', 'through']],
      ['In6.Cu', ['lower', 'through']],
      ['In10.Cu', ['lower', 'through']],
      ['B.Cu', ['lower', 'through']]
    ];
    for (const [layer, ids] of cases) {
      const preview = selectBoundedPcbPreview(source, {
        viewport: VIEWPORT,
        layers: [layer]
      });
      const actual = [
        ...preview.text.matchAll(
          /\(uuid "(blind|buried|lower|through|outside|invalid)"\)/g
        )
      ].map((match) => match[1]);
      expect(actual).toEqual(ids);
      expect(preview.included).toMatchObject({
        layers: 1,
        net: 3,
        via: ids.length
      });
      expect(preview.text).toContain('(net 1 "GND")');
      expect(preview.text).toContain('(net 2 "SIGNAL")');
      expect(preview.omitted['zone']).toBe(1);
      expect(preview.complete).toBe(false);
      expect(preview.warning).toContain('all zones are omitted');
    }

    const first = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['In3.Cu'],
      limits: { via: 2 }
    });
    expect(first.included['via']).toBe(2);
    expect(first.remainingAfterPage['via']).toBe(1);
    const second = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['In3.Cu'],
      cursor: first.nextCursor,
      continuationToken: first.continuationToken,
      limits: { via: 2 }
    });
    expect(second.included['via']).toBe(1);
    expect(second.text).toContain('(uuid "through")');
    expect(second.text).not.toContain('(uuid "blind")');
    const combined = rebuildAccumulatedPcbPreview(source, second);
    expect(combined.included['via']).toBe(3);
    expect(combined.text).toContain('(uuid "blind")');
    expect(combined.text).toContain('(uuid "buried")');
    expect(combined.text).toContain('(uuid "through")');

    expect(() =>
      selectBoundedPcbPreview(source, {
        viewport: VIEWPORT,
        layers: ['In11.Cu']
      })
    ).toThrow('Requested copper layer is not declared');
  });
  it('intersects three-point copper arcs by sweep, including major arcs and missed extrema', () => {
    const source = `(kicad_pcb
      (version 20250114)
      (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
      (net 0 "") (net 1 "GND")
      (arc (start 8.660254 5) (mid -5 8.660254) (end -8.660254 5)
        (layer "F.Cu") (net 1) (uuid "apex"))
      (arc (start 10 0) (mid 0 10) (end -10 0)
        (layer "F.Cu") (net 1) (uuid "top-half"))
      (arc (start 10 0) (mid -10 0) (end 0 -10)
        (layer "F.Cu") (net 1) (uuid "major"))
      (arc (start 10 0) (mid 0 -10) (end -10 0)
        (layer "F.Cu") (net 1) (uuid "bottom-half"))
      (arc (start -10 5) (mid 10 5) (end 30 5)
        (layer "F.Cu") (net 1) (uuid "collinear"))
      (arc (start 10 0) (mid 0 10) (end -10 0)
        (layer "B.Cu") (net 1) (uuid "back-half"))
      (zone (net 1) (layer "F.Cu") (polygon (pts (xy 1 1))))
    )`;
    const nearApex = selectBoundedPcbPreview(source, {
      viewport: { minX: -1, maxX: 1, minY: 9, maxY: 10.5 },
      layers: ['F.Cu'],
      limits: { arc: 2 }
    });
    expect(nearApex.eligibleInViewport['arc']).toBe(3);
    expect(nearApex.included).toMatchObject({ arc: 2, net: 2 });
    expect(nearApex.text).toContain('(uuid "apex")');
    expect(nearApex.text).toContain('(uuid "top-half")');
    expect(nearApex.text).not.toContain('(uuid "bottom-half")');
    expect(nearApex.remainingAfterPage['arc']).toBe(1);
    expect(nearApex.warning).toContain('all zones are omitted');
    expect(nearApex.complete).toBe(false);
    const next = selectBoundedPcbPreview(source, {
      viewport: nearApex.viewport,
      layers: ['F.Cu'],
      limits: { arc: 2 },
      cursor: nearApex.nextCursor,
      continuationToken: nearApex.continuationToken
    });
    expect(next.text).toContain('(uuid "major")');
    expect(next.text).not.toContain('(uuid "apex")');
    expect(next.remainingAfterPage['arc']).toBe(0);
    const combined = rebuildAccumulatedPcbPreview(source, next);
    expect(combined.included['arc']).toBe(3);
    expect(combined.text).toContain('(net 1 "GND")');
    expect(combined.text).toContain('(uuid "major")');
    expect(combined.text).not.toContain('(uuid "bottom-half")');

    const falseBox = selectBoundedPcbPreview(source, {
      viewport: { minX: 7, maxX: 8, minY: 1, maxY: 2 },
      layers: ['F.Cu']
    });
    expect(falseBox.text).not.toContain('(uuid "top-half")');
    const bottom = selectBoundedPcbPreview(source, {
      viewport: { minX: -1, maxX: 1, minY: -11, maxY: -9 },
      layers: ['F.Cu']
    });
    expect(bottom.text).toContain('(uuid "bottom-half")');
    expect(bottom.text).toContain('(uuid "major")');
    expect(bottom.text).not.toContain('(uuid "top-half")');

    const collinear = selectBoundedPcbPreview(source, {
      viewport: { minX: 12, maxX: 18, minY: 4, maxY: 6 },
      layers: ['F.Cu']
    });
    expect(collinear.text).toContain('(uuid "collinear")');
    const oppositeLayer = selectBoundedPcbPreview(source, {
      viewport: { minX: -1, maxX: 1, minY: 9, maxY: 10.5 },
      layers: ['B.Cu']
    });
    expect(oppositeLayer.included['arc']).toBe(1);
    expect(oppositeLayer.text).toContain('(uuid "back-half")');
    expect(oppositeLayer.text).not.toContain('(uuid "top-half")');
  });
  it('selects a requested copper layer, keeping a true through-via', () => {
    const result = selectBoundedPcbPreview(realGeometry, {
      viewport: VIEWPORT,
      layers: ['B.Cu'],
      limits: { footprint: 1 }
    });
    expect(result.included).toMatchObject({ footprint: 1, via: 1 });
    expect(result.text).toContain('Local:B-Cu');
    expect(result.text).not.toContain('Local:F-Cu');
    expect(result.text).not.toContain('(segment (start -10 10)');
    expect(result.layers).toEqual(['B.Cu']);
  });

  it('uses a deterministic locale-aware layer order for continuation tokens', () => {
    const first = selectBoundedPcbPreview(realGeometry, {
      viewport: VIEWPORT,
      layers: ['F.Cu', 'B.Cu']
    });
    const reversed = selectBoundedPcbPreview(realGeometry, {
      viewport: VIEWPORT,
      layers: ['B.Cu', 'F.Cu']
    });
    expect(first.continuationToken).toMatch(/^[a-f0-9]{64}$/);
    expect(reversed.continuationToken).toBe(first.continuationToken);
  });

  it('distinguishes in-viewport items omitted by caps from out-of-view objects', () => {
    const preview = selectBoundedPcbPreview(realGeometry, {
      viewport: VIEWPORT,
      limits: { footprint: 1, segment: 0, via: 0 }
    });
    expect(preview.eligibleInViewport).toMatchObject({
      footprint: 2,
      segment: 1,
      via: 1
    });
    expect(preview.omittedInViewport).toMatchObject({
      footprint: 1,
      segment: 1,
      via: 1
    });
    expect(preview.viewportTruncated).toBe(true);
    expect(preview.text).toContain('Local:F-Cu');
    expect(preview.text).not.toContain('Local:B-Cu');
  });

  it('advances stable in-window cursors without duplicate or missing track expressions', () => {
    const source = String.raw`(kicad_pcb (version 20250114)
      (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
      (net 0 "")
      (segment (start 1 1) (end 2 2) (layer "F.Cu") (net 0) (uuid "s-1"))
      (segment (start 2 2) (end 3 3) (layer "F.Cu") (net 0) (uuid "s-2"))
      (segment (start 3 3) (end 4 4) (layer "F.Cu") (net 0) (uuid "s-3"))
      (segment (start 100 100) (end 110 110) (layer "F.Cu") (uuid "off-screen"))
    )`;
    let cursor: Partial<Record<'segment', number>> = {};
    let firstToken = '';
    const ids: string[] = [];
    for (let pageNumber = 0; pageNumber < 3; pageNumber += 1) {
      const page = selectBoundedPcbPreview(source, {
        viewport: VIEWPORT,
        limits: { segment: 1 },
        cursor,
        continuationToken: firstToken
      });
      const match = page.text.match(/\(uuid "(s-\d+)"\)/);
      expect(match?.[1]).toBe('s-' + (pageNumber + 1));
      ids.push(match?.[1] ?? 'MISSING');
      firstToken = page.continuationToken;
      expect(page.madeProgress).toBe(true);
      expect(page.nextCursor.segment).toBe(pageNumber + 1);
      expect(page.remainingAfterPage['segment']).toBe(2 - pageNumber);
      expect(page.hasNextPage).toBe(pageNumber !== 2);
      cursor = page.nextCursor;
    }
    expect(new Set(ids).size).toBe(3);
    const empty = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      limits: { segment: 1 },
      cursor,
      continuationToken: firstToken
    });
    expect(empty.madeProgress).toBe(false);
    expect(empty.hasNextPage).toBe(false);
    expect(empty.nextCursor.segment).toBe(3);
  });

  it('does not advance a cursor past an oversized object and silently omit it', () => {
    const source =
      '(kicad_pcb (layers (0 "F.Cu" signal))' +
      '(segment (start 1 1) (end 2 2) (layer "F.Cu") (uuid "small-before"))' +
      '(segment (start 2 2) (end 3 3) (layer "F.Cu") ' +
      '(description "' +
      'x'.repeat(5000) +
      '") (uuid "too-large"))' +
      '(segment (start 3 3) (end 4 4) (layer "F.Cu") (uuid "small-after"))' +
      ')';
    const first = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      maxBytes: 4096
    });
    expect(first.included['segment']).toBe(1);
    expect(first.nextCursor.segment).toBe(1);
    expect(first.hasNextPage).toBe(true);
    expect(first.text).not.toContain('small-after');
    const second = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      maxBytes: 4096,
      cursor: first.nextCursor,
      continuationToken: first.continuationToken
    });
    expect(second.nextCursor.segment).toBe(1);
    expect(second.remainingAfterPage['segment']).toBe(2);
    expect(second.madeProgress).toBe(false);
    expect(second.hasNextPage).toBe(true);
    expect(second.text).not.toContain('small-after');
  });

  it('rejects cursor reuse across source, viewport and layer changes', () => {
    const first = selectBoundedPcbPreview(realGeometry, {
      viewport: VIEWPORT,
      limits: { segment: 1, footprint: 1 }
    });
    expect(first.continuationToken).toMatch(/^[a-f0-9]{64}$/);
    const next = {
      viewport: VIEWPORT,
      cursor: first.nextCursor,
      continuationToken: first.continuationToken
    };
    expect(() => selectBoundedPcbPreview(realGeometry, next)).not.toThrow();
    expect(() => selectBoundedPcbPreview(realGeometry + ' ', next)).toThrow(
      'Preview continuation is stale'
    );
    expect(() =>
      selectBoundedPcbPreview(realGeometry, {
        ...next,
        viewport: { ...VIEWPORT, maxX: 21 }
      })
    ).toThrow('Preview continuation is stale');
    expect(() =>
      selectBoundedPcbPreview(realGeometry, {
        ...next,
        layers: ['B.Cu']
      })
    ).toThrow('Preview continuation is stale');
    expect(() =>
      selectBoundedPcbPreview(realGeometry, {
        viewport: VIEWPORT,
        cursor: first.nextCursor
      })
    ).toThrow('Preview continuation is stale');
  });

  it('rebuilds two cursor pages into a single source-ordered partial PCB snapshot', () => {
    const source = `(kicad_pcb (version 20250114)
      (layers (0 "F.Cu" signal))
      (net 0 "")
      (segment (start 1 1) (end 2 2) (layer "F.Cu") (uuid "s-a"))
      (segment (start 3 3) (end 4 4) (layer "F.Cu") (uuid "s-b"))
      (segment (start 5 5) (end 6 6) (layer "F.Cu") (uuid "s-c"))
    )`;
    const one = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      limits: { segment: 1 }
    });
    const two = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      limits: { segment: 1 },
      cursor: one.nextCursor,
      continuationToken: one.continuationToken
    });
    expect(one.text).toContain('"s-a"');
    expect(one.text).not.toContain('"s-b"');
    expect(two.text).not.toContain('"s-a"');
    expect(two.text).toContain('"s-b"');

    const combined = rebuildAccumulatedPcbPreview(source, two);
    expect(combined.text).toContain('"s-a"');
    expect(combined.text).toContain('"s-b"');
    expect(combined.text).not.toContain('"s-c"');
    expect(combined.text.match(/\(layers/g)).toHaveLength(1);
    expect(combined.text.match(/\(net 0 ""\)/g)).toHaveLength(1);
    expect(combined.nextCursor.segment).toBe(2);
    expect(combined.complete).toBe(false);
    expect(combined.warning).toContain('PARTIAL PREVIEW');
    expect(() => rebuildAccumulatedPcbPreview(source + ' ', two)).toThrow(
      'changed PCB'
    );
    expect(() => rebuildAccumulatedPcbPreview(source, two, 3_000)).toThrow(
      'preview byte budget'
    );
  });

  it('rejects negative and fractional offsets and preserves the original source string', () => {
    const original = realGeometry;
    expect(() =>
      selectBoundedPcbPreview(original, {
        viewport: VIEWPORT,
        cursor: { segment: -1 }
      })
    ).toThrow('cursor positions');
    expect(() =>
      selectBoundedPcbPreview(original, {
        viewport: VIEWPORT,
        cursor: { segment: 1.2 }
      })
    ).toThrow('cursor positions');
    const page = selectBoundedPcbPreview(original, { viewport: VIEWPORT });
    expect(page.complete).toBe(false);
    expect(realGeometry).toBe(original);
  });

  it('always rejects invalid or oversized preview requests', () => {
    expect(() =>
      selectBoundedPcbPreview(realGeometry, {
        viewport: { minX: 1, maxX: 1, minY: 0, maxY: 3 }
      })
    ).toThrow('finite, non-empty');
    expect(() =>
      selectBoundedPcbPreview(realGeometry, {
        viewport: VIEWPORT,
        layers: ['F.SilkS']
      })
    ).toThrow('copper-layer');
    expect(() =>
      selectBoundedPcbPreview(realGeometry, {
        viewport: VIEWPORT,
        maxBytes: 10 * 1024 * 1024
      })
    ).toThrow('preview byte budget');
    expect(() =>
      selectBoundedPcbPreview(realGeometry.slice(0, -1), { viewport: VIEWPORT })
    ).toThrow('incomplete expression');
    expect(() =>
      selectBoundedPcbPreview('(kicad_sch (version 20250114))', {
        viewport: VIEWPORT
      })
    ).toThrow('Expected a KiCad PCB');
  });

  it('never silently drops required layer data when the budget is exceeded', () => {
    const oversized =
      '(kicad_pcb (layers (0 "F.Cu" signal) (note "' +
      'x'.repeat(4500) +
      '")) (net 0 ""))';
    expect(() =>
      selectBoundedPcbPreview(oversized, {
        viewport: VIEWPORT,
        maxBytes: 4096
      })
    ).toThrow('board header exceeds');
  });
  it('rejects a plausible layer name missing from the actual PCB layer table', () => {
    expect(() =>
      selectBoundedPcbPreview(realGeometry, {
        viewport: VIEWPORT,
        layers: ['In99.Cu']
      })
    ).toThrow('Requested copper layer is not declared');

    expect(() =>
      selectBoundedPcbPreview(realGeometry, {
        viewport: VIEWPORT,
        layers: ['In2.Cu']
      })
    ).toThrow('Requested copper layer is not declared');

    // The same layer name is valid when KiCad actually declares it.
    expect(() =>
      selectBoundedPcbPreview(realGeometry, {
        viewport: VIEWPORT,
        layers: ['In1.Cu']
      })
    ).not.toThrow();
  });

  it('does not treat a commented-out copper layer as declared', () => {
    const source = `(kicad_pcb
      (layers
        (0 "F.Cu" signal)
        ; (2 "B.Cu" signal)
      )
      (segment (start 1 1) (end 2 2) (layer "F.Cu"))
    )`;
    expect(() =>
      selectBoundedPcbPreview(source, {
        viewport: VIEWPORT,
        layers: ['B.Cu']
      })
    ).toThrow('Requested copper layer is not declared');
  });

  it('accepts the highest internal copper layer on a KiCad-style 32-layer table', () => {
    const internal = Array.from(
      { length: 30 },
      (_, i) => `(${4 + i * 2} "In${i + 1}.Cu" signal)`
    ).join('\n');
    const source =
      '(kicad_pcb (version 20250114)\n' +
      '(layers (0 "F.Cu" signal)\n' +
      internal +
      '\n(2 "B.Cu" signal))\n' +
      '(segment (start 1 1) (end 2 2) (layer "In30.Cu") (uuid "inner"))\n' +
      ')';
    const preview = selectBoundedPcbPreview(source, {
      viewport: VIEWPORT,
      layers: ['In30.Cu']
    });
    expect(preview.included).toMatchObject({ segment: 1, layers: 1 });
    expect(preview.text).toContain('(uuid "inner")');
    expect(preview.complete).toBe(false);
  });
});
