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
        metadata: expect.objectContaining({ layers: expect.any(Array) }),
        restoreState: expect.objectContaining({ zoom: 2 })
      })
    );
  });
});
