// Release readiness scorecard (#404). Pure, editor-free rollup of readiness
// dimensions into a stable machine-readable result plus Markdown/HTML reports.
// The score never hides hard failures: any failed dimension or blocking finding
// forces an overall `fail` regardless of the numeric score. Dimension inputs are
// supplied by adapters (design checks, manufacturing/assembly/docs/release
// artifacts, policy compliance, BOM/procurement) so this module stays decoupled.

export type DimensionStatus = 'pass' | 'warn' | 'fail' | 'not-applicable';
export type ScorecardStatus = 'pass' | 'warn' | 'fail';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ScorecardFinding {
  id: string;
  severity: FindingSeverity;
  message: string;
  /** Concrete remediation step for this finding. */
  remediation?: string;
}

export interface ScorecardDimensionInput {
  id: string;
  label: string;
  status: DimensionStatus;
  findings?: ScorecardFinding[];
  /** Optional remediation summary for the whole dimension. */
  remediation?: string;
}

export interface ScorecardDimension extends ScorecardDimensionInput {
  findings: ScorecardFinding[];
  /** 0–100 contribution; `null` when not-applicable. */
  score: number | null;
}

export interface Scorecard {
  project: string;
  status: ScorecardStatus;
  score: number;
  dimensions: ScorecardDimension[];
  blockingFindings: ScorecardFinding[];
  warnings: ScorecardFinding[];
  artifacts: string[];
  toolVersions: Record<string, string>;
}

export interface BuildScorecardInput {
  project: string;
  dimensions: ScorecardDimensionInput[];
  artifacts?: string[];
  toolVersions?: Record<string, string>;
}

const STATUS_SCORE: Record<
  Exclude<DimensionStatus, 'not-applicable'>,
  number
> = {
  pass: 100,
  warn: 60,
  fail: 0
};

const BLOCKING_SEVERITIES: ReadonlySet<FindingSeverity> = new Set([
  'critical',
  'high'
]);

export function buildScorecard(input: BuildScorecardInput): Scorecard {
  const dimensions: ScorecardDimension[] = input.dimensions.map(
    (dimension) => ({
      ...dimension,
      findings: dimension.findings ?? [],
      score:
        dimension.status === 'not-applicable'
          ? null
          : STATUS_SCORE[dimension.status]
    })
  );

  const applicable = dimensions.filter((dimension) => dimension.score !== null);
  const score =
    applicable.length === 0
      ? 100
      : Math.round(
          applicable.reduce((total, dimension) => total + dimension.score!, 0) /
            applicable.length
        );

  const hasFail = dimensions.some((dimension) => dimension.status === 'fail');
  const hasWarn = dimensions.some((dimension) => dimension.status === 'warn');

  const blockingFindings = dimensions.flatMap((dimension) =>
    dimension.findings.filter((finding) =>
      BLOCKING_SEVERITIES.has(finding.severity)
    )
  );
  const warnings = dimensions.flatMap((dimension) =>
    dimension.findings.filter((finding) => finding.severity === 'medium')
  );

  // A hard failure (failed dimension or blocking finding) blocks regardless of
  // the numeric score.
  const status: ScorecardStatus =
    hasFail || blockingFindings.length > 0
      ? 'fail'
      : hasWarn || warnings.length > 0
        ? 'warn'
        : 'pass';

  return {
    project: input.project,
    status,
    score,
    dimensions,
    blockingFindings,
    warnings,
    artifacts: input.artifacts ?? [],
    toolVersions: input.toolVersions ?? {}
  };
}

function statusIcon(status: DimensionStatus | ScorecardStatus): string {
  switch (status) {
    case 'pass':
      return '✅';
    case 'warn':
      return '⚠️';
    case 'fail':
      return '❌';
    default:
      return '➖';
  }
}

export function renderScorecardMarkdown(scorecard: Scorecard): string {
  const lines: string[] = [];
  lines.push('# Release Readiness Scorecard', '');
  lines.push(`- Project: \`${scorecard.project}\``);
  lines.push(
    `- Status: ${statusIcon(scorecard.status)} ${scorecard.status.toUpperCase()} (score ${scorecard.score}/100)`,
    ''
  );

  lines.push('| Dimension | Status | Remediation |', '| --- | --- | --- |');
  for (const dimension of scorecard.dimensions) {
    lines.push(
      `| ${escapeCell(dimension.label)} | ${statusIcon(dimension.status)} ${dimension.status} | ${escapeCell(dimension.remediation ?? '')} |`
    );
  }
  lines.push('');

  if (scorecard.blockingFindings.length > 0) {
    lines.push('## Blocking findings', '');
    for (const finding of scorecard.blockingFindings) {
      lines.push(
        `- **${finding.severity}** ${finding.message}${finding.remediation ? ` — _${finding.remediation}_` : ''}`
      );
    }
    lines.push('');
  }

  if (scorecard.artifacts.length > 0) {
    lines.push('## Artifacts', '');
    for (const artifact of scorecard.artifacts) {
      lines.push(`- \`${artifact}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function renderScorecardHtml(scorecard: Scorecard): string {
  const rows = scorecard.dimensions
    .map(
      (dimension) =>
        `<tr><td>${escapeHtml(dimension.label)}</td><td>${escapeHtml(dimension.status)}</td><td>${escapeHtml(dimension.remediation ?? '')}</td></tr>`
    )
    .join('');
  const blocking = scorecard.blockingFindings
    .map(
      (finding) =>
        `<li><strong>${escapeHtml(finding.severity)}</strong> ${escapeHtml(finding.message)}</li>`
    )
    .join('');
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><title>Release Readiness Scorecard</title></head><body>',
    '<h1>Release Readiness Scorecard</h1>',
    `<p>Project: <code>${escapeHtml(scorecard.project)}</code></p>`,
    `<p>Status: <strong>${escapeHtml(scorecard.status.toUpperCase())}</strong> (score ${scorecard.score}/100)</p>`,
    '<table border="1"><thead><tr><th>Dimension</th><th>Status</th><th>Remediation</th></tr></thead>',
    `<tbody>${rows}</tbody></table>`,
    blocking ? `<h2>Blocking findings</h2><ul>${blocking}</ul>` : '',
    '</body></html>'
  ].join('\n');
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
