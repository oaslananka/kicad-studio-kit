import type { DetectedKiCadCli } from '../types';
import { COMPATIBILITY_MATRIX } from '../mcp/compatibilityMatrix';
import type { KiCadCliCapabilitySnapshot } from './kicadCliDetector';

export type KiCadSupportState =
  | 'primary'
  | 'supported'
  | 'deprecated'
  | 'unsupported'
  | 'preview'
  | 'unknown';

export type KiCadFeatureState = 'available' | 'unsupported' | 'unknown';

export interface KiCadSupportLine {
  state: KiCadSupportState;
  label: string;
  detail: string;
}

export interface KiCadFeatureSupport {
  id:
    | 'core-validation'
    | 'manufacturing-exports'
    | 'jobsets'
    | 'variants'
    | 'odb-export'
    | 'three-d-pdf-export'
    | 'allegro-pcb-import'
    | 'step-export'
    | 'three-d-exports'
    | 'stats-export'
    | 'pcb-import'
    | 'fp-import'
    | 'sym-import'
    | 'upgrade';
  label: string;
  state: KiCadFeatureState;
  summary: string;
  reason: string;
}

const KI_CAD_PRIMARY_RANGE = COMPATIBILITY_MATRIX.kicad.primary;

export function parseKiCadMajor(
  cli: Pick<DetectedKiCadCli, 'version'> | undefined
): number | undefined {
  if (!cli) {
    return undefined;
  }
  const match = cli.version.match(/^(\d+)/);
  if (!match) {
    return undefined;
  }
  const major = Number.parseInt(match[1]!, 10);
  return Number.isFinite(major) ? major : undefined;
}

export function describeKiCadSupportLine(
  cli: Pick<DetectedKiCadCli, 'version' | 'versionLabel'> | undefined
): KiCadSupportLine {
  const major = parseKiCadMajor(cli);
  if (!cli) {
    return {
      state: 'unknown',
      label: 'KiCad CLI not detected',
      detail: 'Install KiCad or configure kicadstudio.kicadCliPath.'
    };
  }
  if (typeof major === 'undefined') {
    return {
      state: 'unknown',
      label: `${cli.versionLabel} unknown`,
      detail:
        'Detected kicad-cli did not report a parseable KiCad major version.'
    };
  }
  if (major === 10) {
    return {
      state: 'primary',
      label: `${cli.versionLabel} primary`,
      detail: `Primary release-blocking KiCad line: ${KI_CAD_PRIMARY_RANGE}.`
    };
  }
  if (major >= 11) {
    return {
      state: 'preview',
      label: `${cli.versionLabel} preview`,
      detail:
        'KiCad 11 is in preview status; not verified as a primary baseline. Use KiCad 10.0.x for release workflows.'
    };
  }
  if (major === 9) {
    return {
      state: 'deprecated',
      label: `${cli.versionLabel} deprecated`,
      detail:
        'Deprecated KiCad line; upstream active maintenance ended after KiCad 10.0.0.'
    };
  }
  if (major === 8) {
    return {
      state: 'deprecated',
      label: `${cli.versionLabel} deprecated`,
      detail:
        'Deprecated compatibility line; file-level read and migration support only.'
    };
  }
  return {
    state: 'unsupported',
    label: `${cli.versionLabel} unsupported`,
    detail: 'KiCad Studio supports KiCad 8.x, 9.x, and 10.0.x only.'
  };
}

