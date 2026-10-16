import { bench, describe } from 'vitest';
import { BomParser } from '../src/bom/bomParser';
import { scoreBom } from '../src/bom/bomRisk';
import { SExpressionParser } from '../src/language/sExpressionParser';
import { createLargeSchematic, readFixture } from './fixtures';

const largeBoardSchematic = readFixture('large-board', 'large-board.kicad_sch');
const generatedSchematic = createLargeSchematic(1000);

describe('BomParser.parse', () => {
  bench('fixture: large-board schematic (grouped)', () => {
    new BomParser(new SExpressionParser()).parse(largeBoardSchematic, true);
  });

  bench('generated: 1000 symbols (grouped)', () => {
    new BomParser(new SExpressionParser()).parse(generatedSchematic, true);
  });

  bench('generated: 1000 symbols (ungrouped)', () => {
    new BomParser(new SExpressionParser()).parse(generatedSchematic, false);
  });
});

describe('scoreBom', () => {
  const entries = new BomParser(new SExpressionParser()).parse(
    generatedSchematic,
    false
  );

  bench('offline risk scoring of 1000 BOM entries', () => {
    scoreBom(entries);
  });
});
