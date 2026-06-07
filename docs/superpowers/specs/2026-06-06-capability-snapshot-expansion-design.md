# Capability Snapshot Expansion Design

Date: 2026-06-06

## Summary

Expand the KiCad CLI capability snapshot to cover all meaningful CLI commands with
version-aware metadata, enabling richer feature status reporting in the status menu
and to external consumers.

## Motivation

The capability snapshot currently probes only 11 of 35 defined CLI commands. As new
export formats and import features are added, the snapshot lags behind, making the
status menu incomplete. Adding version-aware per-command metadata will let users and
external tools (e.g. MCP) see exactly which features are available, unsupported, or
version-gated.

## Architecture

```
constants.ts                    kicadCliDetector.ts              kicadCliSupport.ts
┌──────────────────────┐       ┌────────────────────────┐      ┌─────────────────────────┐
│ CLI_CAPABILITY       │       │ STATUS_MENU_            │      │ buildKiCadFeatureSupport │
│ _COMMANDS            │──uses→│ CAPABILITY_COMMANDS     │──uses→│ (7 existing + 7 new      │
│ (35 entries)         │       │ (~26 expanded)          │      │  feature entries)        │
│                      │       │                        │      │                         │
│ CLI_CAPABILITY       │──uses→│ KiCadCliCapability      │      │ viewerStatusMenu.ts      │
│ _METADATA            │       │ _Snapshot (enriched)    │─────→│ renders feature states   │
│ (new, 35 entries)    │       │                        │      │                         │
└──────────────────────┘       │ getCapabilitySnapshot() │      └─────────────────────────┘
                               │ probes all + merges    │
                               │ metadata               │
                               └────────────────────────┘
```

## Changes

### 1. `constants.ts` — New CLI_CAPABILITY_METADATA registry

```typescript
export type CapabilityCategory =
  | 'export-2d'
  | 'export-3d'
  | 'validation'
  | 'import'
  | 'manufacturing'
  | 'utility';

export interface CommandMetadata {
  minimumMajor: number;
  category: CapabilityCategory;
  description: string;
}

export const CLI_CAPABILITY_METADATA: {
  [K in keyof typeof CLI_CAPABILITY_COMMANDS]: CommandMetadata;
} = {
  // validation
  drc:    { minimumMajor: 8, category: 'validation',    description: 'PCB design rule check' },
  erc:    { minimumMajor: 8, category: 'validation',    description: 'Schematic electrical rule check' },
  // manufacturing
  gerbers:{ minimumMajor: 8, category: 'manufacturing', description: 'Gerber fabrication files' },
  drill:  { minimumMajor: 8, category: 'manufacturing', description: 'Drill files' },
  bom:    { minimumMajor: 8, category: 'manufacturing', description: 'Bill of materials' },
  netlist:{ minimumMajor: 8, category: 'manufacturing', description: 'Netlist export' },
  pos:    { minimumMajor: 8, category: 'manufacturing', description: 'Pick and place file' },
  ipc2581:{ minimumMajor: 9, category: 'manufacturing', description: 'IPC-2581 fabrication data' },
  odb:    { minimumMajor: 9, category: 'manufacturing', description: 'ODB++ fabrication data' },
  gencad: { minimumMajor: 8, category: 'manufacturing', description: 'GenCAD export' },
  ipcd356:{ minimumMajor: 8, category: 'manufacturing', description: 'IPC-D-356 netlist data' },
  // 2D schematic
  pdfSch: { minimumMajor: 8, category: 'export-2d',     description: 'Schematic PDF' },
  svgSch: { minimumMajor: 8, category: 'export-2d',     description: 'Schematic SVG' },
  psSch:  { minimumMajor: 8, category: 'export-2d',     description: 'Schematic PostScript' },
  // 2D PCB
  pdfPcb: { minimumMajor: 8, category: 'export-2d',     description: 'PCB PDF' },
  svgPcb: { minimumMajor: 8, category: 'export-2d',     description: 'PCB SVG' },
  psPcb:  { minimumMajor: 8, category: 'export-2d',     description: 'PCB PostScript' },
  dxf:    { minimumMajor: 8, category: 'export-2d',     description: 'DXF export' },
  fpSvg:  { minimumMajor: 8, category: 'export-2d',     description: 'Footprint SVG' },
  symSvg: { minimumMajor: 8, category: 'export-2d',     description: 'Symbol SVG' },
  // 3D
  step:   { minimumMajor: 8, category: 'export-3d',     description: 'STEP 3D model' },
  stpz:   { minimumMajor: 9, category: 'export-3d',     description: 'Compressed STEP 3D model' },
  glb:    { minimumMajor: 9, category: 'export-3d',     description: 'glTF binary 3D' },
  brep:   { minimumMajor: 9, category: 'export-3d',     description: 'B-Rep 3D model' },
  ply:    { minimumMajor: 9, category: 'export-3d',     description: 'PLY 3D mesh' },
  xao:    { minimumMajor: 9, category: 'export-3d',     description: 'XAO 3D model' },
  stl:    { minimumMajor: 9, category: 'export-3d',     description: 'STL 3D mesh' },
  u3d:    { minimumMajor: 9, category: 'export-3d',     description: 'U3D 3D model' },
  vrml:   { minimumMajor: 9, category: 'export-3d',     description: 'VRML 3D model' },
  pdf3d:  { minimumMajor: 10,category: 'export-3d',     description: '3D PDF' },
  // utility
  stats:  { minimumMajor: 8, category: 'utility',       description: 'PCB statistics' },
  jobset: { minimumMajor: 9, category: 'utility',       description: 'Jobset runner' },
  // import
  pcbImport:{minimumMajor:10,category: 'import',        description: 'PCB import formats' },
};
```

