#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const packageRoot = path.join(repoRoot, "packages", "kicad-fixtures");
const fixturesRoot = path.join(packageRoot, "fixtures");
const expectedRoot = path.join(packageRoot, "expected");
const manifestPath = path.join(packageRoot, "manifest.json");
const legacyCorpusRoot = path.join(
  repoRoot,
  "apps",
  "vscode-extension",
  "test",
  "fixtures",
  "kicad",
);
const fixturesRootRelative = path
  .relative(repoRoot, fixturesRoot)
  .replaceAll(path.sep, "/");
const expectedRootRelative = path
  .relative(repoRoot, expectedRoot)
  .replaceAll(path.sep, "/");
const generatorPath = "scripts/generate-kicad-fixture-corpus.mjs";

const expectedFileNames = [
  "project-tree.snapshot.json",
  "diagnostics.snapshot.json",
  "status.snapshot.json",
  "erc-report.json",
  "drc-report.json",
  "bom.csv",
  "netlist.net",
  "board-stats.txt",
];

const fixtureIds = [
  "clean-led-kicad10",
  "stale-diagnostics-kicad10",
  "kicad-10-0-3-regressions",
  "erc-power-pin-error",
  "drc-courtyard-error",
  "unconnected-pcb",
  "missing-netlist",
  "empty-board",
  "empty-project-kicad10",
  "no-dru-file",
  "multi-sheet-schematic",
  "large-board",
  "malformed-sch",
  "malformed-pcb",
  "paths-with-spaces",
  "unicode-path-çöğü",
];

function component(reference, value, footprint, net = "GND") {
  return {
    reference,
    value,
    footprint,
    manufacturer: reference.startsWith("LED") ? "Kingbright" : "Yageo",
    mpn: reference.startsWith("LED") ? "APT1608" : `${value}-${reference}`,
    net,
  };
}

function largeBoardComponents() {
  return Array.from({ length: 36 }, (_, index) => {
    const ordinal = index + 1;
    const reference = ordinal % 5 === 0 ? `C${ordinal}` : `R${ordinal}`;
    const value = reference.startsWith("C") ? "100n" : `${ordinal}k`;
    const footprint = reference.startsWith("C")
      ? "Capacitor_SMD:C_0603_1608Metric"
      : "Resistor_SMD:R_0603_1608Metric";
    return component(
      reference,
      value,
      footprint,
      `NET_${String(ordinal).padStart(2, "0")}`,
    );
  });
}

const defaultComponents = [
  component("R1", "1k", "Resistor_SMD:R_0603_1608Metric", "LED_A"),
  component("LED1", "red", "LED_SMD:LED_0603_1608Metric", "LED_A"),
  component("C1", "100n", "Capacitor_SMD:C_0603_1608Metric", "GND"),
];

