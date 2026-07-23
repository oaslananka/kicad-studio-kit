import type { CLI_CAPABILITY_COMMANDS } from '../constants';
import type { DetectedKiCadCli } from '../types';

export type KiCadCliCapabilityName = keyof typeof CLI_CAPABILITY_COMMANDS;

export type KiCadCliCapabilitySnapshot = Partial<
  Record<KiCadCliCapabilityName, boolean>
> & {
  variantOption?: boolean;
  allegroImport?: boolean;
  /** The detected KiCad version string. */
  version?: string;
  /** Support state label: primary | deprecated | preview | unknown */
  versionStatus?: string;
  /** Absolute path to the detected kicad-cli binary. */
  kicadCliPath?: string;
  /** How the CLI was discovered: settings | common-path | path */
  detectionSource?: string;
  /** ISO timestamp of the last successful probe. */
  lastProbeAt?: string;
  /** Non-functional upstream CLI surfaces that are documented but not usable. */
  nonFunctionalUpstream?: string[];
  /** Probe errors or warnings. */
  errors?: string[];
  /** Per-command minimum KiCad major version from the metadata registry. */
  commandMinVersion?: Partial<Record<KiCadCliCapabilityName, number>>;
  /** Per-command version eligibility for the detected KiCad version line. */
  commandVersionStatus?: Partial<Record<KiCadCliCapabilityName, string>>;
};

export function parseKiCadMajor(
  cli: Pick<DetectedKiCadCli, 'version'> | undefined
): number | undefined {
  if (!cli) {
    return undefined;
  }
  const match = /^(\d+)/u.exec(cli.version);
  if (!match) {
    return undefined;
  }
  const major = Number.parseInt(match[1]!, 10);
  return Number.isFinite(major) ? major : undefined;
}

/** Derive the per-command version status from the detected KiCad major version
 *  and the command's minimum required major version. */
export function deriveCommandVersionStatus(
  detectedMajor: number,
  commandMinimumMajor: number
): string {
  if (detectedMajor < commandMinimumMajor) {
    return 'unsupported';
  }
  if (detectedMajor === 10) {
    return 'primary';
  }
  if (detectedMajor >= 11) {
    return 'preview';
  }
  if (detectedMajor >= 8) {
    return 'deprecated';
  }
  return 'unknown';
}
