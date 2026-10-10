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

  it('matches native KiCad 10 BOM references for a schematic with library definitions', () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'examples',
        'led-basic',
        'KICAD_TEST.kicad_sch'
      ),
      'utf8'
    );
    const entries = new BomParser(new SExpressionParser()).parse(source, false);
    // kicad-cli sch export bom on this fixture includes exactly D1, J1, R1.
    expect(entries.map((entry) => entry.references[0]).sort()).toEqual([
      'D1',
      'J1',
      'R1'
    ]);
  });

  it('excludes in_bom=no without conflating exclusion, board placement and DNP', () => {
    const source = `(kicad_sch
      (lib_symbols (symbol "Device:R"
        (property "Reference" "R") (property "Value" "R")))
      (symbol (lib_id "Device:R") (in_bom yes) (on_board no) (dnp no)
        (property "Reference" "R1") (property "Value" "10k"))
      (symbol (lib_id "Device:R") (in_bom yes) (on_board yes) (dnp yes)
        (property "Reference" "R2") (property "Value" "20k"))
      (symbol (lib_id "Device:R") (in_bom no) (on_board yes) (dnp no)
        (property "Reference" "R3") (property "Value" "30k"))
      (symbol (lib_id "power:GND") (in_bom yes)
        (property "Reference" "#PWR01") (property "Value" "GND")))`;
    const entries = new BomParser(new SExpressionParser()).parse(source, false);
    expect(entries.map((entry) => entry.references[0])).toEqual(['R1', 'R2']);
    expect(entries.map((entry) => entry.dnp)).toEqual([false, true]);
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