const fixtures = [
  {
    id: "clean-led-kicad10",
    fileBase: "clean-led-kicad10",
    expectedOutcome: "pass",
    tags: ["kicad10", "schematic", "pcb", "bom", "netlist"],
    hasSchematic: true,
    hasPcb: true,
    hasDru: true,
    components: defaultComponents,
  },
  {
    id: "stale-diagnostics-kicad10",
    fileBase: "stale-diagnostics-kicad10",
    expectedOutcome: "warn",
    tags: ["kicad10", "diagnostics", "stale-state"],
    hasSchematic: true,
    hasPcb: true,
    hasDru: true,
    components: defaultComponents,
    diagnostics: [
      {
        severity: "warning",
        source: "status",
        code: "STALE_DIAGNOSTICS",
        message: "Diagnostics are older than the active schematic hash.",
        stale: true,
      },
    ],
  },
  {
    id: "kicad-10-0-3-regressions",
    fileBase: "kicad-10-0-3-regressions",
    expectedOutcome: "warn",
    tags: [
      "kicad10",
      "kicad10.0.3",
      "regression",
      "cli",
      "drc",
      "erc",
      "pdf-property-popups",
      "pads-import",
      "allegro-capability",
      "custom-padstack",
    ],
    hasSchematic: true,
    hasPcb: true,
    hasDru: true,
    customPadstackNonCopper: true,
    components: [
      component(
        "U1",
        "PADS_EDGE",
        "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
        "PADS_NET",
      ),
      component(
        "TP1",
        "MASK_PADSTACK",
        "TestPoint:TestPoint_Pad_D1.0mm",
        "MASK_PROBE",
      ),
    ],
    diagnostics: [
      {
        severity: "warning",
        source: "drc",
        code: "DRC_STATUS_OUTPUT_SHAPE",
        message:
          "KiCad 10.0.3 DRC status and elapsed-time output remains parseable from JSON reports.",
      },
      {
        severity: "warning",
        source: "erc",
        code: "ERC_SHEET_OUTPUT_SHAPE",
        message: "KiCad 10.0.3 ERC sheet-level report shape remains parseable.",
      },
      {
        severity: "info",
        source: "importer",
        code: "PADS_EDGE_CASE_FIXTURE",
        message:
          "PADS segment-intersection regression fixture is present for importer probes.",
      },
      {
        severity: "info",
        source: "importer",
        code: "ALLEGRO_CAPABILITY_PROBE",
        message:
          "Allegro PCB importer capability is probed and recorded even when full import support is unavailable.",
      },
    ],
    drcReportMetadata: {
      kicadVersion: "10.0.3",
      statusText: "DRC completed; elapsed=00:00:00.42",
      elapsedSeconds: 0.42,
      regression: "drc_elapsed_or_status_output_parsing",
    },
    ercSheets: [
      {
        path: "/",
        violations: [
          {
            severity: "warning",
            type: "sheet_output_shape",
            description:
              "KiCad 10.0.3 ERC sheet-level report shape remains parseable.",
          },
        ],
      },
    ],
    extraFiles: [
      {
        path: "importers/pads-zone-intersection.asc",
        role: "pads-import-fixture",
        content: [
          "!PADS-POWERPCB-V2007.0-ASCII!",
          "*PCB* GENERAL PARAMETERS OF THE PCB DESIGN",
          "UNITS MM",
          "*SIGNAL* ITEMS",
          "*LINES*",
          "PADS_NET 0.250 0.000 0.000 12.000 0.000",
          "PADS_NET 0.250 6.000 -6.000 6.000 6.000",
          "*END*",
          "",
        ].join("\n"),
      },
      {
        path: "importers/allegro-capability-probe.json",
        role: "allegro-capability-probe",
        content: stableJson({
          format: "allegro",
          status: "capability-probe-only",
          reason:
            "KiCad 10.0.3 PCB Editor documentation lists Cadence Allegro import, but CLI documentation does not list Allegro as a pcb import format.",
          command: ["kicad-cli", "pcb", "import", "--help"],
        }),
      },
    ],
    regressionCoverage: {
      kicadVersion: "10.0.3",
      source: "https://www.kicad.org/blog/2026/05/KiCad-10.0.3-Release/",
      cli: [
        "drc_elapsed_or_status_output_parsing",
        "erc_output_shape_stability",
        "pcb_export_pdf_property_popup_suppression_probe",
      ],
      importers: [
        "pads_import_edge_case_fixture",
        "allegro_import_capability_probe",
      ],
      pcb: ["custom_padstack_non_copper_layer_fixture"],
    },
  },
  {
    id: "erc-power-pin-error",
    fileBase: "erc-power-pin-error",
    expectedOutcome: "fail",
    tags: ["erc", "schematic", "power-pin"],
    hasSchematic: true,
    hasPcb: false,
    hasDru: false,
    components: [
      component("U1", "MCU", "Package_QFP:TQFP-32_7x7mm_P0.8mm", "VCC"),
      component(
        "J1",
        "POWER_IN",
        "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm",
        "VCC",
      ),
    ],
    diagnostics: [
      {
        severity: "error",
        source: "erc",
        code: "ERC_POWER_PIN",
        message: "Power input pin VCC is not driven by a power output symbol.",
      },
    ],
  },
  {
    id: "drc-courtyard-error",
    fileBase: "drc-courtyard-error",
    expectedOutcome: "fail",
    tags: ["drc", "pcb", "courtyard"],
    hasSchematic: false,
    hasPcb: true,
    hasDru: true,
    components: [
      component(
        "U1",
        "QFN",
        "Package_DFN_QFN:QFN-16-1EP_3x3mm_P0.5mm_EP1.8x1.8mm",
        "GND",
      ),
      component(
        "U2",
        "QFN",
        "Package_DFN_QFN:QFN-16-1EP_3x3mm_P0.5mm_EP1.8x1.8mm",
        "GND",
      ),
    ],
    diagnostics: [
      {
        severity: "error",
        source: "drc",
        code: "DRC_COURTYARD",
        message: "Footprint courtyards overlap between U1 and U2.",
      },
    ],
  },
  {
    id: "unconnected-pcb",
    fileBase: "unconnected-pcb",
    expectedOutcome: "warn",
    tags: ["pcb", "ratsnest", "netlist"],
    hasSchematic: true,
    hasPcb: true,
    hasDru: false,
    components: defaultComponents,
    diagnostics: [
      {
        severity: "warning",
        source: "pcb",
        code: "PCB_UNCONNECTED",
        message: "Net LED_A has an unrouted connection between R1 and LED1.",
      },
    ],
  },
  {
    id: "missing-netlist",
    fileBase: "missing-netlist",
    expectedOutcome: "warn",
    tags: ["schematic", "pcb", "netlist"],
    hasSchematic: true,
    hasPcb: true,
    hasDru: false,
    components: defaultComponents,
    netlistState: "missing",
    diagnostics: [
      {
        severity: "warning",
        source: "netlist",
        code: "NETLIST_MISSING",
        message: "No generated netlist is available for the active schematic.",
      },
    ],
  },
  {
    id: "empty-board",
    fileBase: "empty-board",
    expectedOutcome: "warn",
    tags: ["pcb", "empty-state"],
    hasSchematic: false,
    hasPcb: true,
    hasDru: false,
    components: [],
    diagnostics: [
      {
        severity: "warning",
        source: "pcb",
        code: "BOARD_EMPTY",
        message: "Board has no footprints and no routed copper.",
      },
    ],
  },
  {
    id: "empty-project-kicad10",
    fileBase: "empty-project-kicad10",
    expectedOutcome: "warn",
    tags: ["kicad10", "pcb", "schematic", "empty-state"],
    hasSchematic: true,
    hasPcb: true,
    hasDru: false,
    emptySchematic: true,
    fileFormatVersion: "20250316",
    components: [],
    diagnostics: [
      {
        severity: "warning",
        source: "schematic",
        code: "SCH_EMPTY",
        message: "Schematic has no symbols, wires, or named nets.",
      },
      {
        severity: "warning",
        source: "pcb",
        code: "BOARD_EMPTY",
        message: "Board has no footprints, nets, or routed copper.",
      },
    ],
  },
  {
    id: "no-dru-file",
    fileBase: "no-dru-file",
    expectedOutcome: "pass",
    tags: ["pcb", "drc", "missing-dru"],
    hasSchematic: true,
    hasPcb: true,
    hasDru: false,
    components: defaultComponents,
  },
  {
    id: "multi-sheet-schematic",
    fileBase: "multi-sheet-schematic",
    expectedOutcome: "pass",
    tags: ["schematic", "hierarchy", "bom"],
    hasSchematic: true,
    hasPcb: true,
    hasDru: false,
    extraSchematicFiles: ["power.kicad_sch"],
    components: [
      ...defaultComponents,
      component("U2", "LDO", "Package_TO_SOT_SMD:SOT-23-5", "VCC_3V3"),
      component("C2", "10u", "Capacitor_SMD:C_0805_2012Metric", "VCC_3V3"),
    ],
  },
  {
    id: "large-board",
    fileBase: "large-board",
    expectedOutcome: "pass",
    tags: ["pcb", "large-board", "performance"],
    hasSchematic: true,
    hasPcb: true,
    hasDru: true,
    components: largeBoardComponents(),
  },
  {
    id: "malformed-sch",
    fileBase: "malformed-sch",
    expectedOutcome: "fail",
    tags: ["schematic", "malformed"],
    hasSchematic: true,
    hasPcb: false,
    hasDru: false,
    malformedSchematic: true,
    components: [],
    diagnostics: [
      {
        severity: "error",
        source: "schematic",
        code: "SCH_PARSE",
        message: "Schematic S-expression is truncated before the closing form.",
      },
    ],
  },
  {
    id: "malformed-pcb",
    fileBase: "malformed-pcb",
    expectedOutcome: "fail",
    tags: ["pcb", "malformed"],
    hasSchematic: false,
    hasPcb: true,
    hasDru: false,
    malformedPcb: true,
    components: [],
    diagnostics: [
      {
        severity: "error",
        source: "pcb",
        code: "PCB_PARSE",
        message: "PCB S-expression is truncated before the board body closes.",
      },
    ],
  },
  {
    id: "paths-with-spaces",
    fileBase: "path case",
    expectedOutcome: "pass",
    tags: ["path-spaces", "windows-paths"],
    hasSchematic: true,
    hasPcb: true,
    hasDru: true,
    components: defaultComponents,
  },
  {
    id: "unicode-path-çöğü",
    fileBase: "unicode-çöğü",
    expectedOutcome: "pass",
    tags: ["unicode-path", "windows-paths"],
    hasSchematic: true,
    hasPcb: true,
    hasDru: true,
    components: defaultComponents,
  },
];

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function fixturePath(fixture, ...segments) {
  return path.join(fixturesRoot, fixture.id, ...segments);
}

