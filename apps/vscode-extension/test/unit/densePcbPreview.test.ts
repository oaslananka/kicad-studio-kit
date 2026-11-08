import { selectBoundedPcbPreview } from '../../src/providers/viewer/densePcbPreview';

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
});
