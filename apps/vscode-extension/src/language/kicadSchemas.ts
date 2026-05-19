import type { SchemaNodeDefinition } from '../types';

const commonNodes: SchemaNodeDefinition[] = [
  { tag: 'at', description: 'Position of an item in X/Y coordinates.' },
  {
    tag: 'property',
    description: 'Named property attached to a symbol or object.'
  },
  {
    tag: 'uuid',
    description: 'Stable unique identifier used across KiCad files.'
  },
  { tag: 'effects', description: 'Text and style effects definition.' },
  { tag: 'stroke', description: 'Line stroke style information.' },
  { tag: 'fill', description: 'Fill style information.' },
  { tag: 'layer', description: 'Target drawing or copper layer.' }
];

export const SCHEMATIC_SCHEMA: SchemaNodeDefinition[] = [
  { tag: 'kicad_sch', description: 'Root node for KiCad schematic documents.' },
  { tag: 'version', description: 'Document version marker.' },
  { tag: 'generator', description: 'Tool that created the file.' },
  { tag: 'paper', description: 'Paper size configuration.' },
  {
    tag: 'symbol',
    description: 'Symbol instance placed on a schematic sheet.'
  },
  { tag: 'wire', description: 'Wire segment between two points.' },
  {
    tag: 'junction',
    description: 'Electrical junction joining multiple wires.'
  },
  { tag: 'label', description: 'Local net label.' },
  { tag: 'global_label', description: 'Global net label across sheets.' },
  {
    tag: 'hierarchical_label',
    description: 'Hierarchical label crossing sheet boundaries.'
  },
  { tag: 'sheet', description: 'Hierarchical sheet instance.' },
  {
    tag: 'sheet_instances',
    description: 'Expanded instances for hierarchical sheets.'
  },
  {
    tag: 'symbol_instances',
    description: 'Expanded instances for placed symbols.'
  },
  { tag: 'lib_id', description: 'Symbol library identifier.' },
  { tag: 'reference', description: 'Reference designator property.' },
  { tag: 'value', description: 'Component value property.' },
  { tag: 'footprint', description: 'Linked footprint identifier.' },
  ...commonNodes
];

export const PCB_SCHEMA: SchemaNodeDefinition[] = [
  { tag: 'kicad_pcb', description: 'Root node for KiCad PCB documents.' },
  { tag: 'general', description: 'General board configuration.' },
  { tag: 'setup', description: 'Board setup and design rules.' },
  { tag: 'layers', description: 'Layer table for the board.' },
  { tag: 'net', description: 'Electrical net definition.' },
  { tag: 'footprint', description: 'Footprint placed on the board.' },
  { tag: 'pad', description: 'Pad inside a footprint.' },
  { tag: 'segment', description: 'Copper track segment.' },
  { tag: 'via', description: 'Copper via between layers.' },
  { tag: 'zone', description: 'Copper pour or keepout zone.' },
  { tag: 'gr_line', description: 'Graphic line.' },
  { tag: 'gr_arc', description: 'Graphic arc.' },
  { tag: 'gr_circle', description: 'Graphic circle.' },
  { tag: 'gr_rect', description: 'Graphic rectangle.' },
  { tag: 'gr_poly', description: 'Graphic polygon.' },
  { tag: 'gr_curve', description: 'Graphic bezier curve.' },
  { tag: 'gr_text', description: 'Graphic text item.' },
  { tag: 'dimension', description: 'Mechanical dimension object.' },
  { tag: 'target', description: 'Alignment target.' },
  { tag: 'group', description: 'Group of related items.' },
  ...commonNodes
];

export const SYMBOL_SCHEMA: SchemaNodeDefinition[] = [
  {
    tag: 'kicad_symbol_lib',
    description: 'Root node for symbol library files.'
  },
  { tag: 'symbol', description: 'Symbol definition.' },
  { tag: 'pin', description: 'Pin definition inside a symbol.' },
  { tag: 'property', description: 'Symbol property definition.' },
  ...commonNodes
];

export const FOOTPRINT_SCHEMA: SchemaNodeDefinition[] = [
  { tag: 'footprint', description: 'Root node for footprint module files.' },
  { tag: 'pad', description: 'Pad definition.' },
  { tag: 'fp_line', description: 'Footprint line.' },
  { tag: 'fp_arc', description: 'Footprint arc.' },
  { tag: 'fp_circle', description: 'Footprint circle.' },
  { tag: 'fp_rect', description: 'Footprint rectangle.' },
  { tag: 'fp_text', description: 'Footprint text.' },
  ...commonNodes
];

