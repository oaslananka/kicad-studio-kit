import type { DetectedKiCadCli } from '../types';
import { COMPATIBILITY_MATRIX } from '../mcp/compatibilityMatrix';
import type { KiCadCliCapabilitySnapshot } from './kicadCliDetector';

export type KiCadSupportState =
  | 'primary'
  | 'supported'
  | 'deprecated'
  | 'unsupported'
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
    | 'three-d-pdf-export';
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
  if (major >= 10) {
    return {
      state: 'primary',
      label: `${cli.versionLabel} primary`,
      detail: `Primary release-blocking KiCad line: ${KI_CAD_PRIMARY_RANGE}.`
    };
  }
  if (major === 9) {
    return {
      state: 'supported',
      label: `${cli.versionLabel} supported`,
      detail:
        'Supported previous KiCad line; covered by scheduled compatibility checks.'
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
