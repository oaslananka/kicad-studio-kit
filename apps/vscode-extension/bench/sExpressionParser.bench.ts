import { bench, describe } from 'vitest';
import { SExpressionParser } from '../src/language/sExpressionParser';
import {
  createLargeNetlist,
  createLargePcb,
  createLargeSchematic,
  readFixture
} from './fixtures';

const smallSchematic = readFixture(
  'clean-led-kicad10',
  'clean-led-kicad10.kicad_sch'
);
const smallPcb = readFixture(
  'clean-led-kicad10',
  'clean-led-kicad10.kicad_pcb'
);
const largeBoardSchematic = readFixture('large-board', 'large-board.kicad_sch');
const largeBoardPcb = readFixture('large-board', 'large-board.kicad_pcb');
const generatedSchematic = createLargeSchematic(1000);
const generatedNetlist = createLargeNetlist(1000);
const generatedPcb = createLargePcb(2000, 200);

describe('SExpressionParser.parse', () => {
  bench('fixture: clean-led schematic', () => {
    new SExpressionParser().parse(smallSchematic);
  });

  bench('fixture: clean-led pcb', () => {
    new SExpressionParser().parse(smallPcb);
  });

  bench('fixture: large-board schematic', () => {
    new SExpressionParser().parse(largeBoardSchematic);
  });

  bench('fixture: large-board pcb', () => {
    new SExpressionParser().parse(largeBoardPcb);
  });

  bench('generated: 1000-symbol schematic', () => {
    new SExpressionParser().parse(generatedSchematic);
  });

  bench('generated: 1000-net netlist', () => {
    new SExpressionParser().parse(generatedNetlist);
  });

  bench('generated: 2000-segment pcb', () => {
    new SExpressionParser().parse(generatedPcb);
  });
});

describe('SExpressionParser queries', () => {
  const parser = new SExpressionParser();
  const netlistRoot = parser.parse(generatedNetlist);
  const pcbRoot = parser.parse(generatedPcb);

  bench('parse + findAllNodes(net) on 1000-net netlist', () => {
    const localParser = new SExpressionParser();
    const root = localParser.parse(generatedNetlist);
    localParser.findAllNodes(root, 'net');
  });

  bench('findAllNodes(segment) on parsed pcb', () => {
    parser.findAllNodes(pcbRoot, 'segment');
  });

  bench('findNode + getPosition on parsed netlist', () => {
    const nets =
      parser.findNode(netlistRoot, 'export', 'nets') ??
      parser.findNode(netlistRoot, 'nets');
    for (const child of nets?.children ?? []) {
      parser.getPosition(child);
    }
  });
});
