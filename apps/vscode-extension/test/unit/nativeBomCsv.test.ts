import { parseNativeKiCadBomCsv } from '../../src/bom/nativeBomCsv';

const HEADER =
  '"Reference","Value","Footprint","Quantity","DNP","MPN","Manufacturer","LCSC","Description"\n';

describe('KiCad native multi-sheet BOM CSV', () => {
  it('retains every designator and manufacturer field across groups', () => {
    const rows =
      HEADER +
      '"C1","10uF","C_0603","1","","M1","Acme","L1","Small capacitor"\n' +
      '"C2","10uF","C_0603","1","","M1","Acme","L1","Small capacitor"\n' +
      '"R1","10k","R_0603","1","DNP","M2","Acme","L2","Resistor"\n';
    const entries = parseNativeKiCadBomCsv(rows, true);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.references).toEqual(['C1', 'C2']);
    expect(entries[0]?.quantity).toBe(2);
    expect(entries[0]?.lcsc).toBe('L1');
    expect(entries[1]?.dnp).toBe(true);
    expect(parseNativeKiCadBomCsv(rows, false)).toHaveLength(3);
  });

  it('parses quoted commas, embedded newlines, doubled quotes and a BOM marker', () => {
    const rows =
      '\uFEFF' +
      HEADER +
      '"U1","Amp, Dual","Package","1","","","Example","", "bad"\n';
    expect(() => parseNativeKiCadBomCsv(rows, false)).toThrow('malformed');
    const valid =
      '\uFEFF' +
      HEADER +
      '"U1","Amp, Dual","Package","1","","","Example","","Line 1\nLine ""2"""\n';
    const entries = parseNativeKiCadBomCsv(valid, false);
    expect(entries[0]?.value).toBe('Amp, Dual');
    expect(entries[0]?.description).toBe('Line 1\nLine "2"');
  });

  it.each([
    '',
    '"Reference","Value"\n"C1","10k"\n',
    HEADER + '"C1","10k","R_0603","2","","","","",""\n',
    HEADER + '"C1","10k","R_0603","1","","","",""\n',
    HEADER + '"C1","10k","R_0603","1","MAYBE","","","",""\n',
    HEADER + '"C1","10k","R_0603","1","","","","","unterminated\n'
  ])('fails closed for incompatible or malformed native BOM data', (raw) => {
    expect(() => parseNativeKiCadBomCsv(raw, false)).toThrow();
  });
});