export function buildKiCadFeatureSupport(options: {
  cli?: DetectedKiCadCli | undefined;
  capabilities?: KiCadCliCapabilitySnapshot | undefined;
}): KiCadFeatureSupport[] {
  const major = parseKiCadMajor(options.cli);
  const capabilities = options.capabilities;

  return [
    feature({
      id: 'core-validation',
      label: 'DRC, ERC, BOM, netlist, Gerbers',
      major,
      minimumMajor: 8,
      capabilityKeys: ['drc', 'erc', 'bom', 'netlist', 'gerbers'],
      capabilities,
      supportedReason:
        'Core validation and standard fabrication commands are supported for KiCad 8, 9, and 10 when the CLI help probes pass.',
      unsupportedReason:
        'Core validation requires a detected KiCad 8+ kicad-cli with DRC, ERC, BOM, netlist, and Gerber commands.'
    }),
    feature({
      id: 'manufacturing-exports',
      label: 'Manufacturing package exports',
      major,
      minimumMajor: 9,
      capabilityKeys: ['drill', 'gerbers'],
      capabilities,
      supportedReason:
        'Manufacturing export workflows are supported for KiCad 9 and 10 after drill and Gerber command probes pass.',
      unsupportedReason:
        'Manufacturing package exports require KiCad 9+ plus drill and Gerber CLI command support.'
    }),
    feature({
      id: 'jobsets',
      label: 'Jobset runner',
      major,
      minimumMajor: 9,
      capabilityKeys: ['jobset'],
      capabilities,
      supportedReason:
        'Jobset execution is available for KiCad 9 and 10 when `kicad-cli jobset run --help` succeeds.',
      unsupportedReason:
        'Jobsets require KiCad 9+ and a kicad-cli build that exposes `jobset run`.'
    }),
    feature({
      id: 'variants',
      label: 'Design variants',
      major,
      minimumMajor: 10,
      capabilityKeys: ['variantOption'],
      capabilities,
      supportedReason:
        'Variant-aware exports are enabled for KiCad 10 when command help exposes `--variant`.',
      unsupportedReason:
        'Design variant export switching requires KiCad 10+ and `--variant` support in CLI export help.'
    }),
    feature({
      id: 'odb-export',
      label: 'ODB++ export',
      major,
      minimumMajor: 9,
      capabilityKeys: ['odb'],
      capabilities,
      supportedReason:
        'ODB++ export is available for KiCad 9 and 10 when the `pcb export odb` command probe passes.',
      unsupportedReason:
        'ODB++ export requires KiCad 9+ and a kicad-cli build that exposes `pcb export odb`.'
    }),
    feature({
      id: 'three-d-pdf-export',
      label: '3D PDF export',
      major,
      minimumMajor: 10,
      capabilityKeys: ['pdf3d'],
      capabilities,
      supportedReason:
        '3D PDF export is enabled for KiCad 10 when the `pcb export 3dpdf` command probe passes.',
      unsupportedReason:
        '3D PDF export requires KiCad 10+ and a kicad-cli build that exposes `pcb export 3dpdf`.'
    }),
    feature({
      id: 'allegro-pcb-import',
      label: 'Allegro PCB import',
      major,
      minimumMajor: 10,
      capabilityKeys: ['allegroImport'],
      capabilities,
      supportedReason:
        'Allegro import is enabled when `kicad-cli pcb import --help` advertises the Allegro format.',
      unsupportedReason:
        'Allegro import is available in the KiCad PCB Editor, but the extension command requires a KiCad 10+ CLI build that exposes `pcb import --format allegro`.'
    }),
    feature({
      id: 'step-export',
      label: 'STEP 3D export',
      major,
      minimumMajor: 10,
      capabilityKeys: ['step'],
      capabilities,
      supportedReason:
        'STEP 3D export is available for KiCad 10 when the `pcb export step` command probe passes.',
      unsupportedReason:
        'STEP 3D export requires KiCad 10+ and a kicad-cli build that exposes `pcb export step`.'
    }),
    feature({
      id: 'three-d-exports',
      label:
        '3D model exports (GLB, STEP, STL, VRML, STEPZ, XAO, U3D, BREP, PLY)',
      major,
      minimumMajor: 10,
      capabilityKeys: [
        'glb',
        'step',
        'stl',
        'vrml',
        'stepz',
        'xao',
        'u3d',
        'brep',
        'ply'
      ],
      capabilities,
      supportedReason:
        '3D model exports are available for KiCad 10 when the corresponding `pcb export` command probes pass.',
      unsupportedReason:
        '3D model exports require KiCad 10+ with kicad-cli support for the specific 3D format.'
    }),
    feature({
      id: 'stats-export',
      label: 'Board statistics export',
      major,
      minimumMajor: 10,
      capabilityKeys: ['stats'],
      capabilities,
      supportedReason:
        'Board statistics export is available for KiCad 10 when the `pcb export stats` command probe passes.',
      unsupportedReason:
        'Board statistics export requires KiCad 10+ and a kicad-cli build that exposes `pcb export stats`.'
    }),
    feature({
      id: 'pcb-import',
      label: 'PCB import (non-Allegro)',
      major,
      minimumMajor: 8,
      capabilityKeys: ['pcbImport'],
      capabilities,
      supportedReason:
        'PCB import is available when the `pcb import` command probe passes.',
      unsupportedReason:
        'PCB import requires a kicad-cli build that exposes `pcb import`.'
    }),
    feature({
      id: 'fp-import',
      label: 'Footprint import',
      major,
      minimumMajor: 10,
      capabilityKeys: ['fpImport'],
      capabilities,
      supportedReason:
        'Footprint import is available for KiCad 10 when the `fp import` command probe passes.',
      unsupportedReason:
        'Footprint import requires KiCad 10+ and a kicad-cli build that exposes `fp import`.'
    }),
    feature({
      id: 'sym-import',
      label: 'Symbol import',
      major,
      minimumMajor: 10,
      capabilityKeys: ['symImport'],
      capabilities,
      supportedReason:
        'Symbol import is available for KiCad 10 when the `sym import` command probe passes.',
      unsupportedReason:
        'Symbol import requires KiCad 10+ and a kicad-cli build that exposes `sym import`.'
    }),
    feature({
      id: 'upgrade',
      label: 'KiCad project/symbol upgrade',
      major,
      minimumMajor: 10,
      capabilityKeys: ['upgradeSch', 'upgradeFp'],
      capabilities,
      supportedReason:
        'Upgrade commands are available for KiCad 10 when `sch upgrade` and `fp upgrade` command probes pass.',
      unsupportedReason:
        'KiCad project upgrade requires KiCad 10+ and kicad-cli build that exposes `sch upgrade` and `fp upgrade`.'
    })
  ];
}