function expectedPath(fixture, ...segments) {
  return path.join(expectedRoot, fixture.id, ...segments);
}

function projectFileName(fixture) {
  return `${fixture.fileBase}.kicad_pro`;
}

function schematicFileName(fixture) {
  return `${fixture.fileBase}.kicad_sch`;
}

function pcbFileName(fixture) {
  return `${fixture.fileBase}.kicad_pcb`;
}

function druFileName(fixture) {
  return `${fixture.fileBase}.kicad_dru`;
}

function fileFormatVersion(fixture) {
  return fixture.fileFormatVersion ?? "20240101";
}

function fixtureRelativePath(...segments) {
  return [fixturesRootRelative, ...segments].join("/");
}

function expectedRelativePath(...segments) {
  return [expectedRootRelative, ...segments].join("/");
}

function symbolBlock(item, index) {
  const uuid = `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`;
  return [
    `  (symbol`,
    `    (lib_id "Fixture:${item.reference}")`,
    `    (at ${10 + index * 5} ${10 + (index % 4) * 4} 0)`,
    `    (property "Reference" "${item.reference}")`,
    `    (property "Value" "${item.value}")`,
    `    (property "Footprint" "${item.footprint}")`,
    `    (property "Manufacturer" "${item.manufacturer}")`,
    `    (property "MPN" "${item.mpn}")`,
    `    (property "Net" "${item.net}")`,
    `    (uuid "${uuid}")`,
    `  )`,
  ].join("\n");
}

