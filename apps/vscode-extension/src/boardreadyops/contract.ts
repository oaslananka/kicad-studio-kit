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

export interface BoardReadyOpsFinding {
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  resource: {
    path: string;
    kind: string;
  };
  location?: {
    line?: number;
    column?: number;
    region?: {
      startLine: number;
      endLine: number;
      startColumn?: number;
      endColumn?: number;
    };
  };
}

export interface BoardReadyOpsRunResult {
  schemaVersion: number;
  tool: {
    name: 'boardreadyops';
    version: string;
  };
  status?: 'passed' | 'failed';
  exitCode?: number;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  findings: BoardReadyOpsFinding[];
}

const READINESS_CONTRACT_ERROR =
  'BoardReadyOps returned an unsupported or incomplete readiness result.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isFinding(value: unknown): value is BoardReadyOpsFinding {
  if (!isRecord(value) || !isRecord(value['resource'])) {
    return false;
  }
  return (
    typeof value['ruleId'] === 'string' &&
    value['ruleId'].length > 0 &&
    ['critical', 'high', 'medium', 'low', 'info'].includes(
      String(value['severity'])
    ) &&
    typeof value['message'] === 'string' &&
    value['message'].length > 0 &&
    typeof value['resource']['path'] === 'string' &&
    value['resource']['path'].length > 0 &&
    typeof value['resource']['kind'] === 'string' &&
    value['resource']['kind'].length > 0
  );
}

export function parseBoardReadyOpsRunResult(
  input: unknown
): BoardReadyOpsRunResult {
  const value = parseDoctorValue(input);
  if (value === undefined && typeof input === 'string') {
    throw new Error('BoardReadyOps returned invalid JSON output.');
  }
  if (!isRecord(value)) {
    throw new Error(READINESS_CONTRACT_ERROR);
  }

  const tool = value['tool'];
  const summary = value['summary'];
  const findings = value['findings'];
  if (
    value['schemaVersion'] !==
      COMPATIBILITY_MATRIX.supportAxes.boardReadyOps.findingsSchema ||
    !isRecord(tool) ||
    tool['name'] !== 'boardreadyops' ||
    typeof tool['version'] !== 'string' ||
    !semver.valid(tool['version']) ||
    !semver.satisfies(
      tool['version'],
      COMPATIBILITY_MATRIX.supportAxes.boardReadyOps.required
    ) ||
    !isRecord(summary) ||
    !isNonNegativeInteger(summary['total']) ||
    !isNonNegativeInteger(summary['critical']) ||
    !isNonNegativeInteger(summary['high']) ||
    !isNonNegativeInteger(summary['medium']) ||
    !isNonNegativeInteger(summary['low']) ||
    !isNonNegativeInteger(summary['info']) ||
    !Array.isArray(findings) ||
    !findings.every(isFinding)
  ) {
    throw new Error(READINESS_CONTRACT_ERROR);
  }

  if (
    value['status'] !== undefined &&
    value['status'] !== 'passed' &&
    value['status'] !== 'failed'
  ) {
    throw new Error(READINESS_CONTRACT_ERROR);
  }
  if (
    value['exitCode'] !== undefined &&
    !isNonNegativeInteger(value['exitCode'])
  ) {
    throw new Error(READINESS_CONTRACT_ERROR);
  }

  return value as unknown as BoardReadyOpsRunResult;
}
