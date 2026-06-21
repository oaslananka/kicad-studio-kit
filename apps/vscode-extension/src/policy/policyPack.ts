// Rules-as-code policy packs (#402). This module is free of vscode/fs imports so
// the same evaluation runs in the extension and headlessly in CI. It does not
// replace native KiCad DRC rules and hard-codes no manufacturer's requirements;
// a pack is supplied by the team as a `.kicad-studio/policy-pack.json` file.

export type PolicySeverity = 'error' | 'warning' | 'advisory';

export type PolicyRule =
  | {
      id: string;
      description?: string;
      severity: PolicySeverity;
      type: 'maxDrcViolations' | 'maxErcViolations';
      max: number;
    }
  | {
      id: string;
      description?: string;
      severity: PolicySeverity;
      type: 'requiredFiles';
      files: string[];
    }
  | {
      id: string;
      description?: string;
      severity: PolicySeverity;
      type: 'requiredArtifacts';
      artifacts: string[];
    }
  | {
      id: string;
      description?: string;
      severity: PolicySeverity;
      type: 'forbiddenFootprints';
      patterns: string[];
    };

export type PolicyRuleType = PolicyRule['type'];

export interface PolicyPack {
  schemaVersion: 1;
  name: string;
  version: string;
  rules: PolicyRule[];
}

/** Project facts a pack is evaluated against. Any omitted fact yields "unknown". */
export interface PolicyContext {
  drcViolations?: number | undefined;
  ercViolations?: number | undefined;
  presentFiles?: string[] | undefined;
  artifacts?: string[] | undefined;
  footprints?: string[] | undefined;
}

export type PolicyStatus = 'pass' | 'fail' | 'unknown';

export interface PolicyRuleResult {
  id: string;
  type: PolicyRuleType;
  severity: PolicySeverity;
  status: PolicyStatus;
  detail: string;
}

export interface PolicyEvaluation {
  pack: { name: string; version: string };
  overall: 'pass' | 'fail';
  counts: { pass: number; fail: number; unknown: number };
  results: PolicyRuleResult[];
}

export class PolicyPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyPackError';
  }
}

const SEVERITIES: ReadonlySet<string> = new Set([
  'error',
  'warning',
  'advisory'
]);
const RULE_TYPES: ReadonlySet<string> = new Set([
  'maxDrcViolations',
  'maxErcViolations',
  'requiredFiles',
  'requiredArtifacts',
  'forbiddenFootprints'
]);

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PolicyPackError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new PolicyPackError(
      `${label} must be an array of non-empty strings.`
    );
  }
  return value as string[];
}

function parseRule(raw: unknown, index: number): PolicyRule {
  const record = asRecord(raw, `rules[${index}]`);
  const id = record['id'];
  if (typeof id !== 'string' || id.length === 0) {
    throw new PolicyPackError(`rules[${index}].id must be a non-empty string.`);
  }
  const severity = record['severity'];
  if (typeof severity !== 'string' || !SEVERITIES.has(severity)) {
    throw new PolicyPackError(
      `rules[${index}] (${id}).severity must be one of error, warning, advisory.`
    );
  }
  const type = record['type'];
  if (typeof type !== 'string' || !RULE_TYPES.has(type)) {
    throw new PolicyPackError(
      `rules[${index}] (${id}).type is not a supported rule type.`
    );
  }
  const description =
    typeof record['description'] === 'string'
      ? (record['description'] as string)
      : undefined;
  const base = {
    id,
    severity: severity as PolicySeverity,
    ...(description ? { description } : {})
  };

  if (type === 'maxDrcViolations' || type === 'maxErcViolations') {
    const max = record['max'];
    if (typeof max !== 'number' || !Number.isFinite(max) || max < 0) {
      throw new PolicyPackError(
        `rules[${index}] (${id}).max must be a non-negative number.`
      );
    }
    return { ...base, type, max };
  }
  if (type === 'requiredFiles') {
    return {
      ...base,
      type,
      files: asStringArray(record['files'], `${id}.files`)
    };
  }
  if (type === 'requiredArtifacts') {
    return {
      ...base,
      type,
      artifacts: asStringArray(record['artifacts'], `${id}.artifacts`)
    };
  }
  return {
    ...base,
    type: 'forbiddenFootprints',
    patterns: asStringArray(record['patterns'], `${id}.patterns`)
  };
}

