import * as fs from 'node:fs';
import * as path from 'node:path';
import { schematicFocusBounds } from '../../src/providers/viewer/schematicFocusBounds';

const toBase64 = (text: string): string => Buffer.from(text).toString('base64');

describe('schematic content framing', () => {
  it('focuses only placed symbols and wires, not library definitions', () => {
    const source = `(kicad_sch
      (lib_symbols (symbol "Device:R" (at 999 999)))
      (symbol (lib_id "Device:R") (at 55 65 0))
      (symbol (lib_id "Device:R") (at 85 70 0))
      (wire (pts (xy 55 65) (xy 90 70))))`;
    expect(schematicFocusBounds(toBase64(source))).toEqual({
      minX: 43,
      minY: 53,
      width: 59,
      height: 29
    });
  });

  it('uses KiCad 10 real project placed objects instead of page outline', () => {
    const text = fs.readFileSync(
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
    const focus = schematicFocusBounds(toBase64(text));
    expect(focus).toBeDefined();
    expect(focus!.width).toBeGreaterThan(24);
    expect(focus!.height).toBeGreaterThan(24);
    expect(focus!.width).toBeLessThan(297);
    expect(focus!.height).toBeLessThan(210);
  });

  it('fails closed on malformed, empty and library-only schematic content', () => {
    expect(schematicFocusBounds('')).toBeUndefined();
    expect(
      schematicFocusBounds(toBase64('(kicad_sch (symbol'))
    ).toBeUndefined();
    expect(
      schematicFocusBounds(
        toBase64('(kicad_sch (lib_symbols (symbol "R" (at 22 22))))')
      )
    ).toBeUndefined();
  });
});