function schematicContent(fixture, fileName) {
  if (fixture.malformedSchematic) {
    return `(kicad_sch\n  (version 20240101)\n  (generator "KiCad Studio Fixture Corpus")\n  (symbol\n`;
  }

  if (fixture.emptySchematic) {
    return [
      `(kicad_sch`,
      `  (version ${fileFormatVersion(fixture)})`,
      `  (generator "KiCad Studio Fixture Corpus")`,
      `  (uuid "00000000-0000-0000-0000-000000000228")`,
      `  (paper "A4")`,
      `  (title_block (title "${fixture.id}"))`,
      `  (lib_symbols)`,
      `  (sheet_instances`,
      `    (path "/" (page "1"))`,
      `  )`,
      `  (embedded_fonts no)`,
      `)`,
      ``,
    ].join("\n");
  }

  const isChildSheet = fileName === "power.kicad_sch";
  const components = isChildSheet
    ? fixture.components.filter((item) => ["U2", "C2"].includes(item.reference))
    : fixture.components;
  const sheetBlock = fixture.extraSchematicFiles?.length
    ? `  (sheet\n    (at 80 30)\n    (size 30 20)\n    (property "Sheetname" "power")\n    (property "Sheetfile" "power.kicad_sch")\n  )\n`
    : "";
  const title = isChildSheet ? "Power Sheet" : fixture.id;

  const lines = [
    `(kicad_sch`,
    `  (version ${fileFormatVersion(fixture)})`,
    `  (generator "KiCad Studio Fixture Corpus")`,
    `  (paper "A4")`,
    `  (title_block (title "${title}"))`,
    sheetBlock.trimEnd(),
    components.map(symbolBlock).join("\n"),
    `  (global_label "GND")`,
    `  (label "LED_A")`,
    `)`,
    ``,
  ].filter((line) => line !== "");

  return `${lines.join("\n")}\n`;
}