export function parsePolicyPack(input: string | unknown): PolicyPack {
  let raw: unknown;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (error) {
      throw new PolicyPackError(
        `Policy pack is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    raw = input;
  }
  const record = asRecord(raw, 'policy pack');
  if (record['schemaVersion'] !== 1) {
    throw new PolicyPackError('Policy pack schemaVersion must be 1.');
  }
  if (typeof record['name'] !== 'string' || record['name'].length === 0) {
    throw new PolicyPackError('Policy pack name must be a non-empty string.');
  }
  if (typeof record['version'] !== 'string' || record['version'].length === 0) {
    throw new PolicyPackError(
      'Policy pack version must be a non-empty string.'
    );
  }
  if (!Array.isArray(record['rules']) || record['rules'].length === 0) {
    throw new PolicyPackError('Policy pack must declare at least one rule.');
  }
  const ids = new Set<string>();
  const rules = (record['rules'] as unknown[]).map((rule, index) => {
    const parsed = parseRule(rule, index);
    if (ids.has(parsed.id)) {
      throw new PolicyPackError(`Duplicate rule id: ${parsed.id}`);
    }
    ids.add(parsed.id);
    return parsed;
  });
  return {
    schemaVersion: 1,
    name: record['name'],
    version: record['version'],
    rules
  };
}

function matchesPattern(value: string, pattern: string): boolean {
  // Glob-lite: `*` matches any run of characters; everything else is literal.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\*/gu, '.*')}$`, 'u');
  return regex.test(value);
}

function evaluateRule(
  rule: PolicyRule,
  context: PolicyContext
): { status: PolicyStatus; detail: string } {
  switch (rule.type) {
    case 'maxDrcViolations':
    case 'maxErcViolations': {
      const actual =
        rule.type === 'maxDrcViolations'
          ? context.drcViolations
          : context.ercViolations;
      if (typeof actual !== 'number') {
        return { status: 'unknown', detail: 'No DRC/ERC data was provided.' };
      }
      return actual <= rule.max
        ? { status: 'pass', detail: `${actual} ≤ ${rule.max}` }
        : { status: 'fail', detail: `${actual} > ${rule.max}` };
    }
    case 'requiredFiles': {
      if (!context.presentFiles) {
        return { status: 'unknown', detail: 'No file listing was provided.' };
      }
      const present = new Set(context.presentFiles);
      const missing = rule.files.filter((file) => !present.has(file));
      return missing.length === 0
        ? { status: 'pass', detail: 'All required files present.' }
        : { status: 'fail', detail: `Missing: ${missing.join(', ')}` };
    }
    case 'requiredArtifacts': {
      if (!context.artifacts) {
        return {
          status: 'unknown',
          detail: 'No artifact listing was provided.'
        };
      }
      const present = new Set(context.artifacts);
      const missing = rule.artifacts.filter(
        (artifact) => !present.has(artifact)
      );
      return missing.length === 0
        ? { status: 'pass', detail: 'All required artifacts present.' }
        : { status: 'fail', detail: `Missing: ${missing.join(', ')}` };
    }
    case 'forbiddenFootprints': {
      if (!context.footprints) {
        return {
          status: 'unknown',
          detail: 'No footprint listing was provided.'
        };
      }
      const offenders = context.footprints.filter((footprint) =>
        rule.patterns.some((pattern) => matchesPattern(footprint, pattern))
      );
      return offenders.length === 0
        ? { status: 'pass', detail: 'No forbidden footprints found.' }
        : {
            status: 'fail',
            detail: `Found: ${[...new Set(offenders)].join(', ')}`
          };
    }
  }
}

export function evaluatePolicyPack(
  pack: PolicyPack,
  context: PolicyContext
): PolicyEvaluation {
  const results: PolicyRuleResult[] = pack.rules.map((rule) => {
    const { status, detail } = evaluateRule(rule, context);
    return {
      id: rule.id,
      type: rule.type,
      severity: rule.severity,
      status,
      detail
    };
  });
  const counts = {
    pass: results.filter((result) => result.status === 'pass').length,
    fail: results.filter((result) => result.status === 'fail').length,
    unknown: results.filter((result) => result.status === 'unknown').length
  };
  // Only error-severity failures block; warnings/advisories never fail overall.
  const overall = results.some(
    (result) => result.status === 'fail' && result.severity === 'error'
  )
    ? 'fail'
    : 'pass';
  return {
    pack: { name: pack.name, version: pack.version },
    overall,
    counts,
    results
  };
}

export function renderPolicyReport(evaluation: PolicyEvaluation): string {
  const icon = (status: PolicyStatus): string =>
    status === 'pass' ? '✅' : status === 'fail' ? '❌' : '❔';
  const lines: string[] = [];
  lines.push('# Policy Pack Result', '');
  lines.push(`- Pack: ${evaluation.pack.name} (${evaluation.pack.version})`);
  lines.push(`- Overall: ${evaluation.overall.toUpperCase()}`);
  lines.push(
    `- Pass: ${evaluation.counts.pass} · Fail: ${evaluation.counts.fail} · Unknown: ${evaluation.counts.unknown}`,
    ''
  );
  lines.push(
    '| Rule | Severity | Status | Detail |',
    '| --- | --- | --- | --- |'
  );
  for (const result of evaluation.results) {
    lines.push(
      `| ${result.id} | ${result.severity} | ${icon(result.status)} ${result.status} | ${result.detail.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}