export const PROJECT_SCHEMA: SchemaNodeDefinition[] = [
  { tag: 'meta', description: 'KiCad project metadata.' },
  { tag: 'board', description: 'PCB project configuration.' },
  { tag: 'schematic', description: 'Schematic project configuration.' },
  { tag: 'variants', description: 'KiCad 10 design variant definitions.' },
  { tag: 'activeVariant', description: 'Currently active design variant.' }
];

export const DRC_SCHEMA: SchemaNodeDefinition[] = [
  {
    tag: 'design_rules',
    description: 'Root node for KiCad custom DRC rule files.'
  },
  { tag: 'version', description: 'DRC rule file format version.' },
  { tag: 'rule', description: 'Named graphical design rule.' },
  {
    tag: 'condition',
    description: 'Boolean condition that determines when the rule applies.'
  },
  {
    tag: 'constraint',
    description: 'Constraint payload enforced by the rule.'
  },
  { tag: 'severity', description: 'Severity of the rule outcome.' },
  { tag: 'layer', description: 'Specific board layer targeted by the rule.' },
  // Constraint value qualifiers: (constraint clearance (min 0.2mm) (max 1mm) (opt 0.5mm))
  { tag: 'min', description: 'Minimum value for a constraint range.' },
  { tag: 'max', description: 'Maximum value for a constraint range.' },
  { tag: 'opt', description: 'Optimal (target) value for a constraint range.' },
  // Constraint type identifiers
  { tag: 'clearance', description: 'Electrical clearance constraint type.' },
  {
    tag: 'courtyard_clearance',
    description: 'Courtyard clearance constraint type.'
  },
  {
    tag: 'silk_clearance',
    description: 'Silkscreen clearance constraint type.'
  },
  {
    tag: 'edge_clearance',
    description: 'Board-edge clearance constraint type.'
  },
  {
    tag: 'hole_clearance',
    description: 'Hole-to-copper clearance constraint type.'
  },
  { tag: 'hole_to_hole', description: 'Hole-to-hole spacing constraint type.' },
  {
    tag: 'via_clearance',
    description: 'Via-to-copper clearance constraint type.'
  },
  { tag: 'track_width', description: 'Track width constraint type.' },
  { tag: 'annular_width', description: 'Annular ring width constraint type.' },
  { tag: 'via_diameter', description: 'Via diameter constraint type.' },
  { tag: 'via_hole', description: 'Via drill hole constraint type.' },
  { tag: 'hole_size', description: 'Drill hole size constraint type.' },
  { tag: 'length', description: 'Net length constraint type.' },
  { tag: 'skew', description: 'Differential-pair skew constraint type.' },
  {
    tag: 'diff_pair_gap',
    description: 'Differential-pair gap constraint type.'
  },
  {
    tag: 'diff_pair_uncoupled',
    description: 'Differential-pair uncoupled-length constraint type.'
  },
  { tag: 'impedance', description: 'Impedance constraint type.' },
  {
    tag: 'physical_clearance',
    description: 'Physical (non-electrical) clearance constraint type.'
  },
  {
    tag: 'physical_hole_clearance',
    description: 'Physical hole clearance constraint type.'
  },
  ...commonNodes
];

export const LANGUAGE_SCHEMAS: Record<string, SchemaNodeDefinition[]> = {
  'kicad-schematic': SCHEMATIC_SCHEMA,
  'kicad-pcb': PCB_SCHEMA,
  'kicad-symbol': SYMBOL_SCHEMA,
  'kicad-footprint': FOOTPRINT_SCHEMA,
  'kicad-project': PROJECT_SCHEMA,
  'kicad-drc': DRC_SCHEMA
};

export const KEYWORD_DESCRIPTIONS = Object.fromEntries(
  Object.entries(LANGUAGE_SCHEMAS).map(([language, items]) => [
    language,
    new Map(items.map((item) => [item.tag, item.description]))
  ])
);

export const LANGUAGE_COMPLETIONS = Object.fromEntries(
  Object.entries(LANGUAGE_SCHEMAS).map(([language, items]) => [
    language,
    items.map((item) => item.tag)
  ])
);
