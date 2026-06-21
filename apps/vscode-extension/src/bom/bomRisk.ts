import type { BomEntry } from '../types';

// Component intelligence / BOM risk scoring (#403). The core scoring is offline
// and deterministic — it makes no network calls and hard-codes no vendor
// assumptions. Optional providers can enrich entries with lifecycle/sourcing
// data; provider failures degrade gracefully and any provider-derived claim
// carries its `source`. This module is free of vscode/fs imports.

export type RiskLevel = 'ok' | 'low' | 'medium' | 'high';

export type AlternativeCompatibility = 'pin' | 'footprint' | 'functional';

export interface ComponentAlternative {
  mpn: string;
  compatibility: AlternativeCompatibility;
  /** Provider that supplied this suggestion; required for any external claim. */
  source: string;
}

export type ComponentLifecycle =
  | 'active'
  | 'nrnd'
  | 'obsolete'
  | 'preview'
  | 'unknown';

export interface ComponentIntelligence {
  lifecycle?: ComponentLifecycle;
  /** Number of distinct sources/distributors, when known. */
  sourceCount?: number;
  alternatives?: ComponentAlternative[];
  /** Provider that supplied this intelligence; required for external claims. */
  source: string;
}

export interface BomRiskProvider {
  readonly name: string;
  lookup(mpn: string): Promise<ComponentIntelligence | undefined>;
}

export interface ScoredBomEntry {
  references: string[];
  value: string;
  mpn: string;
  manufacturer: string;
  quantity: number;
  score: number;
  level: RiskLevel;
  signals: string[];
  intelligence?: ComponentIntelligence;
}

export interface BomRiskSummary {
  scored: number;
  dnp: number;
  high: number;
  medium: number;
  low: number;
  ok: number;
  overall: RiskLevel;
}

export interface BomRiskReport {
  entries: ScoredBomEntry[];
  summary: BomRiskSummary;
}

export interface NormalizerOptions {
  /** Optional manufacturer alias map (e.g. {"TI": "Texas Instruments"}). */
  manufacturerAliases?: Record<string, string> | undefined;
}

export function normalizeMpn(mpn: string): string {
  return mpn.trim().replace(/\s+/gu, '').toUpperCase();
}

export function normalizeManufacturer(
  manufacturer: string,
  options: NormalizerOptions = {}
): string {
  const collapsed = manufacturer.trim().replace(/\s+/gu, ' ');
  if (!collapsed) {
    return '';
  }
  const alias = options.manufacturerAliases?.[collapsed.toUpperCase()];
  return alias ?? collapsed;
}

function levelForScore(score: number): RiskLevel {
  if (score >= 50) return 'high';
  if (score >= 20) return 'medium';
  if (score > 0) return 'low';
  return 'ok';
}

/** Score a single BOM entry from offline signals plus optional intelligence. */
export function scoreBomEntry(
  entry: BomEntry,
  options: NormalizerOptions = {},
  intelligence?: ComponentIntelligence
): ScoredBomEntry {
  const mpn = normalizeMpn(entry.mpn ?? '');
  const manufacturer = normalizeManufacturer(entry.manufacturer ?? '', options);
  const lcsc = (entry.lcsc ?? '').trim();
  const signals: string[] = [];
  let score = 0;

  if (!mpn && !lcsc) {
    score += 50;
    signals.push('no-part-number');
  } else if (!mpn) {
    score += 25;
    signals.push('distributor-only-sourcing');
  }
  if (!manufacturer) {
    score += 15;
    signals.push('missing-manufacturer');
  }
  if (!(entry.footprint ?? '').trim()) {
    score += 10;
    signals.push('missing-footprint');
  }
  if (!(entry.value ?? '').trim()) {
    score += 10;
    signals.push('ambiguous-value');
  }

  if (intelligence) {
    if (intelligence.lifecycle === 'obsolete') {
      score += 40;
      signals.push('lifecycle-obsolete');
    } else if (intelligence.lifecycle === 'nrnd') {
      score += 25;
      signals.push('lifecycle-nrnd');
    }
    if (
      typeof intelligence.sourceCount === 'number' &&
      intelligence.sourceCount <= 1
    ) {
      score += 20;
      signals.push('single-source');
    }
  }

  return {
    references: entry.references ?? [],
    value: entry.value ?? '',
    mpn,
    manufacturer,
    quantity: entry.quantity ?? 0,
    score,
    level: levelForScore(score),
    signals,
    ...(intelligence ? { intelligence } : {})
  };
}

function summarize(entries: ScoredBomEntry[], dnp: number): BomRiskSummary {
  const counts = { high: 0, medium: 0, low: 0, ok: 0 };
  for (const entry of entries) {
    counts[entry.level] += 1;
  }
  const overall: RiskLevel =
    counts.high > 0
      ? 'high'
      : counts.medium > 0
        ? 'medium'
        : counts.low > 0
          ? 'low'
          : 'ok';
  return { scored: entries.length, dnp, ...counts, overall };
}

/** Offline scoring of a whole BOM. DNP entries are counted but not scored. */
export function scoreBom(
  entries: readonly BomEntry[],
  options: NormalizerOptions = {}
): BomRiskReport {
  const active = entries.filter((entry) => !entry.dnp);
  const dnp = entries.length - active.length;
  const scored = active
    .map((entry) => scoreBomEntry(entry, options))
    .sort((left, right) => right.score - left.score);
  return { entries: scored, summary: summarize(scored, dnp) };
}

/**
 * Score a BOM and enrich each entry through a provider. Provider failures (or a
 * missing MPN) leave the entry at its offline score; they never throw.
 */
export async function scoreBomWithProvider(
  entries: readonly BomEntry[],
  provider: BomRiskProvider,
  options: NormalizerOptions = {}
): Promise<BomRiskReport> {
  const active = entries.filter((entry) => !entry.dnp);
  const dnp = entries.length - active.length;
  const scored: ScoredBomEntry[] = [];
  for (const entry of active) {
    const mpn = normalizeMpn(entry.mpn ?? '');
    let intelligence: ComponentIntelligence | undefined;
    if (mpn) {
      try {
        intelligence = await provider.lookup(mpn);
      } catch {
        intelligence = undefined;
      }
    }
    scored.push(scoreBomEntry(entry, options, intelligence));
  }
  scored.sort((left, right) => right.score - left.score);
  return { entries: scored, summary: summarize(scored, dnp) };
}

export function renderBomRiskReport(report: BomRiskReport): string {
  const lines: string[] = [];
  lines.push('# BOM Risk Report', '');
  const s = report.summary;
  lines.push(`- Overall risk: ${s.overall.toUpperCase()}`);
  lines.push(
    `- High: ${s.high} · Medium: ${s.medium} · Low: ${s.low} · OK: ${s.ok} · DNP (skipped): ${s.dnp}`,
    ''
  );
  const flagged = report.entries.filter((entry) => entry.level !== 'ok');
  if (flagged.length === 0) {
    lines.push('No sourcing or lifecycle risks were detected.', '');
    return lines.join('\n');
  }
  lines.push(
    '| References | Value | MPN | Level | Signals |',
    '| --- | --- | --- | --- | --- |'
  );
  for (const entry of flagged) {
    lines.push(
      `| ${entry.references.join(', ') || '—'} | ${entry.value || '—'} | ${entry.mpn || '—'} | ${entry.level} | ${entry.signals.join(', ')} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}
