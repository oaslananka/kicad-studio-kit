import {
  buildKicadDiffSummary,
  classifyKicadFile,
  renderDiffReport,
  summarizeComponents,
  summarizePcb
} from '../../src/diff/kicadDiffSummary';
import type { ComponentDiff } from '../../src/types';

const PCB_BEFORE = `(kicad_pcb
  (footprint "R_0402" (layer "F.Cu"))
  (segment (start 0 0) (end 1 0) (width 0.2) (layer "F.Cu") (net 1))
  (via (at 1 1) (size 0.6) (layers "F.Cu" "B.Cu"))
  (zone (net 1) (layer "F.Cu"))
)`;

const PCB_AFTER = `(kicad_pcb
  (footprint "R_0402" (layer "F.Cu"))
  (footprint "C_0402" (layer "F.Cu"))
  (segment (start 0 0) (end 1 0) (width 0.2) (layer "F.Cu") (net 1))
  (segment (start 0 0) (end 1 0) (width 0.2) (layer "B.Cu") (net 2))
  (via (at 1 1) (size 0.6) (layers "F.Cu" "B.Cu"))
)`;

describe('#401 KiCad diff summary', () => {
  describe('classifyKicadFile', () => {
    it('classifies schematic, pcb, and unknown', () => {
      expect(classifyKicadFile('/x/board.kicad_sch')).toBe('schematic');
      expect(classifyKicadFile('/x/board.kicad_pcb')).toBe('pcb');
      expect(classifyKicadFile('/x/notes.txt')).toBe('unknown');
    });
  });

  describe('summarizeComponents', () => {
    it('counts adds, removes, and field-level changes', () => {
      const diffs: ComponentDiff[] = [
        { uuid: '1', reference: 'R1', type: 'added', after: { value: '10k' } },
        {
          uuid: '2',
          reference: 'C1',
          type: 'removed',
          before: { value: '100n' }
        },
        {
          uuid: '3',
          reference: 'R2',
          type: 'changed',
          before: { value: '1k', footprint: 'R_0402' },
          after: { value: '2k', footprint: 'R_0402' }
        },
        {
          uuid: '4',
          reference: 'U1',
          type: 'changed',
          before: { value: 'MCU', footprint: 'A' },
          after: { value: 'MCU', footprint: 'B' }
        }
      ];
      const summary = summarizeComponents(diffs);
      expect(summary.added).toBe(1);
      expect(summary.removed).toBe(1);
      expect(summary.changed).toBe(2);
      expect(summary.valueChanges).toBe(1);
      expect(summary.footprintChanges).toBe(1);
      expect(summary.references).toEqual({
        added: ['R1'],
        removed: ['C1'],
        changed: ['R2', 'U1']
      });
    });
  });

  describe('summarizePcb', () => {
    it('counts primitives and per-layer tracks with deltas', () => {
      const pcb = summarizePcb(PCB_BEFORE, PCB_AFTER);
      expect(pcb.footprints).toEqual({ before: 1, after: 2, delta: 1 });
      expect(pcb.tracks).toEqual({ before: 1, after: 2, delta: 1 });
      expect(pcb.vias).toEqual({ before: 1, after: 1, delta: 0 });
      expect(pcb.zones).toEqual({ before: 1, after: 0, delta: -1 });
      expect(pcb.tracksByLayer['F.Cu']).toEqual({ before: 1, after: 1 });
      expect(pcb.tracksByLayer['B.Cu']).toEqual({ before: 0, after: 1 });
    });
  });

  describe('buildKicadDiffSummary', () => {
    it('summarizes a schematic from component diffs', () => {
      const summary = buildKicadDiffSummary({
        kind: 'schematic',
        file: 'board.kicad_sch',
        components: [
          { uuid: '1', reference: 'R1', type: 'added', after: { value: '1k' } }
        ]
      });
      expect(summary.kind).toBe('schematic');
      expect(summary.components?.added).toBe(1);
      expect(summary.pcb).toBeUndefined();
      expect(summary.truncated).toBe(false);
    });

    it('summarizes a pcb from before/after text', () => {
      const summary = buildKicadDiffSummary({
        kind: 'pcb',
        file: 'board.kicad_pcb',
        beforeText: PCB_BEFORE,
        afterText: PCB_AFTER
      });
      expect(summary.pcb?.footprints.delta).toBe(1);
    });

    it('marks oversized inputs as truncated and skips the heavy scan', () => {
      const huge = `(kicad_pcb ${'(segment )'.repeat(1_000_000)})`;
      const summary = buildKicadDiffSummary({
        kind: 'pcb',
        beforeText: huge,
        afterText: huge
      });
      expect(summary.truncated).toBe(true);
      expect(summary.pcb).toBeUndefined();
    });
  });

  describe('renderDiffReport', () => {
    it('renders component and board tables with the review disclaimer', () => {
      const report = renderDiffReport(
        buildKicadDiffSummary({
          kind: 'pcb',
          file: 'board.kicad_pcb',
          beforeText: PCB_BEFORE,
          afterText: PCB_AFTER,
          components: [
            {
              uuid: '1',
              reference: 'R1',
              type: 'added',
              after: { value: '1k' }
            }
          ]
        })
      );
      expect(report).toContain('# KiCad Diff Report');
      expect(report).toContain('## Components');
      expect(report).toContain('## Board primitives');
      expect(report).toContain('### Tracks by layer');
      expect(report).toContain('| Footprints | 1 → 2 (+1) |');
      expect(report).toContain('| Zones | 1 → 0 (-1) |');
      expect(report).toContain('does not replace the Git text diff');
    });
  });
});
