import {
  createViewerEngineState,
  isViewerEngineKind
} from '../../src/providers/viewer/viewerEngine';
import { createViewerPayload } from '../../src/providers/viewer/viewerPayload';
import { resolveViewerPalette } from '../../src/providers/viewer/viewerPalette';

describe('viewer helper modules', () => {
  it('resolves the light and dark viewer palettes outside the HTML template', () => {
    expect(resolveViewerPalette('light')).toEqual(
      expect.objectContaining({ colorScheme: 'light' })
    );
    expect(resolveViewerPalette('kicad')).toEqual(
      expect.objectContaining({ colorScheme: 'dark' })
    );
  });

  it('serializes the viewer payload with optional metadata and restore state', () => {
    expect(
      createViewerPayload({
        fileName: 'board.kicad_pcb',
        fileType: 'board',
        base64: 'Zm9v',
        disabledReason: '',
        theme: 'dark',
        fallbackBackground: '#001023',
        metadata: { layers: [{ name: 'F.Cu', visible: true }] },
        restoreState: { zoom: 2, grid: false, theme: 'dark' }
      })
    ).toEqual(
      expect.objectContaining({
        fileName: 'board.kicad_pcb',
        engine: expect.objectContaining({
          kind: 'kicanvas',
          capabilities: expect.objectContaining({ interactive: true })
        }),
        metadata: expect.objectContaining({ layers: expect.any(Array) }),
        restoreState: expect.objectContaining({ zoom: 2 })
      })
    );
  });

  it('models final renderer failure as a non-interactive engine state', () => {
    expect(isViewerEngineKind('failed')).toBe(true);
    expect(
      createViewerEngineState('failed', 'WebGL and SVG fallback failed')
    ).toEqual(
      expect.objectContaining({
        kind: 'failed',
        label: 'Renderer failed',
        reason: 'WebGL and SVG fallback failed',
        capabilities: expect.objectContaining({
          interactive: false,
          fit: false,
          zoom: false,
          exportPng: false,
          exportSvg: false
        })
      })
    );
  });

  it('marks oversized viewer payloads as metadata-only with safe capabilities', () => {
    expect(
      createViewerPayload({
        fileName: 'large-board.kicad_pcb',
        fileType: 'board',
        base64: '',
        disabledReason: 'Interactive render is disabled for large files.',
        theme: 'kicad',
        fallbackBackground: '#001023'
      }).engine
    ).toEqual(
      expect.objectContaining({
        kind: 'metadata-only',
        label: 'Metadata only',
        reason: 'Interactive render is disabled for large files.',
        capabilities: expect.objectContaining({
          fit: false,
          zoom: false,
          exportPng: false,
          exportSvg: true
        })
      })
    );
  });
});