function footprintBlock(item, index) {
  const x = 10 + (index % 12) * 5;
  const y = 10 + Math.floor(index / 12) * 5;
  const netIndex = index + 1;
  return [
    `  (footprint "${item.footprint}"`,
    `    (layer "F.Cu")`,
    `    (at ${x} ${y} 0)`,
    `    (property "Reference" "${item.reference}")`,
    `    (property "Value" "${item.value}")`,
    `    (pad "1" smd rect (at -0.5 0) (size 0.5 0.6) (layers "F.Cu" "F.Mask") (net ${netIndex} "${item.net}"))`,
    `    (pad "2" smd rect (at 0.5 0) (size 0.5 0.6) (layers "F.Cu" "F.Mask") (net 0 ""))`,
    `  )`,
  ].join("\n");
}

function customPadstackBlock() {
  return [
    `  (footprint "Fixture:CustomPadstackMask"`,
    `    (layer "F.Cu")`,
    `    (at 40 20 0)`,
    `    (property "Reference" "TP1")`,
    `    (property "Value" "MASK_PADSTACK")`,
    `    (pad "1" smd custom (at 0 0) (size 1 1) (layers "F.Mask")`,
    `      (options (clearance outline) (anchor rect))`,
    `      (primitives`,
    `        (gr_poly`,
    `          (pts (xy -0.5 -0.5) (xy 0.5 -0.5) (xy 0.5 0.5) (xy -0.5 0.5))`,
    `          (width 0)`,
    `          (fill yes)`,
    `        )`,
    `      )`,
    `    )`,
    `  )`,
  ].join("\n");
}

function pcbContent(fixture) {
  if (fixture.malformedPcb) {
    return `(kicad_pcb\n  (version 20240101)\n  (generator "KiCad Studio Fixture Corpus")\n  (layers\n`;
  }

  const components = fixture.components;
  const nets = components.map(
    (item, index) => `  (net ${index + 1} "${item.net}")`,
  );
  const footprints = components.map(footprintBlock);
  const segments = components.map((item, index) => {
    const x = 10 + (index % 12) * 5;
    const y = 10 + Math.floor(index / 12) * 5;
    return `  (segment (start ${x} ${y}) (end ${x + 2} ${y}) (width 0.20) (layer "F.Cu") (net ${index + 1}))`;
  });

  return [
    `(kicad_pcb`,
    `  (version ${fileFormatVersion(fixture)})`,
    `  (generator "KiCad Studio Fixture Corpus")`,
    `  (general)`,
    ...(fixture.emptySchematic ? [`  (paper "A4")`] : []),
    `  (layers`,
    `    (0 "F.Cu" signal)`,
    `    (31 "B.Cu" signal)`,
    `    (44 "Edge.Cuts" user)`,
    `  )`,
    ...nets,
    ...footprints,
    ...(fixture.customPadstackNonCopper ? [customPadstackBlock()] : []),
    ...segments,
    `  (gr_rect (start 0 0) (end 100 60) (stroke (width 0.10) (type solid)) (fill none) (layer "Edge.Cuts"))`,
    `)`,
    ``,
  ].join("\n");
}

function druContent(fixture) {
  return [
    `(version 1)`,
    `(rule "${fixture.id}_minimum_clearance"`,
    `  (constraint clearance (min 0.20mm))`,
    `  (condition "A.Type == 'Pad' || B.Type == 'Pad'")`,
    `)`,
    `(rule "${fixture.id}_courtyard"`,
    `  (constraint courtyard_clearance (min 0.25mm))`,
    `  (condition "A.Footprint != '' && B.Footprint != ''")`,
    `)`,
    ``,
  ].join("\n");
}

function projectContent(fixture) {
  const project = {
    meta: {
      filename: fixture.fileBase,
      version: 1,
      fixtureId: fixture.id,
      generatedBy: generatorPath,
    },
    fixture: {
      id: fixture.id,
      expectedOutcome: fixture.expectedOutcome,
      tags: fixture.tags,
    },
  };

  if (fixture.hasSchematic) {
    project.schematic = { file: schematicFileName(fixture) };
  }
  if (fixture.extraSchematicFiles?.length) {
    project.sheets = fixture.extraSchematicFiles.map((file) => ({ file }));
  }
  if (fixture.hasPcb) {
    project.board = { file: pcbFileName(fixture) };
  }
  if (fixture.hasDru) {
    project.designRules = { file: druFileName(fixture) };
  }
  if (fixture.regressionCoverage) {
    project.regressionCoverage = fixture.regressionCoverage;
  }

  return stableJson(project);
}

