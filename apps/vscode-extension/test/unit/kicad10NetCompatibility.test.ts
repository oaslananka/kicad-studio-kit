import { normalizeKiCad10NamedNetsForRenderer } from '../../src/providers/viewer/kicad10NetCompatibility';

describe('KiCad 10 named-net compatibility — read-only renderer normalization', () => {
  it('normalizes KiCad 10 names to numeric table and references', () => {
    const file = [
      '(kicad_pcb',
      '  (version 20260206)',
      '  (paper "A4")',
      '  (footprint "R" (pad "1" smd rect (net "GND")))',
      '  (segment (net "GND") (layer "In30.Cu"))',
      '  (via (net "USB_D+"))',
      '  (zone (net "USB_D+"))',
      ')'
    ].join('\n');
    const next = normalizeKiCad10NamedNetsForRenderer(file);
    expect(next).toContain('(net 1 "GND")');
    expect(next).toContain('(net 2 "USB_D+")');
    expect(next.match(/\(net 1 "GND"\)/g)).toHaveLength(3);
    expect(next.match(/\(net 2 "USB_D\+"\)/g)).toHaveLength(3);
    expect(next).toContain('(layer "In30.Cu")');
    expect(file).not.toContain('(net 1 "GND")');
  });

  it('preserves already numbered net references, including legacy PCB files', () => {
    const old =
      '(kicad_pcb (version 20240108) (net 1 "GND") (segment (net 1)))';
    expect(normalizeKiCad10NamedNetsForRenderer(old)).toBe(old);
  });

  it('preserves non-board sources, empty named nets and boards with no nets', () => {
    for (const source of [
      '(kicad_sch (symbol (net "GND")))',
      '(kicad_pcb (version 20260206) (layers (0 "F.Cu" signal)))',
      '(kicad_pcb (version 20260206) (net ""))'
    ]) {
      expect(normalizeKiCad10NamedNetsForRenderer(source)).toBe(source);
    }
  });

  it('preserves escaped net names exactly rather than recomputing them', () => {
    const src = String.raw`(kicad_pcb (paper "A4") (net "Signal\\\"A") (segment (net "Signal\\\"A")))`;
    const out = normalizeKiCad10NamedNetsForRenderer(src);
    expect(out).toContain(String.raw`(net 1 "Signal\\\"A")`);
    expect(out.match(/\(net 1 /g)).toHaveLength(3);
  });

  it('handles minimal valid board without paper field', () => {
    const next = normalizeKiCad10NamedNetsForRenderer(
      '(kicad_pcb (version 20260206) (segment (net "GND")))'
    );
    expect(next).toContain('(net 1 "GND")');
  });
});