### 2. `kicadCliDetector.ts` — Expanded probe set & enriched snapshot

**STATUS_MENU_CAPABILITY_COMMANDS** expands from 11 to ~26 entries by adding:
- pdfSch, pdfPcb, svgSch, svgPcb, psSch, psPcb, dxf (2D exports)
- stpz, xao, stl, u3d, vrml, glb, brep, ply (3D formats)
- ipc2581, gencad, ipcd356, pos (manufacturing)
- fpSvg, symSvg (footprint/symbol)
- pcbImport

**KiCadCliCapabilitySnapshot** enriched with:
```typescript
commandMinVersion?: Partial<Record<KiCadCliCapabilityName, number>>;
commandVersionStatus?: Partial<Record<KiCadCliCapabilityName, string>>;
```

**getCapabilitySnapshot()** post-probe step merges metadata:
- For each probed command, looks up `CLI_CAPABILITY_METADATA[cmd]`
- Sets `commandMinVersion[cmd] = meta.minimumMajor`
- Computes `commandVersionStatus[cmd]` via `deriveVersionStatus(major, meta.minimumMajor)`

Derivation logic:
| Condition | Status |
|---|---|
| major < meta.minimumMajor | unsupported |
| major === 10 | primary |
| major >= 11 | preview |
| major >= 8 && !== 10 | deprecated |
| otherwise | unknown |

### 3. `kicadCliSupport.ts` — 7 new feature entries

| ID | Label | capabilityKeys | minimumMajor |
|---|---|---|---|
| `3d-exports` | 3D model exports | step, stpz, glb, brep, ply, xao, stl, u3d, vrml | 9 |
| `2d-schematic-exports` | Schematic 2D exports | pdfSch, svgSch, psSch | 8 |
| `2d-pcb-exports` | PCB 2D exports | pdfPcb, svgPcb, psPcb, dxf | 8 |
| `manufacturing-formats` | Advanced fabrication formats | ipc2581, gencad, ipcd356 | 9 |
| `pick-and-place` | Pick & place export | pos | 8 |
| `footprint-symbol-exports` | Footprint / symbol exports | fpSvg, symSvg | 8 |
| `pcb-import` | PCB import formats | pcbImport | 10 |

Each uses the existing `feature()` helper. A failed probe on any capabilityKey marks
the feature `'unsupported'`.

### 4. Test updates

- `kicadCliDetector.test.ts`:
  - Expand the `'builds a status-menu capability snapshot from CLI help probes'` test to
    verify new commands appear in the result and that `commandMinVersion` and
    `commandVersionStatus` fields exist with correct structure
  - Add a test for `deriveVersionStatus` logic (unit test for the derivation function)
- No new test files needed.

## Verification

All existing tests must continue to pass with expanded expectations:
- `check:boundaries`, `lint`, `typecheck`, `test`, `build`
- The status menu test must validate new commands and metadata fields

## Future Work

- If snapshot probe latency becomes noticeable (~1.3s), migrate from `spawnSync` to
  `spawn` for parallel probing
- Expose enriched snapshot via MCP `kicad_snapshot` tool for external clients
