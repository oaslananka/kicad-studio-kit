import semver from 'semver';
import { COMPATIBILITY_MATRIX } from '../mcp/compatibilityMatrix';

export interface BoardReadyOpsContractDiscovery {
  compatible: boolean;
  schemaVersion: number | undefined;
  version: string;
  reason?:
    | 'unsupported doctor schema'
    | 'malformed doctor payload'
    | 'unsupported BoardReadyOps version';
}

function parseDoctorValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value.trim());
  } catch {
    return undefined;
  }
}

function readDoctorVersion(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return 'unknown';
  }
  const tool = (value as { tool?: unknown }).tool;
  if (!tool || typeof tool !== 'object') {
    return 'unknown';
  }
  const version = (tool as { version?: unknown }).version;
  return typeof version === 'string' && version.trim()
    ? version.trim()
    : 'unknown';
}

export function discoverBoardReadyOpsContract(
  input: unknown
): BoardReadyOpsContractDiscovery {
  const value = parseDoctorValue(input);
  if (value === undefined && typeof input === 'string') {
    return {
      compatible: false,
      reason: 'malformed doctor payload',
      schemaVersion: undefined,
      version: 'unknown'
    };
  }

  const version = readDoctorVersion(value);
  const schemaVersion =
    value &&
    typeof value === 'object' &&
    typeof (value as { schemaVersion?: unknown }).schemaVersion === 'number'
      ? (value as { schemaVersion: number }).schemaVersion
      : undefined;

  if (
    schemaVersion !==
    COMPATIBILITY_MATRIX.supportAxes.boardReadyOps.doctorSchema
  ) {
    return {
      compatible: false,
      reason: 'unsupported doctor schema',
      schemaVersion,
      version
    };
  }

  const tool =
    value && typeof value === 'object'
      ? (value as { tool?: unknown }).tool
      : undefined;
  const toolName =
    tool && typeof tool === 'object'
      ? (tool as { name?: unknown }).name
      : undefined;
  const checks =
    value && typeof value === 'object'
      ? (value as { checks?: unknown }).checks
      : undefined;
  if (
    toolName !== 'boardreadyops' ||
    !Array.isArray(checks) ||
    version === 'unknown'
  ) {
    return {
      compatible: false,
      reason: 'malformed doctor payload',
      schemaVersion,
      version
    };
  }

  const normalized = semver.valid(version) ?? undefined;
  if (
    !normalized ||
    !semver.satisfies(
      normalized,
      COMPATIBILITY_MATRIX.supportAxes.boardReadyOps.required
    )
  ) {
    return {
      compatible: false,
      reason: 'unsupported BoardReadyOps version',
      schemaVersion,
      version
    };
  }

  return { compatible: true, schemaVersion, version };
}