function diagnosticEntries(fixture) {
  return (fixture.diagnostics ?? []).map((diagnostic, index) => ({
    id: `${fixture.id}-${diagnostic.code.toLowerCase()}`,
    fixture: fixture.id,
    sequence: index + 1,
    severity: diagnostic.severity,
    source: diagnostic.source,
    code: diagnostic.code,
    message: diagnostic.message,
    stale: Boolean(diagnostic.stale),
    file: diagnosticFileForSource(fixture, diagnostic.source),
  }));
}

function diagnosticFileForSource(fixture, source) {
  if (["erc", "schematic"].includes(source) && fixture.hasSchematic) {
    return schematicFileName(fixture);
  }
  if (["drc", "pcb"].includes(source) && fixture.hasPcb) {
    return pcbFileName(fixture);
  }
  return projectFileName(fixture);
}

function projectTreeSnapshot(fixture) {
  const files = [
    {
      role: "project",
      path: projectFileName(fixture),
      exists: true,
    },
  ];

  if (fixture.hasSchematic) {
    files.push({
      role: "schematic",
      path: schematicFileName(fixture),
      exists: true,
    });
  }

  for (const file of fixture.extraSchematicFiles ?? []) {
    files.push({
      role: "schematic-sheet",
      path: file,
      exists: true,
    });
  }

  if (fixture.hasPcb) {
    files.push({
      role: "board",
      path: pcbFileName(fixture),
      exists: true,
    });
  }

  files.push({
    role: "dru",
    path: fixture.hasDru ? druFileName(fixture) : null,
    exists: Boolean(fixture.hasDru),
  });

  for (const file of fixture.extraFiles ?? []) {
    files.push({
      role: file.role,
      path: file.path,
      exists: true,
    });
  }

  return {
    fixture: fixture.id,
    semanticName: fixture.id,
    root: fixtureRelativePath(fixture.id),
    generatedBy: generatorPath,
    files,
  };
}

function statusSnapshot(fixture) {
  const diagnostics = diagnosticEntries(fixture);
  const errorCount = diagnostics.filter(
    (item) => item.severity === "error",
  ).length;
  const warningCount = diagnostics.filter(
    (item) => item.severity === "warning",
  ).length;
  const infoCount = diagnostics.filter(
    (item) => item.severity === "info",
  ).length;

  return {
    fixture: fixture.id,
    expectedOutcome: fixture.expectedOutcome,
    projectState: errorCount > 0 ? "blocked" : "ready",
    diagnostics: {
      errors: errorCount,
      warnings: warningCount,
      infos: infoCount,
      stale: diagnostics.some((item) => item.stale),
    },
    schematic: {
      state: fixture.hasSchematic
        ? fixture.malformedSchematic
          ? "parse-error"
          : "available"
        : "absent",
    },
    board: {
      state: fixture.hasPcb
        ? fixture.malformedPcb
          ? "parse-error"
          : "available"
        : "absent",
      footprints: fixture.components.length,
    },
    netlist: {
      state:
        fixture.netlistState === "missing"
          ? "missing"
          : fixture.hasSchematic
            ? "available"
            : "not-applicable",
    },
    designRules: {
      state: fixture.hasDru ? "available" : "absent",
    },
    pathFeatures: {
      containsSpaces: projectFileName(fixture).includes(" "),
      containsNonAscii:
        /[^\x00-\x7F]/.test(fixture.id) ||
        /[^\x00-\x7F]/.test(fixture.fileBase),
    },
  };
}

function reportFor(fixture, source) {
  const diagnostics = diagnosticEntries(fixture).filter(
    (item) => item.source === source,
  );
  const report = {
    fixture: fixture.id,
    formatVersion: 1,
    generatedBy: generatorPath,
    source,
    status: diagnostics.some((item) => item.severity === "error")
      ? "fail"
      : "pass",
    violations: diagnostics.map((item) => ({
      code: item.code,
      severity: item.severity,
      message: item.message,
      file: item.file,
    })),
  };
  if (source === "drc" && fixture.drcReportMetadata) {
    report.metadata = fixture.drcReportMetadata;
  }
  if (source === "erc" && fixture.ercSheets) {
    report.sheets = fixture.ercSheets;
  }
  return report;
}

