import { bench, describe } from 'vitest';
import {
  buildKicadDiffSummary,
  renderDiffReport
} from '../src/diff/kicadDiffSummary';
import { createKiCanvasViewerHtml } from '../src/providers/viewerHtml';
import type { ComponentDiff } from '../src/types';
import { createLargePcb, readFixture } from './fixtures';

const beforePcb = createLargePcb(2000, 200);
const afterPcb = createLargePcb(2200, 180);
const componentDiffs: ComponentDiff[] = Array.from(
  { length: 500 },
  (_unused, index) => {
    const type =
      index % 3 === 0 ? 'added' : index % 3 === 1 ? 'removed' : 'changed';
    return {
      reference: `R${index + 1}`,
      type,
      before: { value: `${index % 10}k`, footprint: 'R_0603' },
      after: { value: `${(index + 1) % 10}k`, footprint: 'R_0805' }
    } as ComponentDiff;
  }
);

describe('KiCad diff summary', () => {
  bench('buildKicadDiffSummary: pcb with 500 component diffs', () => {
    buildKicadDiffSummary({
      kind: 'pcb',
      file: 'board.kicad_pcb',
      beforeText: beforePcb,
      afterText: afterPcb,
      components: componentDiffs
    });
  });

  const summary = buildKicadDiffSummary({
    kind: 'pcb',
    file: 'board.kicad_pcb',
    beforeText: beforePcb,
    afterText: afterPcb,
    components: componentDiffs
  });

  bench('renderDiffReport', () => {
    renderDiffReport(summary);
  });
});

describe('createKiCanvasViewerHtml', () => {
  const largePcbBase64 = Buffer.from(
    readFixture('large-board', 'large-board.kicad_pcb'),
    'utf8'
  ).toString('base64');
  const schematicBase64 = Buffer.from(
    readFixture('clean-led-kicad10', 'clean-led-kicad10.kicad_sch'),
    'utf8'
  ).toString('base64');

  bench('large-board pcb first render', () => {
    createKiCanvasViewerHtml({
      title: 'KiCad Studio PCB Viewer',
      fileName: 'large-board.kicad_pcb',
      fileType: 'board',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas.js',
      viewerCssUri: 'vscode-resource:/media/viewer.css',
      base64: largePcbBase64,
      disabledReason: '',
      theme: 'kicad',
      fallbackBackground: '#0f172a'
    });
  });

  bench('schematic reload with restored state', () => {
    createKiCanvasViewerHtml({
      title: 'KiCad Studio Schematic Viewer',
      fileName: 'clean-led-kicad10.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas.js',
      viewerCssUri: 'vscode-resource:/media/viewer.css',
      base64: schematicBase64,
      disabledReason: '',
      theme: 'kicad',
      fallbackBackground: '#0f172a',
      restoreState: { zoom: 1.25, grid: true, theme: 'kicad' }
    });
  });
});
