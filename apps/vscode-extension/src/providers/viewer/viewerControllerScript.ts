import { createViewerControllerRenderingScript } from './viewerControllerRenderingScript';
import { createViewerControllerSidebarScript } from './viewerControllerSidebarScript';
import { createViewerControllerFallbackScript } from './viewerControllerFallbackScript';
import { normalizeKiCad10NamedNetsForRenderer } from './kicad10NetCompatibility';

export function createViewerControllerScript(): string {
  return (
    String.raw`(function () {
    'use strict';

    // Renderer-only normalization; never write the source board.
    const normalizeKiCad10NamedNets = (${normalizeKiCad10NamedNetsForRenderer.toString()});
    const vscode = acquireVsCodeApi();
    const statusEl       = document.getElementById('viewer-status');
    const loadingEl      = document.getElementById('loading-overlay');
    const loadingDetail  = document.getElementById('loading-detail');
    const errorEl        = document.getElementById('error-overlay');
    const errorTitle     = document.getElementById('error-title');
    const errorMessage   = document.getElementById('error-message');
    const errorDetail    = document.getElementById('error-detail');
    const emptyEl        = document.getElementById('empty-overlay');
    const emptyTitleEl   = document.getElementById('empty-title');
    const emptyExplanationEl = document.getElementById('empty-explanation');
    const emptyGuidanceEl = document.getElementById('empty-guidance');
    const largePcbActionsEl = document.getElementById('large-pcb-actions');
    const largePcbRegionBtn = document.getElementById('large-pcb-region-btn');
    const largePcbOpenBtn = document.getElementById('large-pcb-open-btn');
    const defaultEmptyExplanation = emptyExplanationEl?.textContent || '';
    const defaultEmptyGuidance = emptyGuidanceEl?.textContent || '';
    const safePreviewEl  = document.getElementById('safe-preview');
    const viewerMount    = document.getElementById('viewer-mount');
    const hopOverOverlay = document.getElementById('hop-over-overlay');
    const layerListEl    = document.getElementById('layer-list');
    const layersSection  = document.getElementById('layers-section');
    const tuningListEl   = document.getElementById('tuning-list');
    const tuningSection  = document.getElementById('tuning-section');
    const notesListEl    = document.getElementById('notes-list');
    const notesSection   = document.getElementById('notes-section');
    const selectionSummaryEl = document.getElementById('selection-summary');
    const engineBadgeEl = document.getElementById('viewer-engine-badge');
    const engineSummaryEl = document.getElementById('engine-summary');
    const fitBtn = document.getElementById('fit-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const viewerToolbarEl = document.getElementById('viewer-toolbar');
    const toolbarToggleBtn = document.getElementById('viewer-toolbar-toggle');
    const exportMenuEl = document.getElementById('export-menu');
    const exportPngBtn = document.getElementById('export-png-btn');
    const exportSvgBtn = document.getElementById('export-svg-btn');
    const sidePanelToggleBtn = document.getElementById('side-panel-toggle');
    const zoomLevelEl = document.getElementById('zoom-level');
    const sheetSelectEl = document.getElementById('sheet-select');
    const gridToggleBtn = document.getElementById('grid-toggle');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const referenceSearchInput = document.getElementById('reference-search');
    const referenceSearchBtn = document.getElementById('reference-search-btn');
    const allLayersBtn = document.getElementById('all-layers-btn');
    const noneLayersBtn = document.getElementById('none-layers-btn');
    const copperLayersBtn = document.getElementById('copper-layers-btn');
    const layerNormalBtn = document.getElementById('layer-normal-btn');
    const layerDimBtn = document.getElementById('layer-dim-btn');
    const layerSoloBtn = document.getElementById('layer-solo-btn');
    const zoneFillsBtn = document.getElementById('zone-fills-btn');
    const layerHintEl = document.getElementById('layer-hint');
    const layerActionsEl = document.getElementById('layer-inspection-actions');
    const layerCountEl = document.getElementById('layer-count');
    const netsSectionEl = document.getElementById('nets-section');
    const netCountEl = document.getElementById('net-count');
    const netSearchEl = document.getElementById('net-search');
    const netSuggestionsEl = document.getElementById('net-suggestions');
    const netHighlightBtn = document.getElementById('net-highlight-btn');
    const netClearBtn = document.getElementById('net-clear-btn');
    const netFeedbackEl = document.getElementById('net-feedback');
    const partialSection = document.getElementById('partial-preview-section');
    const partialBanner = document.getElementById('partial-preview-banner');
    const partialPreviewBannerText = partialBanner?.textContent || '';
    const partialStatus = document.getElementById('partial-preview-status');
    const partialStartBtn = document.getElementById('partial-start-btn');
    const partialNextBtn = document.getElementById('partial-next-btn');
    let partialBusy = false;
    // The host can finish a native SVG after a new board/page has appeared.
    // Never apply an old result to the newer KiCanvas source.
    let displayedSourceRevision = 0;

    const payload = JSON.parse(
      document.getElementById('viewer-payload').textContent || '{}'
    );
    const ViewerEngines = {
      kicanvas: {
        label: 'KiCanvas',
        capabilities: {
          interactive: true,
          fit: true,
          zoom: true,
          exportPng: true,
          exportSvg: true,
          selection: true,
          layers: true
        }
      },
      'cli-svg-fallback': {
        label: 'CLI SVG fallback',
        capabilities: {
          interactive: false,
          fit: true,
          zoom: true,
          exportPng: true,
          exportSvg: true,
          selection: false,
          layers: false
        }
      },
      'metadata-only': {
        label: 'Metadata only',
        capabilities: {
          interactive: false,
          fit: false,
          zoom: false,
          exportPng: false,
          exportSvg: true,
          selection: false,
          layers: false
        }
      },
      failed: {
        label: 'Renderer failed',
        capabilities: {
          interactive: false,
          fit: false,
          zoom: false,
          exportPng: false,
          exportSvg: false,
          selection: false,
          layers: false
        }
      }
    };
    let keydownHandler = null;
    let fallbackSvgDataUrl = '';
    let fallbackSvgElement = null;
    let fallbackOriginalRegion = null;
    let fallbackSvgWrapper = null;
    let fallbackSvgStage = null;
    let fallbackSvgSize = null;
    let fallbackSvgFitScale = 1;
    let fallbackSvgScale = 1;
    let fallbackAutoFocus = false;
    let fallbackUserZoomed = false;
    let fallbackResizeHandler = null;
    let viewerGeneration = 0;
    let activeRefreshFrame = null;
    let cancelPendingPreparation = null;
    let netCatalog = [];
    let netCatalogRetries = 0;
    let highlightedNetName = '';
    let fittedCameraZoom = null;
    let sourceHasNamedNets = false;
    let rendererInitializing = false;
    let rendererFallbackAttempt = null;
    let rendererFallbackGeneration = 0;
    let rendererFallbackFailureDetail = '';
    let localState = {
      zoom: 1,
      grid: false,
      theme: payload.theme || 'kicad',
      toolsPanelCollapsed: true,
      toolbarCollapsed: false,
      selectedSheet: 'root',
      layerMode: 'normal',
      zoneFillsVisible: true,
      ...(payload.restoreState || {}),
      engine: payload.engine || createEngineState(payload.disabledReason ? 'metadata-only' : 'kicanvas', payload.disabledReason || undefined)
    };

    function t(message) {
      const translate = globalThis.kicadStudioL10n?.t;
      return typeof translate === 'function' ? translate(message) : message;
    }

    document.getElementById('reload-btn').addEventListener('click', () => initViewer());
    document.getElementById('open-kicad-btn').addEventListener('click', openInKiCad);
    document.getElementById('error-reload-btn').addEventListener('click', () => initViewer());
    document.getElementById('error-open-btn').addEventListener('click', openInKiCad);
    exportPngBtn.addEventListener('click', () => {
      closeExportMenu();
      exportPng();
    });
    exportSvgBtn.addEventListener('click', () => {
      closeExportMenu();
      exportSvg();
    });
    fitBtn.addEventListener('click', fitCurrentViewer);
    zoomInBtn.addEventListener('click', () => zoomCurrentViewer(1));
    zoomOutBtn.addEventListener('click', () => zoomCurrentViewer(-1));
    sidePanelToggleBtn.addEventListener('click', () => setToolsPanelCollapsed(!localState.toolsPanelCollapsed));
    toolbarToggleBtn.addEventListener('click', () => {
      localState = { ...localState, toolbarCollapsed: !localState.toolbarCollapsed };
      applyToolbarCollapsed();
      postViewerState();
    });
    sheetSelectEl.addEventListener('change', () => {
      localState = { ...localState, selectedSheet: sheetSelectEl.value };
      applyViewerSelectionState(viewerMount.querySelector('kicanvas-embed'));
      postViewerState();
    });
    gridToggleBtn.addEventListener('click', () => {
      const nextGrid = !localState.grid;
      localState = { ...localState, grid: nextGrid };
      updateGridToggle();
      postViewerState();
    });
    themeToggleBtn.addEventListener('click', () => {
      const nextTheme = localState.theme === 'light' ? 'kicad' : 'light';
      payload.theme = nextTheme;
      localState = { ...localState, theme: nextTheme };
      const viewer = viewerMount.querySelector('kicanvas-embed');
      if (viewer) {
        viewer.setAttribute('theme', nextTheme);
        applyRendererTheme(viewer, nextTheme);
      } else {
        payload.fallbackBackground = '';
        updateFallbackTheme();
      }
      updateThemeToggle();
      postViewerState();
    });
    referenceSearchBtn.addEventListener('click', selectReferenceFromSearch);
    referenceSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        selectReferenceFromSearch();
      }
    });
    allLayersBtn?.addEventListener('click', () => setAllLayers(true));
    noneLayersBtn?.addEventListener('click', () => setAllLayers(false));
    copperLayersBtn?.addEventListener('click', () => setCopperOnly());
    layerNormalBtn?.addEventListener('click', () => setLayerMode('normal'));
    layerDimBtn?.addEventListener('click', () => setLayerMode('dim'));
    layerSoloBtn?.addEventListener('click', () => setLayerMode('solo'));
    zoneFillsBtn?.addEventListener('click', () => setZoneFillsVisible(localState.zoneFillsVisible === false));
    netHighlightBtn?.addEventListener('click', highlightSearchedNet);
    netClearBtn?.addEventListener('click', clearNetHighlight);
    netSearchEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        highlightSearchedNet();
      }
    });
    netSearchEl?.addEventListener('input', refreshNetSuggestions);
    partialStartBtn?.addEventListener('click', () => requestPartialPreview('start'));
    partialNextBtn?.addEventListener('click', () => requestPartialPreview('next'));
    largePcbRegionBtn?.addEventListener('click', () => {
      if (!partialSection || partialSection.hidden) return;
      setToolsPanelCollapsed(false);
      partialSection.scrollIntoView({ block: 'nearest' });
      requestPartialPreview('start');
    });
    largePcbOpenBtn?.addEventListener('click', openInKiCad);
    populateSheetSelect();
    renderSidebar();
    updateEngineUi(localState.engine);
    applyToolsPanelCollapsed(localState.toolsPanelCollapsed);
    applyToolbarCollapsed();
    updateZoomLevel();
    updateGridToggle();
    updateThemeToggle();
    updatePartialPreviewUi();


    function applyToolbarCollapsed() {
      const collapsed = Boolean(localState.toolbarCollapsed);
      viewerToolbarEl.hidden = collapsed;
      toolbarToggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toolbarToggleBtn.setAttribute('aria-label', collapsed ? t('Show tools') : t('Hide tools'));
      toolbarToggleBtn.textContent = collapsed ? t('Show tools') : t('Hide tools');
      toolbarToggleBtn.title = collapsed ? t('Show viewer toolbar') : t('Hide viewer toolbar');
      if (collapsed) closeExportMenu();
    }

    function updatePartialPreviewUi() {
      if (!partialSection) return;
      const summary = payload.partialPreview;
      const large = payload.fileType === 'board' &&
        String(payload.disabledReason || '').includes('Interactive render is disabled');
      partialSection.hidden = !summary && !large;
      if (partialBanner) {
        partialBanner.hidden = !summary;
        // A Reload returns from the full native plot to the bounded preview.
        partialBanner.textContent = partialPreviewBannerText;
      }
      if (partialStatus && summary) {
        const missing = summary.remaining || {};
        const bounds = summary.viewport || {};
        partialStatus.textContent = 'PARTIAL — X ' + bounds.minX + '–' + bounds.maxX +
          ', Y ' + bounds.minY + '–' + bounds.maxY +
          ' mm. Not loaded in this region: ' +
          (missing.segment || 0) + ' segments, ' +
          (missing.via || 0) + ' vias, ' +
          (missing.arc || 0) + ' copper arcs, ' +
          (missing.footprint || 0) + ' footprints. Zones omitted. Net continuity unverified. No engineering/export certainty.';
      }
      setControlDisabled(partialStartBtn, partialBusy);
      setControlDisabled(largePcbRegionBtn, partialBusy);
      setControlDisabled(partialNextBtn, partialBusy || !summary?.hasNextPage);
    }

    function requestPartialPreview(action) {
      if (partialBusy || !partialSection || partialSection.hidden) return;
      let bounds;
      if (action === 'start') {
        const ids = ['partial-x-min', 'partial-x-max', 'partial-y-min', 'partial-y-max'];
        const entries = ids.map((id) => document.getElementById(id)?.value.trim() || '');
        if (entries.some(Boolean) && !entries.every(Boolean)) {
          if (partialStatus) partialStatus.textContent = 'Enter all four region coordinates or leave all empty for automatic selection.';
          return;
        }
        if (entries.every(Boolean)) {
          const numbers = entries.map(Number);
          if (!numbers.every(Number.isFinite)) {
            if (partialStatus) partialStatus.textContent = 'Region coordinates must be finite numbers.';
            return;
          }
          bounds = { minX: numbers[0], maxX: numbers[1], minY: numbers[2], maxY: numbers[3] };
        }
      }
      partialBusy = true;
      updatePartialPreviewUi();
      if (partialStatus) partialStatus.textContent = 'Preparing an incomplete, bounded source preview…';
      vscode.postMessage({
        type: 'requestPartialPreview',
        payload: { action, ...(bounds ? { bounds } : {}) }
      });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'load' || msg.type === 'refresh') {
        if (msg.payload && msg.payload.base64 !== undefined) {
          displayedSourceRevision += 1;
          payload.base64         = msg.payload.base64;
          payload.disabledReason = msg.payload.disabledReason || '';
          payload.fileName       = msg.payload.fileName || payload.fileName;
          payload.theme          = msg.payload.theme || payload.theme;
          payload.fallbackBackground =
            typeof msg.payload.fallbackBackground === 'string'
              ? msg.payload.fallbackBackground
              : payload.fallbackBackground;
          payload.restoreState   = msg.payload.restoreState || payload.restoreState;
          payload.engine         = msg.payload.engine || payload.engine;
          payload.metadata       = msg.payload.metadata || undefined;
          payload.partialPreview = msg.payload.partialPreview || null;
          partialBusy = false;
          updatePartialPreviewUi();
          localState             = {
            ...localState,
            theme: payload.theme || localState.theme,
            ...(payload.restoreState || {}),
            engine: payload.engine || localState.engine
          };
          populateSheetSelect();
          applyToolsPanelCollapsed(localState.toolsPanelCollapsed);
    applyToolbarCollapsed();
          updateZoomLevel();
          updateGridToggle();
          updateThemeToggle();
        }
        void initViewer(msg.type === 'refresh');
      }
      if (msg.type === 'partialPreviewError') {
        partialBusy = false;
        updatePartialPreviewUi();
        if (partialStatus) partialStatus.textContent = String(msg.payload?.message || 'Partial preview failed.');
      }
      if (msg.type === 'setTheme') {
        payload.theme = msg.payload?.theme || payload.theme;
        payload.fallbackBackground =
          typeof msg.payload?.fallbackBackground === 'string'
            ? msg.payload.fallbackBackground
            : payload.fallbackBackground;
        payload.restoreState = msg.payload?.restoreState || payload.restoreState;
        localState = {
          ...localState,
          theme: payload.theme || localState.theme,
          ...(payload.restoreState || {})
        };
        applyToolsPanelCollapsed(localState.toolsPanelCollapsed);
    applyToolbarCollapsed();
        updateZoomLevel();
        updateGridToggle();
        updateThemeToggle();
        void initViewer();
      }
      if (msg.type === 'setMetadata') {
        payload.metadata = msg.payload || payload.metadata;
        populateSheetSelect();
        applyViewerSelectionState(viewerMount.querySelector('kicanvas-embed'));
        renderSidebar();
        renderHopOverOverlay();
        if (payload.fileType === 'board' && localState.engine?.kind === 'kicanvas') {
          initializeNetInspector(viewerMount.querySelector('kicanvas-embed'));
        }
      }
    });

    window.addEventListener('error', (ev) => {
      handleRendererRuntimeFailure('Script error', ev.message || 'Unknown error');
    });
    window.addEventListener('unhandledrejection', (ev) => {
      const reason = ev.reason instanceof Error ? ev.reason.message : String(ev.reason || 'Unknown');
      handleRendererRuntimeFailure('Runtime error', reason);
    });

    // Only one WebGL renderer exists at a time. A short-lived, bounded
    // canvas keeps the last rendered frame visible during a file update.
    function capturePreviousFrame(viewer) {
      try {
        const surface = findRenderSurfaces(viewer)
          .filter((item) => item instanceof HTMLCanvasElement && item.width && item.height)
          .sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (!surface) return null;
        const rect = viewer.getBoundingClientRect();
        const width = Math.min(1280, Math.floor(rect.width));
        const height = Math.min(720, Math.floor(rect.height));
        if (width <= 0 || height <= 0) return null;
        const frame = document.createElement('canvas');
        frame.width = width;
        frame.height = height;
        frame.className = 'viewer-last-good-frame';
        frame.setAttribute('role', 'img');
        frame.setAttribute('aria-label', 'Previous drawing — updating preview');
        const ctx = frame.getContext('2d', { alpha: false });
        if (!ctx) return null;
        ctx.drawImage(surface, 0, 0, width, height);
        return frame;
      } catch {
        // Some WebGL drivers deny readback. Never retain a full-sized buffer.
        return null;
      }
    }

    void initViewer();
    async function initViewer(isSourceRefresh = false) {
      const generation = ++viewerGeneration;
      const previousViewer = viewerMount.querySelector('kicanvas-embed');
      const visiblePrevious = Boolean(
        previousViewer && !viewerMount.classList.contains('is-hidden')
      );
      const heldFrame = activeRefreshFrame?.isConnected ? activeRefreshFrame : null;
      const preserve = Boolean(
        isSourceRefresh && (visiblePrevious || heldFrame) &&
        document.visibilityState !== 'hidden' &&
        !payload.disabledReason && payload.base64 &&
        payload.base64.length <= 2 * 1024 * 1024
      );
      // A newer save can arrive between old-frame capture and first paint.
      // Reuse the same bounded snapshot rather than allocating another.
      if (!preserve) {
        activeRefreshFrame?.remove();
        activeRefreshFrame = null;
      }
      let previousFrame = preserve ? heldFrame : null;
      const progress = (detail) => {
        if (preserve) {
          setStatus('Updating preview… ' + detail);
        } else {
          showLoading(detail);
        }
      };
      const showStale = (reason) => {
        if (!preserve || generation !== viewerGeneration) return false;
        const originalVisible = Boolean(
          visiblePrevious && previousViewer?.isConnected &&
          !viewerMount.classList.contains('is-hidden')
        );
        const frameVisible = Boolean(previousFrame?.isConnected);
        if (!originalVisible && !frameVisible) return false;
        rendererInitializing = false;
        setViewerSurfaceVisible(originalVisible);
        hideAll();
        const kind = originalVisible ? 'previous preview' : 'previous snapshot';
        if (frameVisible) previousFrame.setAttribute('aria-label', 'Previous drawing — update failed, source may have changed');
        setStatus('⚠ Update failed — showing ' + kind + '. ' + String(reason).slice(0, 150));
        return true;
      };
      // Reload can be local (no host refresh message). The native SVG is no
      // longer the displayed surface, so restore the bounded-source warning.
      if (partialBanner && payload.partialPreview) {
        partialBanner.textContent = partialPreviewBannerText;
      }
      // Preparing a large PCB can outlast a refresh. Stop the superseded worker
      // immediately rather than decoding a stale board while the new one loads.
      cancelPendingPreparation?.();
      rendererInitializing = true;
      fittedCameraZoom = null;
      sourceHasNamedNets = false;
      netCatalogRetries = 0;
      rendererFallbackAttempt = null;
      rendererFallbackGeneration = generation;
      rendererFallbackFailureDetail = '';
      if (!preserve) {
        clearKeyboardShortcuts();
        clearFallbackResizeHandler();
      }
      fallbackSvgDataUrl = '';
      fallbackSvgElement = null;
      fallbackOriginalRegion = null;
      fallbackSvgWrapper = null;
      fallbackSvgStage = null;
      fallbackSvgSize = null;
      fallbackSvgFitScale = 1;
      fallbackSvgScale = 1;
      fallbackAutoFocus = false;
      fallbackUserZoomed = false;
      if (!preserve && viewerMount.querySelector('kicanvas-embed')) {
        // The bundled WebGL viewer may have an already-scheduled on_draw.
        // Allow that frame to complete while its GL context is still alive,
        // before detaching the old embed and disposing its renderer.
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        if (generation !== viewerGeneration) return;
      }
      if (preserve) {
        progress('Preparing latest source…');
      } else {
        viewerMount.replaceChildren();
        clearHopOverOverlay();
        setViewerSurfaceVisible(false);
        hideAll();
        showLoading('Waiting for KiCanvas…');
        setEngineUiState('kicanvas');
        resetNetInspector();
      }

      try {
        if (payload.disabledReason) {
          const isOversizedPcb = payload.fileType === 'board' &&
            payload.disabledReason.includes('Interactive render is disabled');
          setEngineState('metadata-only', payload.disabledReason);
          showEmpty(
            payload.disabledReason, '',
            isOversizedPcb ? 'Large PCB — preview paused' : undefined,
            isOversizedPcb
          );
          return;
        }

        if (!payload.base64) {
          showError(
            'No file data',
            'The file content was not embedded in the viewer payload.',
            'This usually means the file is too large for inline rendering.'
          );
          return;
        }

        let prepared;
        try {
          progress('Decoding and normalizing file…');
          prepared = await prepareKiCanvasText(payload.base64, payload.fileType, generation);
          if (generation !== viewerGeneration || !prepared) return;
        } catch (err) {
          if (generation !== viewerGeneration) return;
          if (!showStale('Source decoding failed.')) {
            showError('Decode error', String(err), 'Could not decode the base64 file payload.');
          }
          return;
        }
        const text = prepared.text;
        sourceHasNamedNets = payload.fileType === 'board' &&
          /[(]net\s+(?:[1-9][0-9]*\s+)?"[^"]+"/.test(text);

        if (isUnsupportedLegacyKiCadPcb(text, payload.fileType)) {
          if (showStale('Updated PCB uses an unsupported legacy file format.')) return;
          showEmpty(
            'This PCB uses KiCad 5 legacy module format. KiCanvas may render tracks but cannot reliably render legacy footprints and pads. Open the board in KiCad 6 or newer, save it once to convert the file, then reopen it here.',
            text.slice(0, 3000),
            'KiCad 5 PCB format is not supported by KiCanvas'
          );
          return;
        }

        const probablyEmpty = !hasDrawableObjects(text, payload.fileType);

        progress('Waiting for renderer…');
        await waitForDefinition('kicanvas-embed', 8000);
        if (generation !== viewerGeneration) return;
        await waitForDefinition('kicanvas-source', 8000);
        if (generation !== viewerGeneration) return;

        progress('Mounting viewer…');
        const renderText = prepared.renderText;

        const viewer = document.createElement('kicanvas-embed');
        viewer.setAttribute('controls',     'basic');
        viewer.setAttribute('controlslist', 'nodownload nooverlay nofullscreen noflipview');
        viewer.setAttribute('theme',        payload.theme || 'kicad');

        const source = document.createElement('kicanvas-source');
        source.setAttribute('name', payload.fileName);
        source.setAttribute('type', payload.fileType === 'board' ? 'board' : 'schematic');
        source.textContent = renderText;

        viewer.appendChild(source);
        if (preserve) {
          if (!previousFrame && visiblePrevious) {
            previousFrame = capturePreviousFrame(previousViewer);
          }
          viewerMount.replaceChildren();
          if (previousFrame && !previousFrame.isConnected) {
            viewerMount.parentElement?.appendChild(previousFrame);
          }
          activeRefreshFrame = previousFrame;
          setViewerSurfaceVisible(false);
          clearKeyboardShortcuts();
          clearFallbackResizeHandler();
          clearHopOverOverlay();
          resetNetInspector();
          // Release the old GL context and its scheduled draw before mounting
          // the replacement. At most one live WebGL renderer is retained.
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (generation !== viewerGeneration) return;
          viewerMount.appendChild(viewer);
        } else {
          viewerMount.replaceChildren(viewer);
        }

        progress('Rendering latest revision…');
        await waitForViewerLoaded(viewer, 15000);
        if (generation !== viewerGeneration) return;

        // The bundled schematic app can finish loading with a zero-sized
        // canvas in a VS Code webview even while the containing embed is full
        // size. Repair only that known layout before declaring KiCanvas blank.
        repairSchematicCanvasLayout(viewer);
        const renderSurface = await waitForRenderableSurface(viewer, 2000);
        if (generation !== viewerGeneration) return;
        if (!renderSurface) {
          if (showStale('The updated renderer did not produce a drawing.')) return;
          const fallbackLoaded = await recoverRendererFailure(
            'KiCanvas reported success but did not create a drawable render surface.',
            generation
          );
          if (fallbackLoaded) {
            return;
          }
          if (probablyEmpty) {
            setEngineState('metadata-only', 'No drawable objects were detected.');
            showEmpty(
              payload.fileType === 'board'
                ? 'This PCB file is structurally valid but currently only contains the board document skeleton.'
                : 'This schematic file is structurally valid but currently only contains the document skeleton.',
              text.slice(0, 3000),
              'No drawable objects yet'
            );
            return;
          }
          throw new Error(
            'KiCanvas reported success but did not create a canvas or SVG render surface.'
          );
        }

        if (renderSurface.tagName.toLowerCase() === 'canvas') {
          // Bundled KiCanvas draws inside nested Shadow DOM. Its board canvas
          // otherwise retains the browser default 300x150 box in VS Code,
          // exposing a bright unpainted surface around the actual PCB.
          // Only repair layout for the known board-viewer host; the renderer
          // retains ownership of GPU resources and pixel dimensions.
          const boardHost = renderSurface.getRootNode()?.host;
          if (boardHost?.tagName?.toLowerCase() === 'kc-board-viewer') {
            boardHost.style.flex = '1 1 auto';
            boardHost.style.height = '100%';
            boardHost.style.minHeight = '0';
            renderSurface.style.display = 'block';
            renderSurface.style.width = '100%';
            renderSurface.style.height = '100%';
          }
          let blankCanvas = await isCanvasEffectivelyBlank(renderSurface);
          if (generation !== viewerGeneration) return;
          if (blankCanvas) {
            // Some Windows/Electron renderers report a loaded KiCanvas before
            // its first painted frame. Fit the board and allow a bounded paint
            // interval before classifying the surface as genuinely blank.
            // A persistently blank canvas must still enter the SVG fallback.
            viewer.fitToScreen?.();
            if (payload.fileType === 'board' && hasDrawableBoardOutline(viewer)) {
              try {
                getKiCanvasViewer(viewer)?.zoom_to_board?.();
              } catch {
                // Older KiCanvas builds may lack the optional camera API.
              }
            }
            const paintDeadline = Date.now() + 1600;
            while (blankCanvas && generation === viewerGeneration && Date.now() < paintDeadline) {
              await new Promise((resolve) => window.setTimeout(resolve, 180));
              blankCanvas = await isCanvasEffectivelyBlank(renderSurface);
            }
            if (generation !== viewerGeneration) return;
          }
          if (blankCanvas) {
            if (showStale('The updated drawing remained blank.')) return;
            const fallbackLoaded = await recoverRendererFailure(
              'KiCanvas created a blank render surface for this file.',
              generation
            );
            if (fallbackLoaded) {
              return;
            }
            if (probablyEmpty) {
              setEngineState('metadata-only', 'No drawable objects were detected.');
              showEmpty(
                payload.fileType === 'board'
                  ? 'This PCB file is structurally valid but currently only contains the board document skeleton.'
                  : 'This schematic file is structurally valid but currently only contains the document skeleton.',
                text.slice(0, 3000),
                'No drawable objects yet'
              );
              return;
            }
            throw new Error('KiCanvas created a blank render surface for this file.');
          }
        }

        // ── 6. Success ────────────────────────────────────────────────────────
        // KiCanvas can report its render surface before its embed has a laid-out
        // viewport. Allow layout to settle before using the supported fit API.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (generation !== viewerGeneration) return;
        viewer.fitToScreen?.();
        if (payload.fileType === 'board' && hasDrawableBoardOutline(viewer)) {
          try {
            getKiCanvasViewer(viewer)?.zoom_to_board?.();
          } catch {
            // Bundled renderer versions without this optional API retain Fit.
          }
        }
        applyViewerState(viewer);
        applyLayerVisibility(viewer);
        const initialCamera = getKiCanvasViewer(viewer)?.viewport?.camera;
        if (Number.isFinite(initialCamera?.zoom) && initialCamera.zoom > 0) {
          fittedCameraZoom = initialCamera.zoom;
          localState = { ...localState, zoom: 1 };
          updateZoomLevel();
          postViewerState();
        }
        installSelectionTracking(viewer);
        setViewerSurfaceVisible(true);
        previousFrame?.remove();
        if (activeRefreshFrame === previousFrame) activeRefreshFrame = null;
        previousFrame = null;
        renderHopOverOverlay();
        hideAll();
        installKeyboardShortcuts(viewer);
        rendererInitializing = false;
        setEngineState('kicanvas');
        initializeNetInspector(viewer);
        setStatus('Interactive renderer loaded: ' + payload.fileName);
        vscode.postMessage({ type: 'ready', payload: { fileName: payload.fileName } });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err || 'Unknown error');
        if (showStale(message)) return;
        const fallbackLoaded = await recoverRendererFailure(message, generation);
        if (fallbackLoaded || generation !== viewerGeneration) {
          return;
        }
        showFinalRendererFailure(
          'Viewer failed to load',
          message,
          rendererFallbackFailureDetail
        );
      }
    }

    function handleRendererRuntimeFailure(title, reason) {
      // Disposing the previous WebGL context can dispatch an asynchronous
      // global error during a valid, snapshotted refresh. The awaited new
      // renderer performs its own load/paint validation and fallback; starting
      // a competing SVG recovery here would open a blocking loading overlay.
      if (rendererInitializing && activeRefreshFrame?.isConnected) return;
      if (!rendererInitializing || localState.engine?.kind !== 'kicanvas') {
        showError(title, reason, '');
        return;
      }
      const generation = viewerGeneration;
      void recoverRendererFailure(reason, generation).then((fallbackLoaded) => {
        if (!fallbackLoaded && generation === viewerGeneration) {
          showFinalRendererFailure(title, reason, rendererFallbackFailureDetail);
        }
      });
    }

    function recoverRendererFailure(reason, generation) {
      if (generation !== viewerGeneration) {
        return Promise.resolve(false);
      }
      if (rendererFallbackAttempt && rendererFallbackGeneration === generation) {
        return rendererFallbackAttempt;
      }
      rendererFallbackGeneration = generation;
      rendererFallbackAttempt = (async () => {
        try {
          return await trySvgFallback(reason, generation);
        } catch (fallbackError) {
          if (generation === viewerGeneration) {
            const fallbackMessage =
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError || 'Unknown fallback error');
            rendererFallbackFailureDetail =
              'CLI SVG fallback also failed: ' + fallbackMessage;
          }
          return false;
        }
      })();
      return rendererFallbackAttempt;
    }

    function showFinalRendererFailure(title, reason, fallbackDetail) {
      rendererInitializing = false;
      setEngineState('failed', reason);
      showError(
        title,
        reason,
        (fallbackDetail || 'CLI SVG fallback was unavailable.') +
          ' Open the file in KiCad to continue.'
      );
    }

` +
    createViewerControllerRenderingScript() +
    createViewerControllerSidebarScript() +
    createViewerControllerFallbackScript()
  );
}
