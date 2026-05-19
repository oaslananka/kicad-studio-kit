import * as fs from 'node:fs';
import * as path from 'node:path';
import { __setConfiguration } from './vscodeMock';
import { BomParser } from '../../src/bom/bomParser';
import { SExpressionParser } from '../../src/language/sExpressionParser';

describe('BomParser', () => {
  const fixture = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'sample.kicad_sch'),
    'utf8'
  );

  beforeEach(() => {
    __setConfiguration({});
  });

  it('extracts all components from schematic', () => {
    const parser = new BomParser(new SExpressionParser());
    const entries = parser.parse(fixture, false);
    expect(entries).toHaveLength(3);
  });

  it('groups identical components', () => {
    const parser = new BomParser(new SExpressionParser());
    const entries = parser.parse(fixture, true);
    expect(entries.find((entry) => entry.value === '10k')?.quantity).toBe(2);
  });

  it('handles DNP components', () => {
    const parser = new BomParser(new SExpressionParser());
    const entries = parser.parse(fixture, false);
    expect(entries.find((entry) => entry.references.includes('C1'))?.dnp).toBe(
      true
    );
  });

  it('supports LCSC field variations and empty footprint values', () => {
    const parser = new BomParser(new SExpressionParser());
    const entries = parser.parse(
      `(kicad_sch
      (symbol
        (property "Reference" "R1")
        (property "Value" "10k")
        (property "lcsc" "C1234")
        (property "Footprint" "")
      )
    )`,
      false
    );
    expect(entries[0]?.lcsc).toBe('C1234');
    expect(entries[0]?.footprint).toBe('');
  });

  it('groups quantity by identical value and footprint', () => {
    const parser = new BomParser(new SExpressionParser());
    const entries = parser.parse(
      `(kicad_sch
      (symbol (property "Reference" "R1") (property "Value" "10k") (property "Footprint" "R_0603"))
      (symbol (property "Reference" "R2") (property "Value" "10k") (property "Footprint" "R_0603"))
      (symbol (property "Reference" "R3") (property "Value" "10k") (property "Footprint" "R_0603"))
    )`,
      true
    );
    expect(entries[0]?.quantity).toBe(3);
  });
});