function escapeCsv(value) {
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function bomCsv(fixture) {
  const rows = [
    ["Reference", "Value", "Footprint", "Manufacturer", "MPN"],
    ...fixture.components.map((item) => [
      item.reference,
      item.value,
      item.footprint,
      item.manufacturer,
      item.mpn,
    ]),
  ];

  return `${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}\n`;
}

function netlistContent(fixture) {
  if (
    !fixture.hasSchematic ||
    fixture.netlistState === "missing" ||
    fixture.malformedSchematic
  ) {
    return `; ${fixture.id} has no golden electrical netlist.\n`;
  }

  const components = fixture.components
    .map(
      (item) => `    (comp (ref "${item.reference}") (value "${item.value}"))`,
    )
    .join("\n");
  const nets = fixture.components
    .map(
      (item, index) => `    (net (code "${index + 1}") (name "${item.net}"))`,
    )
    .join("\n");

  return [
    `(export (version "D")`,
    `  (design (source "${schematicFileName(fixture)}"))`,
    `  (components`,
    components,
    `  )`,
    `  (nets`,
    nets,
    `  )`,
    `)`,
    ``,
  ].join("\n");
}

function boardStats(fixture) {
  const boardState = fixture.hasPcb
    ? fixture.malformedPcb
      ? "parse-error"
      : "available"
    : "absent";
  return [
    `fixture=${fixture.id}`,
    `board=${boardState}`,
    `footprints=${fixture.hasPcb && !fixture.malformedPcb ? fixture.components.length : 0}`,
    `nets=${fixture.hasPcb && !fixture.malformedPcb ? fixture.components.length : 0}`,
    `segments=${fixture.hasPcb && !fixture.malformedPcb ? fixture.components.length : 0}`,
    `layers=${fixture.hasPcb && !fixture.malformedPcb ? "F.Cu,B.Cu,Edge.Cuts" : ""}`,
    ``,
  ].join("\n");
}

function filesForFixture(fixture) {
  const files = new Map();

  files.set(
    fixturePath(fixture, projectFileName(fixture)),
    projectContent(fixture),
  );

  if (fixture.hasSchematic) {
    files.set(
      fixturePath(fixture, schematicFileName(fixture)),
      schematicContent(fixture),
    );
  }

  for (const file of fixture.extraSchematicFiles ?? []) {
    files.set(fixturePath(fixture, file), schematicContent(fixture, file));
  }

  if (fixture.hasPcb) {
    files.set(fixturePath(fixture, pcbFileName(fixture)), pcbContent(fixture));
  }

  if (fixture.hasDru) {
    files.set(fixturePath(fixture, druFileName(fixture)), druContent(fixture));
  }

  for (const file of fixture.extraFiles ?? []) {
    files.set(fixturePath(fixture, file.path), file.content);
  }

  const expectedDir = expectedPath(fixture);
  files.set(
    path.join(expectedDir, "project-tree.snapshot.json"),
    stableJson(projectTreeSnapshot(fixture)),
  );
  files.set(
    path.join(expectedDir, "diagnostics.snapshot.json"),
    stableJson({
      fixture: fixture.id,
      generatedBy: generatorPath,
      diagnostics: diagnosticEntries(fixture),
    }),
  );
  files.set(
    path.join(expectedDir, "status.snapshot.json"),
    stableJson(statusSnapshot(fixture)),
  );
  files.set(
    path.join(expectedDir, "erc-report.json"),
    stableJson(reportFor(fixture, "erc")),
  );
  files.set(
    path.join(expectedDir, "drc-report.json"),
    stableJson(reportFor(fixture, "drc")),
  );
  files.set(path.join(expectedDir, "bom.csv"), bomCsv(fixture));
  files.set(path.join(expectedDir, "netlist.net"), netlistContent(fixture));
  files.set(path.join(expectedDir, "board-stats.txt"), boardStats(fixture));

  return files;
}

function corpusManifest() {
  return {
    schemaVersion: 1,
    generatedBy: generatorPath,
    linearIssue: "OASLANA-53",
    githubIssue: 54,
    root: fixturesRootRelative,
    expectedRoot: expectedRootRelative,
    fixtureCount: fixtures.length,
    expectedFiles: expectedFileNames,
    fixtures: fixtures.map((fixture) => ({
      id: fixture.id,
      semanticName: fixture.id,
      path: fixtureRelativePath(fixture.id),
      projectFile: projectFileName(fixture),
      schematicFiles: [
        ...(fixture.hasSchematic ? [schematicFileName(fixture)] : []),
        ...(fixture.extraSchematicFiles ?? []),
      ],
      boardFile: fixture.hasPcb ? pcbFileName(fixture) : null,
      designRulesFile: fixture.hasDru ? druFileName(fixture) : null,
      expectedPath: expectedRelativePath(fixture.id),
      expectedFiles: expectedFileNames,
      expectedOutcome: fixture.expectedOutcome,
      tags: fixture.tags,
      ...(fixture.regressionCoverage
        ? { regressionCoverage: fixture.regressionCoverage }
        : {}),
    })),
  };
}

function buildCorpusFiles() {
  const files = new Map();

  files.set(manifestPath, stableJson(corpusManifest()));

  for (const fixture of fixtures) {
    for (const [filePath, content] of filesForFixture(fixture)) {
      files.set(filePath, content);
    }
  }

  return files;
}

async function formatGeneratedFiles(files) {
  const prettier = await import("prettier");
  const formatted = new Map();

  for (const [filePath, content] of files) {
    const extension = path.extname(filePath);
    const parser =
      extension === ".json" ? "json" : extension === ".md" ? "markdown" : null;
    const config = parser
      ? ((await prettier.resolveConfig(filePath)) ?? {})
      : {};
    formatted.set(
      filePath,
      parser
        ? await prettier.format(content, {
            ...config,
            filepath: filePath,
            parser,
          })
        : content,
    );
  }

  return formatted;
}

function normalizeLineEndings(content) {
  return content.replace(/\r\n?/g, "\n");
}

function listActualFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listActualFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function writeCorpus(files) {
  fs.rmSync(fixturesRoot, { recursive: true, force: true });
  fs.rmSync(expectedRoot, { recursive: true, force: true });
  fs.rmSync(manifestPath, { force: true });
  fs.rmSync(legacyCorpusRoot, { recursive: true, force: true });
  for (const [filePath, content] of files) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
  }
  console.log(
    `Wrote ${files.size} files to ${path.relative(repoRoot, packageRoot)}`,
  );
}

