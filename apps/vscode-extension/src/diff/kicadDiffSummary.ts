import type { ComponentDiff } from '../types';

// KiCad-aware structural diff summary (#401). This module is intentionally free
// of vscode/fs imports so the same logic can run inside the extension and in a
// headless CI/PR context. It produces machine-readable summary data and a
// human-readable Markdown report; it does not replace the Git text diff and
// makes no electrical-correctness claims.

/** Combined byte size above which the heavy PCB scan is skipped. */
export const MAX_DIFF_SCAN_BYTES = 8 * 1024 * 1024;

export type KicadDiffKind = 'schematic' | 'pcb' | 'unknown';

export interface ComponentChangeSummary {
  added: number;
  removed: number;
  changed: number;
  valueChanges: number;
  footprintChanges: number;
  references: {
    added: string[];
    removed: string[];
    changed: string[];
  };
}

export interface PrimitiveDelta {
  before: number;
  after: number;
  delta: number;
}

export interface PcbPrimitiveSummary {
  footprints: PrimitiveDelta;
  tracks: PrimitiveDelta;
  vias: PrimitiveDelta;
  zones: PrimitiveDelta;
  /** Per-layer copper track (segment) counts, before and after. */
  tracksByLayer: Record<string, { before: number; after: number }>;
}

export interface KicadDiffSummary {
  kind: KicadDiffKind;
  file?: string;
  truncated: boolean;
  components?: ComponentChangeSummary;
  pcb?: PcbPrimitiveSummary;
}

export function classifyKicadFile(filePath: string): KicadDiffKind {
  if (filePath.endsWith('.kicad_sch')) {
    return 'schematic';
  }
  if (filePath.endsWith('.kicad_pcb')) {
    return 'pcb';
  }
  return 'unknown';
}

export function summarizeComponents(
  diffs: readonly ComponentDiff[]
): ComponentChangeSummary {
  const summary: ComponentChangeSummary = {
    added: 0,
    removed: 0,
    changed: 0,
    valueChanges: 0,
    footprintChanges: 0,
    references: { added: [], removed: [], changed: [] }
  };

  for (const diff of diffs) {
    if (diff.type === 'added') {
      summary.added += 1;
      summary.references.added.push(diff.reference);
    } else if (diff.type === 'removed') {
      summary.removed += 1;
      summary.references.removed.push(diff.reference);
    } else {
      summary.changed += 1;
      summary.references.changed.push(diff.reference);
      if ((diff.before?.['value'] ?? '') !== (diff.after?.['value'] ?? '')) {
        summary.valueChanges += 1;
      }
      if (
        (diff.before?.['footprint'] ?? '') !== (diff.after?.['footprint'] ?? '')
      ) {
        summary.footprintChanges += 1;
      }
    }
  }

  summary.references.added.sort();
  summary.references.removed.sort();
  summary.references.changed.sort();
  return summary;
}

function countOccurrences(text: string, token: string): number {
  let count = 0;
  let index = text.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(token, index + token.length);
  }
  return count;
}

function countTracksByLayer(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const pattern = /\(segment\b[\s\S]*?\(layer\s+"([^"]+)"/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const layer = match[1];
    if (layer) {
      counts[layer] = (counts[layer] ?? 0) + 1;
    }
  }
  return counts;
}

export function summarizePcb(
  beforeText: string,
  afterText: string
): PcbPrimitiveSummary {
  const delta = (token: string): PrimitiveDelta => {
    const before = countOccurrences(beforeText, token);
    const after = countOccurrences(afterText, token);
    return { before, after, delta: after - before };
  };

  const beforeLayers = countTracksByLayer(beforeText);
  const afterLayers = countTracksByLayer(afterText);
  const tracksByLayer: Record<string, { before: number; after: number }> = {};
  for (const layer of new Set([
    ...Object.keys(beforeLayers),
    ...Object.keys(afterLayers)
  ]).values()) {
    tracksByLayer[layer] = {
      before: beforeLayers[layer] ?? 0,
      after: afterLayers[layer] ?? 0
    };
  }

  return {
    footprints: delta('(footprint '),
    tracks: delta('(segment '),
    vias: delta('(via '),
    zones: delta('(zone '),
    tracksByLayer
  };
}

