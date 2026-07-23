import { Script } from 'node:vm';
import { createKiCanvasViewerHtml } from '../../src/providers/viewerHtml';
import { createViewerControllerScript } from '../../src/providers/viewer/viewerControllerScript';
import { compactHtmlDocument } from '../../src/providers/viewer/viewerTemplate';

describe('createKiCanvasViewerHtml', () => {
  it('includes hard timeout messaging instead of soft resolve text', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain(
      'The file may be empty or the renderer failed silently.'
    );
    expect(html).not.toContain(
      'still resolve — the user can see whatever rendered'
    );
  });

  it('fits to screen before showing the success status', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_pcb',
      fileType: 'board',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    const successSection = html.slice(html.indexOf('// ── 6. Success'));
    expect(successSection.indexOf('viewer.fitToScreen?.();')).toBeGreaterThan(
      -1
    );
    expect(successSection.indexOf('viewer.fitToScreen?.();')).toBeLessThan(
      successSection.indexOf('hideAll();')
    );
    expect(successSection.indexOf('viewer.fitToScreen?.();')).toBeLessThan(
      successSection.indexOf(
        "setStatus('Interactive renderer loaded: ' + payload.fileName);"
      )
    );
  });

  it('requests an SVG fallback when KiCanvas reports success without a drawable surface', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain(
      'await waitForRenderableSurface(viewerMount, 2000);'
    );
    expect(html).toContain(
      'Interactive renderer stayed blank. Requesting SVG fallback…'
    );
    expect(html).toContain("type: 'requestSvgFallback'");
    expect(html).toContain(
      "type !== 'svgFallback' && message.type !== 'svgFallbackUnavailable'"
    );
    expect(html).toContain(
      "setStatus('CLI SVG fallback loaded: ' + payload.fileName);"
    );
  });

  it('models KiCanvas, CLI SVG fallback, and metadata-only engines in the viewer bootstrap', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain('id="viewer-engine-badge"');
    expect(html).toContain('id="engine-summary"');
    expect(html).toContain('data-engine-kind="kicanvas"');
    expect(html).toContain("'cli-svg-fallback'");
    expect(html).toContain("'metadata-only'");
    expect(html).toContain('function setEngineState(kind, reason)');
    expect(html).toContain('localState = { ...localState, engine };');
    expect(html).toContain('function setControlsForEngine(engine)');
    expect(html).toContain('setControlsForEngine(nextEngine);');
  });

  it('starts metadata-only mode with unsupported viewer controls disabled', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'oversized.kicad_pcb',
      fileType: 'board',
      status: 'Opening metadata preview...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: '',
      disabledReason:
        'Interactive render is disabled for files larger than 100 MB.'
    });

    expect(html).toContain('data-engine-kind="metadata-only"');
    expect(html).toContain('Metadata only');
    expect(html).toContain(
      'setControlDisabled(fitBtn, !engine.capabilities.fit);'
    );
    expect(html).toContain(
      'setControlDisabled(exportPngBtn, !engine.capabilities.exportPng);'
    );
  });

  it('supports exporting PNG from the SVG fallback surface', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain('if (!canvas && fallbackSvgDataUrl) {');
    expect(html).toContain('void exportFallbackSvgAsPng();');
    expect(html).toContain('const preparedSvg = prepareSvgFallback(svgText);');
    expect(html).toContain('fallbackSvgFitScale = Math.min(');
    expect(html).toContain('fallbackSvgScale = fallbackSvgFitScale;');
    expect(html).toContain("stage.id = 'svg-fallback-stage';");
    expect(html).toContain(
      "fallbackSvgElement.style.width = renderedWidth + 'px';"
    );
    expect(html).toContain(
      "fallbackSvgElement.style.height = renderedHeight + 'px';"
    );
    expect(html).toContain(
      'const innerWidth = Math.max(1, fallbackSvgWrapper.clientWidth - 40);'
    );
    expect(html).toContain(
      'const stageWidth = Math.max(innerWidth, renderedWidth);'
    );
    expect(html).toContain(
      "window.addEventListener('resize', fallbackResizeHandler);"
    );
    expect(html).toContain("wrapper.addEventListener('wheel', (event) => {");
    expect(html).toContain(
      'const canScrollVertically = wrapper.scrollHeight > wrapper.clientHeight + 1;'
    );
    expect(html).toContain('const shouldPan = event.shiftKey || event.altKey;');
    expect(html).toContain('if (shouldPan) {');
    expect(html).toContain(
      'const zoomFactor = direction < 0 ? 1.12 : 1 / 1.12;'
    );
    expect(html).toContain('fallbackSvgScale = nextScale;');
    expect(html).toContain('fallbackSvgWrapper.scrollLeft = clamp(');
    expect(html).toContain(
      'Math.max(0, fallbackSvgWrapper.scrollWidth - fallbackSvgWrapper.clientWidth)'
    );
    expect(html).toContain('fallbackSvgWrapper.scrollTop = clamp(');
    expect(html).toContain(
      'Math.max(0, fallbackSvgWrapper.scrollHeight - fallbackSvgWrapper.clientHeight)'
    );
    expect(html).toContain('wrapper.scrollTop += event.deltaY;');
    expect(html).toContain("wrapper.classList.add('is-dragging');");
    expect(html).toContain('function clamp(value, min, max) {');
    expect(html).toContain('function getFallbackMaxZoomScale() {');
    expect(html).toContain(
      "const maxRenderedDimension = payload.fileType === 'board' ? 24000 : 18000;"
    );
    expect(html).toContain(
      "const relativeMaxScale = fallbackSvgFitScale * (payload.fileType === 'board' ? 64 : 48);"
    );
    expect(html).toContain(
      "return 'data:image/svg+xml;base64,' + btoa(binary);"
    );
  });

  it('styles PCB SVG fallback with a KiCad-like board background instead of a white card', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_pcb',
      fileType: 'board',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: '',
      fallbackBackground: 'rgb(0, 16, 35)'
    });

    expect(html).toContain('payload.fallbackBackground');
    expect(html).toContain(
      'wrapper.style.background = resolveFallbackBackground();'
    );
    expect(html).toContain("svgElement.style.background = 'transparent';");
    expect(html).toContain("svgElement.style.boxShadow = 'none';");
    expect(html).toContain(
      "return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#001023';"
    );
    expect(html).not.toContain('background: #fff;');
  });

  it('keeps the viewer area flexible while pinning the sidebar to a fixed width', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_pcb',
      fileType: 'board',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: '',
      metadata: {
        layers: [
          {
            name: 'F.Cu',
            kind: 'signal',
            visible: true
          }
        ]
      }
    });

    expect(html).toContain('--sidebar-width: 320px;');
  });

  it('shows common viewer tool buttons even when no layer metadata is available', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain('id="fit-btn"');
    expect(html).toContain('id="zoom-in-btn"');
    expect(html).toContain('id="zoom-out-btn"');
    expect(html).toContain('--sidebar-width: 240px;');
    expect(html).not.toContain('id="all-layers-btn"');
  });

  it('renders OASLANA-18 compact viewer controls with the tools panel collapsed by default', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain('id="viewer-toolbar"');
    expect(html).toContain('id="side-panel-toggle"');
    expect(html).toContain('aria-controls="viewer-side-panel"');
    expect(html).toContain('id="viewer-side-panel"');
    expect(html).toContain('id="zoom-level"');
    expect(html).toContain('id="sheet-select"');
    expect(html).toContain('id="grid-toggle"');
    expect(html).toContain('id="theme-toggle"');
    expect(html).toContain('id="reference-search"');
    expect(html).toContain('id="export-menu"');
    expect(html).toContain('const exportMenuEl = document.getElementById');
    expect(html).toContain('function populateSheetSelect()');
    expect(html).toContain('payload.metadata?.sheets || []');
    expect(html).toContain('toolsPanelCollapsed: true');
    expect(html).toContain(
      'applyToolsPanelCollapsed(localState.toolsPanelCollapsed);'
    );
  });

  it('posts OASLANA-18 viewer state when the tools panel, grid, theme, or reference search changes', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_pcb',
      fileType: 'board',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: '',
      metadata: {
        layers: [{ name: 'F.Cu', kind: 'signal', visible: true }]
      }
    });

    expect(html).toContain('function setToolsPanelCollapsed(collapsed)');
    expect(html).toContain("sidePanelToggleBtn.addEventListener('click'");
    expect(html).toContain('localState = { ...localState, grid: nextGrid };');
    expect(html).toContain('applyViewerGridState(');
    expect(html).toContain('localState = { ...localState, theme: nextTheme };');
    expect(html).toContain('updateFallbackTheme();');
    expect(html).toContain('selectedReference: reference');
    expect(html).toContain('applyViewerSelectionState(');
    expect(html).toContain(
      "viewer.setAttribute('selected-reference', reference);"
    );
    expect(html).toContain("viewer.setAttribute('sheet', selectedSheet);");
    expect(html).toContain('postViewerState();');
    expect(html).toContain('function closeExportMenu()');
    expect(html).toContain('closeExportMenu();');
    expect(html).toContain('function isEditableShortcutTarget(target)');
    expect(html).toContain('if (isEditableShortcutTarget(ev.target))');
    expect(html).toContain("vscode.postMessage({ type: 'componentSelected'");
  });

  it('normalizes fallback SVG size from viewBox-aware dimensions', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_pcb',
      fileType: 'board',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain(
      "const viewBox = parseSvgViewBox(svgRoot.getAttribute('viewBox'));"
    );
    expect(html).toContain('const intrinsicWidth = viewBox?.width ?? width;');
    expect(html).toContain(
      'const intrinsicHeight = viewBox?.height ?? height;'
    );
    expect(html).toContain('function parseSvgViewBox(value) {');
    expect(html).toContain('.split(new RegExp(');
  });

  it('lets fallback fit upscale CLI SVGs whose viewBox is smaller than the viewport', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    const fitSection = html.slice(
      html.indexOf('function fitSvgFallback'),
      html.indexOf('function applyFallbackPresentation')
    );

    expect(fitSection).toContain('fallbackSvgFitScale = Math.min(');
    expect(fitSection).not.toMatch(
      /availableHeight \/ fallbackSvgSize\.height,\s*1\s*\)/
    );
  });

  it('includes worker-safe CSP and typed inline sources', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain("script-src  'nonce-");
    expect(html).toContain("style-src   'nonce-");
    expect(html).toContain('blob:;');
    expect(html).toContain('worker-src  blob: vscode-resource:;');
    expect(html).not.toContain('unsafe-inline');
    expect(html).not.toContain('unsafe-eval');
    expect(html).toContain('<style nonce="');
    expect(html).toContain("source.setAttribute('name', payload.fileName);");
    expect(html).toContain(
      "source.setAttribute('type', payload.fileType === 'board' ? 'board' : 'schematic');"
    );
  });

  it('emits a syntactically valid inline viewer bootstrap script', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_pcb',
      fileType: 'board',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      viewerCssUri: 'vscode-resource:/media/kicanvas/viewer.css',
      base64: 'Zm9v',
      disabledReason: ''
    });

    const scripts = Array.from(
      html.matchAll(
        /<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g
      ),
      (match) => (match[1] ?? '').trim()
    ).filter(Boolean);

    for (const script of scripts) {
      expect(() => new Script(script)).not.toThrow();
    }

    expect(scripts).toContain(
      compactHtmlDocument(createViewerControllerScript())
    );
  });

  it('normalizes minimal PCB inline text with fallback layer definitions', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_pcb',
      fileType: 'board',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain('const renderText = prepared.renderText;');
    expect(html).toContain('source.textContent = renderText;');
    expect(html).toContain('function normalizeKiCanvasText(text, fileType)');
    expect(html).toContain('(0 "F.Cu" signal)');
    expect(html).toContain('(31 "B.Cu" signal)');
    expect(html).toContain('(44 "Edge.Cuts" user)');
  });

  it('decodes and normalizes KiCanvas source in a web worker when available', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'sample.kicad_pcb',
      fileType: 'board',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain("showLoading('Decoding and normalizing file…');");
    expect(html).toContain(
      'prepared = await prepareKiCanvasText(payload.base64, payload.fileType);'
    );
    expect(html).toContain('const renderText = prepared.renderText;');
    expect(html).toContain(
      'function prepareKiCanvasTextInWorker(base64, fileType)'
    );
    expect(html).toContain('new Worker(workerUrl);');
    expect(html).toContain('URL.revokeObjectURL(workerUrl);');
    expect(html).toContain('function createKiCanvasPreparationWorker()');
  });

  it('renders hop-over overlay markers from schematic metadata', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'hop_over.kicad_sch',
      fileType: 'schematic',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: '',
      metadata: {
        hopOvers: [{ x: 70, y: 50 }]
      }
    });

    expect(html).toContain('const hopOverOverlay = document.getElementById');
    expect(html).toContain('function renderHopOverOverlay()');
    expect(html).toContain("marker.className = 'hop-over-marker';");
    expect(html).toContain('payload.metadata?.hopOvers || []');
    expect(html).toContain('renderHopOverOverlay();');
  });

  it('detects legacy KiCad 5 PCB files before attempting interactive render', () => {
    const html = createKiCanvasViewerHtml({
      title: 'Viewer',
      fileName: 'legacy.kicad_pcb',
      fileType: 'board',
      status: 'Opening interactive renderer...',
      cspSource: 'vscode-resource:',
      kicanvasUri: 'vscode-resource:/media/kicanvas/kicanvas.js',
      base64: 'Zm9v',
      disabledReason: ''
    });

    expect(html).toContain(
      'function isUnsupportedLegacyKiCadPcb(text, fileType)'
    );
    expect(html).toContain('KiCad 5 legacy module format');
    expect(html).toContain('KiCad 5 PCB format is not supported by KiCanvas');
    expect(html).toContain('module');
  });
});