function checkCorpus(files) {
  const expectedPaths = new Set([...files.keys()]);
  const actualPaths = new Set([
    ...listActualFiles(fixturesRoot),
    ...listActualFiles(expectedRoot),
    ...(fs.existsSync(manifestPath) ? [manifestPath] : []),
  ]);
  const errors = [];

  if (fs.existsSync(legacyCorpusRoot)) {
    errors.push(
      "Legacy product-private fixture corpus exists at apps/vscode-extension/test/fixtures/kicad; run `corepack pnpm run fixtures:kicad:generate` to move it into packages/kicad-fixtures.",
    );
  }

  for (const [filePath, expectedContent] of files) {
    if (!fs.existsSync(filePath)) {
      errors.push(
        `Missing generated file: ${path.relative(repoRoot, filePath)}`,
      );
      continue;
    }

    const actualContent = normalizeLineEndings(
      fs.readFileSync(filePath, "utf8"),
    );
    if (actualContent !== normalizeLineEndings(expectedContent)) {
      errors.push(
        `Generated file is stale: ${path.relative(repoRoot, filePath)}`,
      );
    }
  }

  for (const filePath of actualPaths) {
    if (!expectedPaths.has(filePath)) {
      errors.push(
        `Unexpected file in generated corpus: ${path.relative(repoRoot, filePath)}`,
      );
    }
  }

  if (fixtures.length !== fixtureIds.length) {
    errors.push(
      `Expected ${fixtureIds.length} fixtures, found ${fixtures.length}`,
    );
  }

  const missingFixtureIds = fixtureIds.filter(
    (id) => !fixtures.some((fixture) => fixture.id === id),
  );
  if (missingFixtureIds.length > 0) {
    errors.push(`Missing required fixtures: ${missingFixtureIds.join(", ")}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    console.error(
      "Run `corepack pnpm run fixtures:kicad:generate` to regenerate the KiCad fixture corpus.",
    );
    process.exit(1);
  }

  console.log(`KiCad fixture corpus is current: ${fixtureIds.length} fixtures`);
}

const mode = process.argv[2] ?? "--check";
const files = await formatGeneratedFiles(buildCorpusFiles());

if (mode === "--write") {
  writeCorpus(files);
} else if (mode === "--check") {
  checkCorpus(files);
} else {
  console.error(`Usage: node ${generatorPath} [--check|--write]`);
  process.exit(2);
}