export interface BuildKicadDiffInput {
  kind: KicadDiffKind;
  file?: string | undefined;
  beforeText?: string | undefined;
  afterText?: string | undefined;
  components?: readonly ComponentDiff[] | undefined;
}

export function buildKicadDiffSummary(
  input: BuildKicadDiffInput
): KicadDiffSummary {
  const combinedSize =
    Buffer.byteLength(input.beforeText ?? '', 'utf8') +
    Buffer.byteLength(input.afterText ?? '', 'utf8');
  const truncated = combinedSize > MAX_DIFF_SCAN_BYTES;

  const summary: KicadDiffSummary = {
    kind: input.kind,
    truncated,
    ...(input.file ? { file: input.file } : {})
  };

  if (input.components) {
    summary.components = summarizeComponents(input.components);
  }

  if (
    input.kind === 'pcb' &&
    !truncated &&
    typeof input.beforeText === 'string' &&
    typeof input.afterText === 'string'
  ) {
    summary.pcb = summarizePcb(input.beforeText, input.afterText);
  }

  return summary;
}

function deltaCell(value: PrimitiveDelta): string {
  const sign = value.delta > 0 ? `+${value.delta}` : `${value.delta}`;
  return `${value.before} → ${value.after} (${sign})`;
}

export function renderDiffReport(summary: KicadDiffSummary): string {
  const lines: string[] = [];
  lines.push('# KiCad Diff Report', '');
  if (summary.file) {
    lines.push(`- File: \`${summary.file}\``);
  }
  lines.push(`- Type: ${summary.kind}`);
  if (summary.truncated) {
    lines.push(
      '- Note: file exceeded the scan size limit; only a partial summary is available.'
    );
  }
  lines.push('');

  if (summary.components) {
    const c = summary.components;
    lines.push('## Components', '');
    lines.push('| Change | Count |', '| --- | ---: |');
    lines.push(`| Added | ${c.added} |`);
    lines.push(`| Removed | ${c.removed} |`);
    lines.push(`| Changed | ${c.changed} |`);
    lines.push(`| — value changes | ${c.valueChanges} |`);
    lines.push(`| — footprint changes | ${c.footprintChanges} |`);
    lines.push('');
    if (c.references.added.length) {
      lines.push(`Added: ${c.references.added.join(', ')}`, '');
    }
    if (c.references.removed.length) {
      lines.push(`Removed: ${c.references.removed.join(', ')}`, '');
    }
    if (c.references.changed.length) {
      lines.push(`Changed: ${c.references.changed.join(', ')}`, '');
    }
  }

  if (summary.pcb) {
    const p = summary.pcb;
    lines.push('## Board primitives', '');
    lines.push('| Primitive | Before → After (Δ) |', '| --- | --- |');
    lines.push(`| Footprints | ${deltaCell(p.footprints)} |`);
    lines.push(`| Tracks | ${deltaCell(p.tracks)} |`);
    lines.push(`| Vias | ${deltaCell(p.vias)} |`);
    lines.push(`| Zones | ${deltaCell(p.zones)} |`);
    lines.push('');
    const layers = Object.keys(p.tracksByLayer).sort();
    if (layers.length) {
      lines.push('### Tracks by layer', '');
      lines.push('| Layer | Before | After |', '| --- | ---: | ---: |');
      for (const layer of layers) {
        const entry = p.tracksByLayer[layer]!;
        lines.push(`| ${layer} | ${entry.before} | ${entry.after} |`);
      }
      lines.push('');
    }
  }

  lines.push(
    '_This is a structural summary for review. It does not replace the Git text diff or assert electrical correctness._',
    ''
  );
  return lines.join('\n');
}
