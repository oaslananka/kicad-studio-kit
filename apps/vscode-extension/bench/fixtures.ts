import * as fs from 'node:fs';
import * as path from 'node:path';

const FIXTURE_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'packages',
  'kicad-fixtures',
  'fixtures'
);

export function readFixture(fixtureName: string, fileName: string): string {
  return fs.readFileSync(
    path.join(FIXTURE_ROOT, fixtureName, fileName),
    'utf8'
  );
}

export function createLargeSchematic(symbolCount: number): string {
  const symbols = Array.from({ length: symbolCount }, (_unused, index) => {
    const group = index % 10;
    return `(symbol (lib_id "Device:R") (at ${index} ${group} 0) (property "Reference" "R${index + 1}") (property "Value" "${group}k") (property "Footprint" "Resistor_SMD:R_0603_1608Metric") (property "MPN" "RC0603FR-07${group}KL") (property "Manufacturer" "Yageo") (uuid "00000000-0000-0000-0000-${String(index).padStart(12, '0')}"))`;
  }).join('\n');
  return `(kicad_sch (version 20250114) (generator "eeschema") ${symbols})`;
}

export function createLargeNetlist(netCount: number): string {
  const nets = Array.from({ length: netCount }, (_unused, index) => {
    return `(net (code "${index + 1}") (name "/N${index + 1}") (node (ref "R${index + 1}") (pin "1")) (node (ref "C${index + 1}") (pin "2")))`;
  }).join('\n');
  return `(export (version "E") (design (source "generated.kicad_sch")) (components) (nets ${nets}))`;
}

export function createLargePcb(segmentCount: number, viaCount = 0): string {
  const layers = ['F.Cu', 'B.Cu', 'In1.Cu', 'In2.Cu'];
  const footprints = Array.from(
    { length: Math.max(1, Math.floor(segmentCount / 10)) },
    (_unused, index) =>
      `(footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu") (at ${index} 0) (property "Reference" "R${index + 1}"))`
  ).join('\n');
  const segments = Array.from({ length: segmentCount }, (_unused, index) => {
    const layer = layers[index % layers.length];
    return `(segment (start ${index} 0) (end ${index + 1} 1) (width 0.25) (layer "${layer}") (net ${index % 50}) (uuid "seg-${index}"))`;
  }).join('\n');
  const vias = Array.from({ length: viaCount }, (_unused, index) => {
    return `(via (at ${index} ${index}) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net ${index % 50}))`;
  }).join('\n');
  return `(kicad_pcb (version 20250114) (generator "pcbnew") ${footprints}\n${segments}\n${vias})`;
}