function feature(options: {
  id: KiCadFeatureSupport['id'];
  label: string;
  major: number | undefined;
  minimumMajor: number;
  capabilityKeys: Array<keyof KiCadCliCapabilitySnapshot>;
  capabilities: KiCadCliCapabilitySnapshot | undefined;
  supportedReason: string;
  unsupportedReason: string;
}): KiCadFeatureSupport {
  if (typeof options.major === 'undefined') {
    return {
      id: options.id,
      label: options.label,
      state: 'unknown',
      summary: 'unknown',
      reason: 'Run KiCad: Detect kicad-cli to evaluate this feature.'
    };
  }
  if (options.major < options.minimumMajor) {
    return {
      id: options.id,
      label: options.label,
      state: 'unsupported',
      summary: `requires KiCad ${options.minimumMajor}+`,
      reason: options.unsupportedReason
    };
  }

  const failedProbe = options.capabilityKeys.find(
    (key) => options.capabilities?.[key] === false
  );
  if (failedProbe) {
    return {
      id: options.id,
      label: options.label,
      state: 'unsupported',
      summary: `missing ${String(failedProbe)}`,
      reason: `${options.unsupportedReason} The ${String(failedProbe)} capability probe failed.`
    };
  }

  const pendingProbe = options.capabilityKeys.some(
    (key) => typeof options.capabilities?.[key] === 'undefined'
  );
  return {
    id: options.id,
    label: options.label,
    state: pendingProbe ? 'unknown' : 'available',
    summary: pendingProbe ? 'probe pending' : 'available',
    reason: pendingProbe
      ? `${options.supportedReason} This status menu has not run all probes yet.`
      : options.supportedReason
  };
}
