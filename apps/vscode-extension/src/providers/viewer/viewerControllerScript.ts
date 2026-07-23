export function createViewerControllerScript(): string {
  return String.raw`(function () {
    'use strict';

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
      }
    };
    let keydownHandler = null;
    let fallbackSvgDataUrl = '';
    let fallbackSvgElement = null;
    let fallbackSvgWrapper = null;
    let fallbackSvgStage = null;
    let fallbackSvgSize = null;
    let fallbackSvgFitScale = 1;
    let fallbackSvgScale = 1;
    let fallbackResizeHandler = null;
    let localState = {
      zoom: 1,
      grid: false,
      theme: payload.theme || 'kicad',
      toolsPanelCollapsed: true,
      selectedSheet: 'root',
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
    populateSheetSelect();
    renderSidebar();
    updateEngineUi(localState.engine);
    applyToolsPanelCollapsed(localState.toolsPanelCollapsed);
    updateZoomLevel();
    updateGridToggle();
    updateThemeToggle();

    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'load' || msg.type === 'refresh') {
        if (msg.payload && msg.payload.base64 !== undefined) {
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
          localState             = {
            ...localState,
            theme: payload.theme || localState.theme,
            ...(payload.restoreState || {}),
            engine: payload.engine || localState.engine
          };
          populateSheetSelect();
          applyToolsPanelCollapsed(localState.toolsPanelCollapsed);
          updateZoomLevel();
          updateGridToggle();
          updateThemeToggle();
        }
        void initViewer();
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
      }
    });

    window.addEventListener('error', (ev) => {
      showError('Script error', ev.message || 'Unknown error', '');
    });
    window.addEventListener('unhandledrejection', (ev) => {
      const reason = ev.reason instanceof Error ? ev.reason.message : String(ev.reason || 'Unknown');
      showError('Runtime error', reason, '');
    });

    void initViewer();
    async function initViewer() {
      clearKeyboardShortcuts();
      clearFallbackResizeHandler();
      fallbackSvgDataUrl = '';
      fallbackSvgElement = null;
      fallbackSvgWrapper = null;
      fallbackSvgStage = null;
      fallbackSvgSize = null;
      fallbackSvgFitScale = 1;
      fallbackSvgScale = 1;
      viewerMount.replaceChildren();
      clearHopOverOverlay();
      setViewerSurfaceVisible(false);
      hideAll();
      showLoading('Waiting for KiCanvas…');
      setEngineUiState('kicanvas');

      try {
        if (payload.disabledReason) {
          setEngineState('metadata-only', payload.disabledReason);
          showEmpty(payload.disabledReason, '');
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
          showLoading('Decoding and normalizing file…');
          prepared = await prepareKiCanvasText(payload.base64, payload.fileType);
        } catch (err) {
          showError('Decode error', String(err), 'Could not decode the base64 file payload.');
          return;
        }
        const text = prepared.text;

        if (isUnsupportedLegacyKiCadPcb(text, payload.fileType)) {
          showEmpty(
            'This PCB uses KiCad 5 legacy module format. KiCanvas may render tracks but cannot reliably render legacy footprints and pads. Open the board in KiCad 6 or newer, save it once to convert the file, then reopen it here.',
            text.slice(0, 3000),
            'KiCad 5 PCB format is not supported by KiCanvas'
          );
          return;
        }

        const probablyEmpty = !hasDrawableObjects(text, payload.fileType);

        showLoading('Waiting for KiCanvas element definitions…');
        await waitForDefinition('kicanvas-embed', 8000);
        await waitForDefinition('kicanvas-source', 8000);

        showLoading('Mounting viewer…');
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
        viewerMount.replaceChildren(viewer);

        showLoading('Rendering ' + escapeHtml(payload.fileName) + '…');
        await waitForViewerLoaded(viewer, 15000);

        const renderSurface = await waitForRenderableSurface(viewerMount, 2000);
        if (!renderSurface) {
          const fallbackLoaded = await trySvgFallback(
            'KiCanvas reported success but did not create a drawable render surface.'
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
          const blankCanvas = await isCanvasEffectivelyBlank(renderSurface);
          if (blankCanvas) {
            const fallbackLoaded = await trySvgFallback(
              'KiCanvas created a blank render surface for this file.'
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
        viewer.fitToScreen?.();
        applyLayerVisibility(viewer);
        applyViewerState(viewer);
        installSelectionTracking(viewer);
        setViewerSurfaceVisible(true);
        renderHopOverOverlay();
        hideAll();
        installKeyboardShortcuts(viewer);
        setEngineState('kicanvas');
        setStatus('Interactive renderer loaded: ' + payload.fileName);
        vscode.postMessage({ type: 'ready', payload: { fileName: payload.fileName } });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err || 'Unknown error');
        showError('Viewer failed to load', message, '');
      }
    }

    function waitForDefinition(tagName, timeoutMs) {
      return Promise.race([
        customElements.whenDefined(tagName),
        new Promise((_, reject) =>
          window.setTimeout(
            () => reject(new Error(
              'KiCanvas custom element "' + tagName + '" was not registered within ' +
              (timeoutMs / 1000) + 's. ' +
              'The kicanvas.js bundle may not have loaded correctly — check the browser console.'
            )),
            timeoutMs
          )
        )
      ]);
    }

    function waitForViewerLoaded(viewer, timeoutMs) {
      return new Promise((resolve, reject) => {
        if (viewer.loaded === true || viewer.getAttribute('loaded') !== null) {
          resolve(undefined);
          return;
        }

        const deadline = window.setTimeout(() => {
          clearInterval(poll);
          reject(new Error(
            'KiCanvas did not finish rendering "' + payload.fileName + '" within ' +
            (timeoutMs / 1000) + 's. The file may be empty or the renderer failed silently.'
          ));
        }, timeoutMs);

        const poll = window.setInterval(() => {
          if (viewer.loaded === true || viewer.getAttribute('loaded') !== null) {
            window.clearInterval(poll);
            window.clearTimeout(deadline);
            resolve(undefined);
          }
        }, 120);
      });
    }

    function waitForRenderableSurface(container, timeoutMs) {
      return new Promise((resolve) => {
        const startedAt = Date.now();
        const pickSurface = () => {
          const canvases = Array.from(container.querySelectorAll('canvas'))
            .filter((entry) => entry.width > 0 && entry.height > 0)
            .sort((left, right) => (right.width * right.height) - (left.width * left.height));
          if (canvases[0]) {
            return canvases[0];
          }
          return Array.from(container.querySelectorAll('svg')).find(
            (entry) => entry.clientWidth > 0 && entry.clientHeight > 0
          );
        };

        const finish = (value) => {
          observer.disconnect();
          window.clearInterval(poll);
          resolve(value);
        };

        const observer = new MutationObserver(() => {
          const surface = pickSurface();
          if (surface) {
            finish(surface);
          }
        });

        observer.observe(container, { childList: true, subtree: true });
        const poll = window.setInterval(() => {
          const surface = pickSurface();
          if (surface) {
            finish(surface);
            return;
          }
          if (Date.now() - startedAt >= timeoutMs) {
            finish(undefined);
          }
        }, 120);
      });
    }

    async function isCanvasEffectivelyBlank(canvas) {
      try {
        const probe = document.createElement('canvas');
        probe.width = 96;
        probe.height = 96;
        const context = probe.getContext('2d', { willReadFrequently: true });
        if (!context) {
          return false;
        }

        context.drawImage(canvas, 0, 0, probe.width, probe.height);
        const imageData = context.getImageData(0, 0, probe.width, probe.height).data;
        const buckets = new Map();
        let opaquePixels = 0;

        for (let index = 0; index < imageData.length; index += 4) {
          const alpha = imageData[index + 3];
          if (alpha < 8) {
            continue;
          }
          opaquePixels += 1;
          const key = [
            imageData[index] >> 4,
            imageData[index + 1] >> 4,
            imageData[index + 2] >> 4,
            alpha >> 4
          ].join(':');
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }

        if (!opaquePixels) {
          return true;
        }

        const dominantBucket = Math.max(...buckets.values());
        const nonDominantPixels = opaquePixels - dominantBucket;
        return buckets.size <= 2 && nonDominantPixels < 24;
      } catch {
        return false;
      }
    }

    function hasDrawableObjects(text, fileType) {
      if (fileType === 'board') {
        return new RegExp(
          '[(]\\s*(?:footprint|segment|via|zone|gr_line|gr_arc|gr_circle|gr_rect|gr_poly|gr_curve|gr_text|dimension|target|rule_area|board_stackup|stackup|embedded_fonts)\\b'
        ).test(text);
      }
      return (
        new RegExp(
          '[(]\\s*(?:symbol|wire|junction|no_connect|label|global_label|hierarchical_label|sheet|bus|bus_entry|polyline|rectangle|circle|arc|text|image|netclass_flag|directive_label)\\b'
        ).test(text) ||
        new RegExp('[(]\\s*lib_symbols\\b[\\s\\S]*?[(]\\s*symbol\\b').test(text)
      );
    }

    function isUnsupportedLegacyKiCadPcb(text, fileType) {
      if (fileType !== 'board') return false;

      const versionMatch = text.match(new RegExp('[(]\\s*kicad_pcb\\s+[(]\\s*version\\s+(\\d+)'));
      const version = versionMatch ? Number(versionMatch[1]) : 0;

      return version < 20210000 && new RegExp('[(]\\\\s*module\\\\b').test(text);
    }

    function normalizeKiCanvasText(text, fileType) {
      if (fileType !== 'board' || new RegExp('[(]\\s*layers\\b').test(text)) return text;

      const fallbackLayers = [
        '  (layers',
        '    (0 "F.Cu" signal)',
        '    (31 "B.Cu" signal)',
        '    (32 "B.Adhes" user "B.Adhesive")',
        '    (33 "F.Adhes" user "F.Adhesive")',
        '    (34 "B.Paste" user)',
        '    (35 "F.Paste" user)',
        '    (36 "B.SilkS" user "B.Silkscreen")',
        '    (37 "F.SilkS" user "F.Silkscreen")',
        '    (38 "B.Mask" user)',
        '    (39 "F.Mask" user)',
        '    (40 "Dwgs.User" user "User.Drawings")',
        '    (41 "Cmts.User" user "User.Comments")',
        '    (42 "Eco1.User" user "User.Eco1")',
        '    (43 "Eco2.User" user "User.Eco2")',
        '    (44 "Edge.Cuts" user)',
        '    (45 "Margin" user)',
        '    (46 "B.CrtYd" user "B.Courtyard")',
        '    (47 "F.CrtYd" user "F.Courtyard")',
        '    (48 "B.Fab" user)',
        '    (49 "F.Fab" user)',
        '    (50 "User.1" user)',
        '    (51 "User.2" user)',
        '    (52 "User.3" user)',
        '    (53 "User.4" user)',
        '    (54 "User.5" user)',
        '    (55 "User.6" user)',
        '    (56 "User.7" user)',
        '    (57 "User.8" user)',
        '    (58 "User.9" user)',
        '  )'
      ].join('\n');

      return text.replace(
        new RegExp('^\\s*[(]\\s*kicad_pcb\\b'),
        '(kicad_pcb\n' + fallbackLayers
      );
    }

    async function prepareKiCanvasText(base64, fileType) {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
        const text = decodeBase64Utf8(base64);
        return {
          text,
          renderText: normalizeKiCanvasText(text, fileType)
        };
      }

      try {
        return await prepareKiCanvasTextInWorker(base64, fileType);
      } catch {
        const text = decodeBase64Utf8(base64);
        return {
          text,
          renderText: normalizeKiCanvasText(text, fileType)
        };
      }
    }

    function prepareKiCanvasTextInWorker(base64, fileType) {
      return new Promise((resolve, reject) => {
        const workerScript =
          '(' + createKiCanvasPreparationWorker.toString() + ')();';
        const workerUrl = URL.createObjectURL(
          new Blob([workerScript], { type: 'text/javascript' })
        );
        const worker = new Worker(workerUrl);
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error('Timed out preparing KiCanvas source in the worker.'));
        }, 15000);

        function cleanup() {
          window.clearTimeout(timeout);
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        }

        worker.onmessage = (event) => {
          const data = event.data || {};
          cleanup();
          if (data.ok) {
            resolve({
              text: data.text || '',
              renderText: data.renderText || ''
            });
            return;
          }
          reject(new Error(data.message || 'Unable to prepare KiCanvas source in the worker.'));
        };
        worker.onerror = (event) => {
          cleanup();
          reject(new Error(event.message || 'KiCanvas source worker failed.'));
        };
        worker.postMessage({ base64, fileType });
      });
    }

    function createKiCanvasPreparationWorker() {
      self.onmessage = function (event) {
        try {
          const payload = event.data || {};
          const text = decodeBase64Utf8(String(payload.base64 || ''));
          self.postMessage({
            ok: true,
            text,
            renderText: normalizeKiCanvasText(text, payload.fileType)
          });
        } catch (error) {
          self.postMessage({
            ok: false,
            message: error instanceof Error ? error.message : String(error || 'Unknown worker error')
          });
        }
      };

      function normalizeKiCanvasText(text, fileType) {
        if (fileType !== 'board' || new RegExp('[(]\\s*layers\\b').test(text)) return text;

        const fallbackLayers = [
          '  (layers',
          '    (0 "F.Cu" signal)',
          '    (31 "B.Cu" signal)',
          '    (32 "B.Adhes" user "B.Adhesive")',
          '    (33 "F.Adhes" user "F.Adhesive")',
          '    (34 "B.Paste" user)',
          '    (35 "F.Paste" user)',
          '    (36 "B.SilkS" user "B.Silkscreen")',
          '    (37 "F.SilkS" user "F.Silkscreen")',
          '    (38 "B.Mask" user)',
          '    (39 "F.Mask" user)',
          '    (40 "Dwgs.User" user "User.Drawings")',
          '    (41 "Cmts.User" user "User.Comments")',
          '    (42 "Eco1.User" user "User.Eco1")',
          '    (43 "Eco2.User" user "User.Eco2")',
          '    (44 "Edge.Cuts" user)',
          '    (45 "Margin" user)',
          '    (46 "B.CrtYd" user "B.Courtyard")',
          '    (47 "F.CrtYd" user "F.Courtyard")',
          '    (48 "B.Fab" user)',
          '    (49 "F.Fab" user)',
          '    (50 "User.1" user)',
          '    (51 "User.2" user)',
          '    (52 "User.3" user)',
          '    (53 "User.4" user)',
          '    (54 "User.5" user)',
          '    (55 "User.6" user)',
          '    (56 "User.7" user)',
          '    (57 "User.8" user)',
          '    (58 "User.9" user)',
          '  )'
        ].join('\n');

        return text.replace(
          new RegExp('^\\s*[(]\\s*kicad_pcb\\b'),
          '(kicad_pcb\n' + fallbackLayers
        );
      }

      function decodeBase64Utf8(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      }
    }

    function decodeBase64Utf8(value) {
      const binary = atob(value);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
    }

    function openInKiCad() {
      vscode.postMessage({ type: 'openInKiCad', payload: { selectedArea: localState.selectedArea } });
    }

    function postViewerState() {
      vscode.postMessage({
        type: 'viewerState',
        payload: localState
      });
    }

    function setToolsPanelCollapsed(collapsed) {
      localState = { ...localState, toolsPanelCollapsed: Boolean(collapsed) };
      applyToolsPanelCollapsed(localState.toolsPanelCollapsed);
      postViewerState();
    }

    function applyToolsPanelCollapsed(collapsed) {
      document.body.classList.toggle('tools-collapsed', Boolean(collapsed));
      sidePanelToggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      sidePanelToggleBtn.textContent = collapsed ? t('Panel') : t('Hide Panel');
      sidePanelToggleBtn.title = collapsed ? t('Show viewer side panel') : t('Hide viewer side panel');
    }

    function closeExportMenu() {
      if (exportMenuEl) {
        exportMenuEl.open = false;
      }
    }

    function populateSheetSelect() {
      if (!sheetSelectEl) {
        return;
      }
      const metadataSheets = payload.metadata?.sheets || [];
      const sheets = Array.isArray(metadataSheets) ? metadataSheets : [];
      const rootLabel = payload.fileType === 'board' ? t('Board') : t('Root sheet');
      const options = [
        { id: 'root', name: rootLabel },
        ...sheets
          .map((sheet) => ({
            id: String(sheet?.id || sheet?.file || sheet?.name || ''),
            name: String(sheet?.name || sheet?.file || sheet?.id || '')
          }))
          .filter((sheet) => sheet.id && sheet.name)
      ];
      const currentSheet = localState.selectedSheet || 'root';
      const values = new Set(options.map((sheet) => sheet.id));
      sheetSelectEl.replaceChildren(
        ...options.map((sheet) => {
          const option = document.createElement('option');
          option.value = sheet.id;
          option.textContent = sheet.name;
          return option;
        })
      );
      if (values.has(currentSheet)) {
        sheetSelectEl.value = currentSheet;
        return;
      }
      localState = { ...localState, selectedSheet: 'root' };
      sheetSelectEl.value = 'root';
    }

    function updateZoomLevel() {
      if (!zoomLevelEl) {
        return;
      }
      const zoom = Number.isFinite(Number(localState.zoom)) ? Number(localState.zoom) : 1;
      zoomLevelEl.textContent = Math.round(zoom * 100) + '%';
      zoomLevelEl.title = t('Current zoom') + ' ' + zoomLevelEl.textContent;
    }

    function updateGridToggle() {
      const viewer = viewerMount.querySelector('kicanvas-embed');
      document.body.classList.toggle('grid-visible', Boolean(localState.grid) && !viewer);
      gridToggleBtn.setAttribute('aria-pressed', localState.grid ? 'true' : 'false');
      gridToggleBtn.classList.toggle('is-active', Boolean(localState.grid));
      applyViewerGridState(viewer);
    }

    function updateThemeToggle() {
      const light = localState.theme === 'light';
      document.body.dataset.viewerTheme = light ? 'light' : 'kicad';
      themeToggleBtn.setAttribute('aria-pressed', light ? 'true' : 'false');
      themeToggleBtn.classList.toggle('is-active', light);
      themeToggleBtn.textContent = light ? t('Light') : t('Dark');
    }

    function updateFallbackTheme() {
      if (!fallbackSvgWrapper || !fallbackSvgElement) {
        return;
      }
      applyFallbackPresentation(fallbackSvgWrapper, fallbackSvgElement);
    }

    function selectReferenceFromSearch() {
      const reference = String(referenceSearchInput.value || '').trim();
      if (!reference) {
        return;
      }
      localState = {
        ...localState,
        selectedReference: reference
      };
      applyViewerSelectionState(viewerMount.querySelector('kicanvas-embed'));
      postViewerState();
      vscode.postMessage({ type: 'componentSelected', payload: { reference } });
    }

    function applyViewerSelectionState(viewer) {
      if (!viewer) {
        return;
      }
      const selectedSheet = String(localState.selectedSheet || 'root');
      if (selectedSheet && selectedSheet !== 'root') {
        viewer.setAttribute('sheet', selectedSheet);
      } else {
        viewer.removeAttribute('sheet');
      }
      const reference = String(localState.selectedReference || '').trim();
      if (reference) {
        viewer.setAttribute('selected-reference', reference);
      } else {
        viewer.removeAttribute('selected-reference');
      }
      try {
        if (reference) {
          viewer.viewer?.select?.(reference);
        }
      } catch {}
    }

    function applyViewerGridState(viewer) {
      if (!viewer) {
        return;
      }
      if (localState.grid) {
        viewer.setAttribute('show-grid', 'true');
        viewer.setAttribute('grid', 'true');
      } else {
        viewer.removeAttribute('show-grid');
        viewer.removeAttribute('grid');
      }
    }

    function createEngineState(kind, reason) {
      const definition = ViewerEngines[kind] || ViewerEngines.kicanvas;
      return {
        kind: ViewerEngines[kind] ? kind : 'kicanvas',
        label: definition.label,
        ...(reason ? { reason } : {}),
        capabilities: { ...definition.capabilities }
      };
    }

    function setEngineState(kind, reason) {
      setEngineUiState(kind, reason);
      postViewerState();
    }

    function setEngineUiState(kind, reason) {
      const engine = createEngineState(kind, reason);
      localState = { ...localState, engine };
      updateEngineUi(engine);
    }

    function updateEngineUi(engine) {
      const nextEngine = engine || createEngineState('kicanvas');
      if (engineBadgeEl) {
        engineBadgeEl.textContent = nextEngine.label;
        engineBadgeEl.dataset.engineKind = nextEngine.kind;
        engineBadgeEl.title = nextEngine.reason || nextEngine.label;
      }
      if (engineSummaryEl) {
        engineSummaryEl.textContent = nextEngine.reason || nextEngine.label;
      }
      setControlsForEngine(nextEngine);
    }

    function setControlsForEngine(engine) {
      setControlDisabled(fitBtn, !engine.capabilities.fit);
      setControlDisabled(zoomInBtn, !engine.capabilities.zoom);
      setControlDisabled(zoomOutBtn, !engine.capabilities.zoom);
      setControlDisabled(exportPngBtn, !engine.capabilities.exportPng);
      setControlDisabled(exportSvgBtn, !engine.capabilities.exportSvg);
      const layerControlsEnabled = Boolean(engine.capabilities.layers);
      setControlDisabled(allLayersBtn, !layerControlsEnabled);
      setControlDisabled(noneLayersBtn, !layerControlsEnabled);
      setControlDisabled(copperLayersBtn, !layerControlsEnabled);
    }

    function setControlDisabled(control, disabled) {
      if (!control) {
        return;
      }
      control.disabled = Boolean(disabled);
      control.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }

    function applyViewerState(viewer) {
      if (payload.restoreState) {
        localState = {
          ...payload.restoreState,
          engine: localState.engine || payload.restoreState.engine
        };
      }
      viewer.setAttribute('theme', localState.theme || payload.theme || 'kicad');
      populateSheetSelect();
      if (sheetSelectEl && localState.selectedSheet) {
        sheetSelectEl.value = localState.selectedSheet;
      }
      applyViewerSelectionState(viewer);
      applyViewerGridState(viewer);
      applyToolsPanelCollapsed(localState.toolsPanelCollapsed);
      updateZoomLevel();
      updateGridToggle();
      updateThemeToggle();
      updateSelectionSummary();
      postViewerState();
    }

    function renderSidebar() {
      const layers = payload.metadata?.layers || [];
      const tuningProfiles = payload.metadata?.tuningProfiles || [];
      const notes = payload.metadata?.notes || [];

      layersSection.hidden = layers.length === 0;
      tuningSection.hidden = tuningProfiles.length === 0;
      notesSection.hidden = notes.length === 0;
      layerListEl.innerHTML = '';
      tuningListEl.innerHTML = '';
      notesListEl.innerHTML = '';

      if (!localState.activeLayers && layers.length) {
        localState.activeLayers = layers.filter((layer) => layer.visible !== false).map((layer) => layer.name);
      }

      for (const layer of layers) {
        const row = document.createElement('label');
        row.className = 'layer-row';
        const checked = (localState.activeLayers || []).includes(layer.name);
        row.innerHTML = '<input type="checkbox"' + (checked ? ' checked' : '') + '> <span></span>';
        row.querySelector('span').textContent = layer.name + (layer.kind ? ' (' + layer.kind + ')' : '');
        row.querySelector('input').addEventListener('change', (event) => {
          const nextChecked = Boolean(event.target.checked);
          const activeLayers = new Set(localState.activeLayers || []);
          if (nextChecked) {
            activeLayers.add(layer.name);
          } else {
            activeLayers.delete(layer.name);
          }
          localState = { ...localState, activeLayers: [...activeLayers] };
          postViewerState();
          applyLayerVisibility(viewerMount.querySelector('kicanvas-embed'));
        });
        layerListEl.appendChild(row);
      }

      for (const profile of tuningProfiles) {
        const row = document.createElement('div');
        row.className = 'meta-row';
        row.innerHTML = '<strong></strong><div></div>';
        row.querySelector('strong').textContent = profile.name || 'Tuning profile';
        row.querySelector('div').textContent = [
          profile.layer ? 'Layer: ' + profile.layer : '',
          profile.impedance ? 'Impedance: ' + profile.impedance : '',
          profile.propagationSpeed ? 'Propagation: ' + profile.propagationSpeed : ''
        ].filter(Boolean).join(' · ') || (profile.raw || '');
        tuningListEl.appendChild(row);
      }

      for (const note of notes) {
        const row = document.createElement('div');
        row.className = 'meta-row';
        row.textContent = note;
        notesListEl.appendChild(row);
      }

      updateSelectionSummary();
    }

    function renderHopOverOverlay() {
      const hopOvers = payload.metadata?.hopOvers || [];
      clearHopOverOverlay();
      if (payload.fileType !== 'schematic' || !hopOvers.length) {
        return;
      }

      hopOverOverlay.hidden = false;
      const xs = hopOvers.map((point) => Number(point.x)).filter(Number.isFinite);
      const ys = hopOvers.map((point) => Number(point.y)).filter(Number.isFinite);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);

      for (const point of hopOvers) {
        const marker = document.createElement('button');
        marker.className = 'hop-over-marker';
        marker.type = 'button';
        const xRatio = xs.length === 1 ? 0.5 : (Number(point.x) - minX) / spanX;
        const yRatio = ys.length === 1 ? 0.5 : (Number(point.y) - minY) / spanY;
        marker.style.left = 10 + xRatio * 80 + '%';
        marker.style.top = 10 + yRatio * 80 + '%';
        marker.title = 'KiCad 10 hop-over at ' + point.x + ', ' + point.y;
        marker.setAttribute('aria-label', marker.title);
        const arc = document.createElement('span');
        arc.className = 'hop-over-arc';
        marker.appendChild(arc);
        hopOverOverlay.appendChild(marker);
      }
    }

    function clearHopOverOverlay() {
      hopOverOverlay.replaceChildren();
      hopOverOverlay.hidden = true;
    }

    function applyLayerVisibility(viewer) {
      if (!viewer || !Array.isArray(localState.activeLayers)) {
        return;
      }

      try {
        viewer.setAttribute('layers', localState.activeLayers.join(','));
      } catch {}

      try {
        const internalViewer = viewer.viewer;
        const layerSet = internalViewer?.layers;
        if (!layerSet?.in_order) {
          return;
        }
        for (const layer of Array.from(layerSet.in_order())) {
          layer.visible = localState.activeLayers.includes(layer.name);
        }
        internalViewer.draw?.();
      } catch {}
    }

    function setAllLayers(visible) {
      const layers = payload.metadata?.layers || [];
      localState = {
        ...localState,
        activeLayers: visible ? layers.map((layer) => layer.name) : []
      };
      renderSidebar();
      postViewerState();
      applyLayerVisibility(viewerMount.querySelector('kicanvas-embed'));
    }

    function setCopperOnly() {
      const layers = payload.metadata?.layers || [];
      localState = {
        ...localState,
        activeLayers: layers
          .filter((layer) => /\.Cu$/i.test(layer.name))
          .map((layer) => layer.name)
      };
      renderSidebar();
      postViewerState();
      applyLayerVisibility(viewerMount.querySelector('kicanvas-embed'));
    }

    function installSelectionTracking(viewer) {
      let dragStart = null;
      viewer.addEventListener('pointerdown', (event) => {
        dragStart = { x: event.clientX, y: event.clientY };
      });
      viewer.addEventListener('pointerup', (event) => {
        if (!dragStart) {
          return;
        }
        const dx = Math.abs(event.clientX - dragStart.x);
        const dy = Math.abs(event.clientY - dragStart.y);
        if (dx < 4 && dy < 4) {
          dragStart = null;
          return;
        }
        localState = {
          ...localState,
          selectedArea: {
            x1: dragStart.x,
            y1: dragStart.y,
            x2: event.clientX,
            y2: event.clientY
          }
        };
        updateSelectionSummary();
        vscode.postMessage({
          type: 'selectionChanged',
          payload: {
            selectedArea: localState.selectedArea
          }
        });
        dragStart = null;
      });
      viewer.addEventListener('dblclick', () => {
        localState = {
          ...localState,
          selectedArea: undefined
        };
        updateSelectionSummary();
        vscode.postMessage({
          type: 'selectionChanged',
          payload: {
            selectedArea: undefined
          }
        });
      });
    }

    function updateSelectionSummary() {
      if (!localState.selectedArea) {
        selectionSummaryEl.textContent = 'No lasso area selected.';
        return;
      }
      const area = localState.selectedArea;
      selectionSummaryEl.textContent =
        'Selected area: (' + area.x1 + ', ' + area.y1 + ') → (' + area.x2 + ', ' + area.y2 + ')';
    }

    function exportPng() {
      const canvas = viewerMount.querySelector('canvas');
      if (!canvas && fallbackSvgDataUrl) {
        void exportFallbackSvgAsPng();
        return;
      }
      if (!canvas) {
        showError('Export failed', 'No rendered canvas is available for PNG export.', '');
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      vscode.postMessage({ type: 'exportPng', payload: { dataUrl } });
    }

    function exportSvg() {
      vscode.postMessage({ type: 'exportSvg' });
    }

    function fitCurrentViewer() {
      const viewer = viewerMount.querySelector('kicanvas-embed');
      if (viewer) {
        viewer.fitToScreen?.();
        localState = { ...localState, zoom: 1 };
        updateZoomLevel();
        postViewerState();
        return;
      }
      if (fallbackSvgElement) {
        fitSvgFallback(true);
      }
    }

    function zoomCurrentViewer(direction) {
      const viewer = viewerMount.querySelector('kicanvas-embed');
      if (viewer) {
        if (direction > 0) {
          viewer.zoomIn?.();
          localState = { ...localState, zoom: Number((localState.zoom + 0.1).toFixed(2)) };
        } else {
          viewer.zoomOut?.();
          localState = { ...localState, zoom: Number(Math.max(0.1, localState.zoom - 0.1).toFixed(2)) };
        }
        updateZoomLevel();
        postViewerState();
        return;
      }

      if (!fallbackSvgWrapper || !fallbackSvgElement || !fallbackSvgSize) {
        return;
      }

      stepFallbackZoom(
        direction,
        fallbackSvgWrapper.clientWidth / 2,
        fallbackSvgWrapper.clientHeight / 2
      );
    }

    async function trySvgFallback(reason) {
      showLoading('Interactive renderer stayed blank. Requesting SVG fallback…');
      const svgText = await requestSvgFallback(reason);
      if (!svgText) {
        return false;
      }
      showSvgFallback(svgText);
      setEngineState('cli-svg-fallback', reason);
      setStatus('CLI SVG fallback loaded: ' + payload.fileName);
      return true;
    }

    function requestSvgFallback(reason) {
      return new Promise((resolve) => {
        const requestId = 'svg-fallback-' + Date.now() + '-' + Math.random().toString(16).slice(2);
        const timeout = window.setTimeout(() => {
          cleanup();
          resolve(undefined);
        }, 15000);

        function cleanup() {
          window.clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
        }

        function handleMessage(event) {
          const message = event.data || {};
          if (message.type !== 'svgFallback' && message.type !== 'svgFallbackUnavailable') {
            return;
          }
          if (message.payload?.requestId !== requestId) {
            return;
          }
          cleanup();
          resolve(message.type === 'svgFallback' ? message.payload?.svg : undefined);
        }

        window.addEventListener('message', handleMessage);
        vscode.postMessage({
          type: 'requestSvgFallback',
          payload: {
            requestId,
            reason
          }
        });
      });
    }

    function showSvgFallback(svgText) {
      const preparedSvg = prepareSvgFallback(svgText);
      if (!preparedSvg) {
        throw new Error('The fallback SVG could not be normalized for responsive rendering.');
      }
      fallbackSvgDataUrl = svgToDataUrl(preparedSvg.text);
      const wrapper = document.createElement('div');
      wrapper.id = 'svg-fallback-view';
      wrapper.className = 'viewer-surface';
      wrapper.tabIndex = 0;
      const stage = document.createElement('div');
      stage.id = 'svg-fallback-stage';
      fallbackSvgElement = preparedSvg.element;
      fallbackSvgWrapper = wrapper;
      fallbackSvgStage = stage;
      fallbackSvgSize = preparedSvg.size;
      applyFallbackPresentation(wrapper, preparedSvg.element);
      stage.appendChild(preparedSvg.element);
      wrapper.appendChild(stage);
      installFallbackNavigation(wrapper);
      viewerMount.replaceChildren(wrapper);
      renderHopOverOverlay();
      requestAnimationFrame(() => {
        fitSvgFallback(true);
      });
      setViewerSurfaceVisible(true);
      hideAll();
      clearKeyboardShortcuts();
    }

    function fitSvgFallback(resetScroll) {
      if (!fallbackSvgElement || !fallbackSvgWrapper || !fallbackSvgSize) {
        return;
      }
      const availableWidth = Math.max(1, fallbackSvgWrapper.clientWidth - 40);
      const availableHeight = Math.max(1, fallbackSvgWrapper.clientHeight - 40);
      fallbackSvgFitScale = Math.min(
        availableWidth / fallbackSvgSize.width,
        availableHeight / fallbackSvgSize.height
      );
      fallbackSvgScale = fallbackSvgFitScale;
      applyFallbackSvgScale(resetScroll !== false);
    }

    function applyFallbackPresentation(wrapper, svgElement) {
      wrapper.style.background = resolveFallbackBackground();

      if (payload.fileType === 'board') {
        svgElement.style.background = 'transparent';
        svgElement.style.borderRadius = '0';
        svgElement.style.boxShadow = 'none';
        return;
      }

      svgElement.style.background = '#ffffff';
      svgElement.style.borderRadius = '12px';
      svgElement.style.boxShadow = '0 18px 45px rgba(15, 23, 42, 0.22)';
    }

    function resolveFallbackBackground() {
      const configured =
        typeof payload.fallbackBackground === 'string' ? payload.fallbackBackground.trim() : '';

      if (configured) {
        return configured;
      }

      if (payload.fileType === 'board') {
        return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#001023';
      }

      if (localState.theme === 'light') {
        return '#f8fafc';
      }

      return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f8fafc';
    }

    async function exportFallbackSvgAsPng() {
      try {
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = () => resolve(undefined);
          image.onerror = () => reject(new Error('Unable to decode the SVG fallback image.'));
          image.src = fallbackSvgDataUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width || 1;
        canvas.height = image.naturalHeight || image.height || 1;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('A 2D canvas context is not available for PNG export.');
        }
        context.drawImage(image, 0, 0);
        vscode.postMessage({ type: 'exportPng', payload: { dataUrl: canvas.toDataURL('image/png') } });
      } catch (error) {
        showError(
          'Export failed',
          error instanceof Error ? error.message : 'Unable to export the fallback SVG as PNG.',
          ''
        );
      }
    }

    function svgToDataUrl(svgText) {
      const bytes = new TextEncoder().encode(svgText);
      let binary = '';
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return 'data:image/svg+xml;base64,' + btoa(binary);
    }

    function prepareSvgFallback(svgText) {
      const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      if (parsed.querySelector('parsererror')) {
        return undefined;
      }
      const svgRoot = parsed.documentElement;
      if (!svgRoot || svgRoot.tagName.toLowerCase() !== 'svg') {
        return undefined;
      }

      for (const node of Array.from(svgRoot.querySelectorAll('script, foreignObject'))) {
        node.remove();
      }

      for (const element of Array.from(svgRoot.querySelectorAll('*'))) {
        for (const attributeName of element.getAttributeNames()) {
          if (/^on/i.test(attributeName)) {
            element.removeAttribute(attributeName);
          }
        }
      }

      if (!svgRoot.getAttribute('xmlns')) {
        svgRoot.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }

      const width = parseSvgLength(svgRoot.getAttribute('width'));
      const height = parseSvgLength(svgRoot.getAttribute('height'));
      if (!svgRoot.getAttribute('viewBox') && width && height) {
        svgRoot.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      }
      const viewBox = parseSvgViewBox(svgRoot.getAttribute('viewBox'));
      const intrinsicWidth = viewBox?.width ?? width;
      const intrinsicHeight = viewBox?.height ?? height;
      if (!intrinsicWidth || !intrinsicHeight) {
        return undefined;
      }

      svgRoot.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svgRoot.setAttribute('role', 'img');
      svgRoot.setAttribute('aria-label', 'SVG fallback preview for ' + payload.fileName);

      const serialized = new XMLSerializer().serializeToString(svgRoot);
      const imported = document.importNode(svgRoot, true);
      return {
        text: serialized,
        element: imported,
        size: {
          width: intrinsicWidth,
          height: intrinsicHeight
        }
      };
    }

    function parseSvgLength(value) {
      if (!value) {
        return undefined;
      }
      const match = String(value).trim().match(new RegExp('^(-?\\d+(?:\\.\\d+)?)'));
      if (!match) {
        return undefined;
      }
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }

    function parseSvgViewBox(value) {
      if (!value) {
        return undefined;
      }
      const parts = String(value)
        .trim()
        .split(new RegExp('[\\\\s,]+'))
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry));
      if (parts.length !== 4 || parts[2] <= 0 || parts[3] <= 0) {
        return undefined;
      }
      return {
        minX: parts[0],
        minY: parts[1],
        width: parts[2],
        height: parts[3]
      };
    }

    function installFallbackNavigation(wrapper) {
      clearFallbackResizeHandler();
      fallbackResizeHandler = () => {
        fitSvgFallback(true);
      };
      window.addEventListener('resize', fallbackResizeHandler);

      wrapper.addEventListener('wheel', (event) => {
        if (!fallbackSvgElement || !fallbackSvgSize) {
          return;
        }
        const canScrollVertically = wrapper.scrollHeight > wrapper.clientHeight + 1;
        const canScrollHorizontally = wrapper.scrollWidth > wrapper.clientWidth + 1;
        const shouldPan = event.shiftKey || event.altKey;

        if (shouldPan) {
          if (canScrollVertically) {
            wrapper.scrollTop += event.deltaY;
          }
          if (canScrollHorizontally) {
            wrapper.scrollLeft += event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)
              ? event.deltaY
              : event.deltaX;
          }
          event.preventDefault();
          return;
        }

        {
          const rect = wrapper.getBoundingClientRect();
          stepFallbackZoom(
            event.deltaY === 0 ? -event.deltaX : event.deltaY,
            event.clientX - rect.left,
            event.clientY - rect.top
          );
          event.preventDefault();
          return;
        }
      }, { passive: false });

      let dragState = null;
      wrapper.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) {
          return;
        }
        if (wrapper.scrollWidth <= wrapper.clientWidth && wrapper.scrollHeight <= wrapper.clientHeight) {
          return;
        }
        dragState = {
          x: event.clientX,
          y: event.clientY,
          left: wrapper.scrollLeft,
          top: wrapper.scrollTop
        };
        wrapper.classList.add('is-dragging');
        wrapper.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
      wrapper.addEventListener('pointermove', (event) => {
        if (!dragState) {
          return;
        }
        wrapper.scrollLeft = dragState.left - (event.clientX - dragState.x);
        wrapper.scrollTop = dragState.top - (event.clientY - dragState.y);
      });
      const stopDragging = (event) => {
        if (!dragState) {
          return;
        }
        dragState = null;
        wrapper.classList.remove('is-dragging');
        if (event?.pointerId !== undefined) {
          try {
            wrapper.releasePointerCapture?.(event.pointerId);
          } catch {}
        }
      };
      wrapper.addEventListener('pointerup', stopDragging);
      wrapper.addEventListener('pointercancel', stopDragging);
      wrapper.addEventListener('lostpointercapture', () => {
        dragState = null;
        wrapper.classList.remove('is-dragging');
      });
    }

    function clearFallbackResizeHandler() {
      if (!fallbackResizeHandler) {
        return;
      }
      window.removeEventListener('resize', fallbackResizeHandler);
      fallbackResizeHandler = null;
    }

    function applyFallbackSvgScale(resetScroll) {
      if (!fallbackSvgElement || !fallbackSvgWrapper || !fallbackSvgStage || !fallbackSvgSize) {
        return;
      }
      const renderedWidth = Math.max(1, Math.floor(fallbackSvgSize.width * fallbackSvgScale));
      const renderedHeight = Math.max(1, Math.floor(fallbackSvgSize.height * fallbackSvgScale));
      const innerWidth = Math.max(1, fallbackSvgWrapper.clientWidth - 40);
      const innerHeight = Math.max(1, fallbackSvgWrapper.clientHeight - 40);
      const stageWidth = Math.max(innerWidth, renderedWidth);
      const stageHeight = Math.max(innerHeight, renderedHeight);
      fallbackSvgStage.style.width = stageWidth + 'px';
      fallbackSvgStage.style.height = stageHeight + 'px';
      fallbackSvgElement.style.width = renderedWidth + 'px';
      fallbackSvgElement.style.height = renderedHeight + 'px';
      fallbackSvgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      if (resetScroll) {
        fallbackSvgWrapper.scrollLeft = Math.max(0, (fallbackSvgWrapper.scrollWidth - fallbackSvgWrapper.clientWidth) / 2);
        fallbackSvgWrapper.scrollTop = Math.max(0, (fallbackSvgWrapper.scrollHeight - fallbackSvgWrapper.clientHeight) / 2);
      }
      localState = { ...localState, zoom: Number(fallbackSvgScale.toFixed(3)) };
      updateZoomLevel();
      postViewerState();
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function stepFallbackZoom(direction, anchorX, anchorY) {
      if (!fallbackSvgWrapper || !fallbackSvgElement || !fallbackSvgSize) {
        return;
      }

      const zoomFactor = direction < 0 ? 1.12 : 1 / 1.12;
      const nextScale = clamp(
        fallbackSvgScale * zoomFactor,
        Math.max(fallbackSvgFitScale * 0.5, 0.05),
        getFallbackMaxZoomScale()
      );
      const cursorX = anchorX + fallbackSvgWrapper.scrollLeft;
      const cursorY = anchorY + fallbackSvgWrapper.scrollTop;
      const ratio = nextScale / fallbackSvgScale;
      fallbackSvgScale = nextScale;
      applyFallbackSvgScale(false);
      const nextLeft = cursorX * ratio - anchorX;
      const nextTop = cursorY * ratio - anchorY;
      fallbackSvgWrapper.scrollLeft = clamp(
        nextLeft,
        0,
        Math.max(0, fallbackSvgWrapper.scrollWidth - fallbackSvgWrapper.clientWidth)
      );
      fallbackSvgWrapper.scrollTop = clamp(
        nextTop,
        0,
        Math.max(0, fallbackSvgWrapper.scrollHeight - fallbackSvgWrapper.clientHeight)
      );
    }

    function getFallbackMaxZoomScale() {
      if (!fallbackSvgSize) {
        return Math.max(fallbackSvgFitScale * 12, fallbackSvgFitScale);
      }

      const intrinsicMaxDimension = Math.max(fallbackSvgSize.width, fallbackSvgSize.height, 1);
      const maxRenderedDimension = payload.fileType === 'board' ? 24000 : 18000;
      const absoluteMaxScale = maxRenderedDimension / intrinsicMaxDimension;
      const relativeMaxScale = fallbackSvgFitScale * (payload.fileType === 'board' ? 64 : 48);

      return Math.max(
        fallbackSvgFitScale,
        Math.min(relativeMaxScale, absoluteMaxScale)
      );
    }

    function hideAll() {
      loadingEl.hidden = true;
      errorEl.hidden   = true;
      emptyEl.hidden   = true;
    }

    function setViewerSurfaceVisible(visible) {
      viewerMount.classList.toggle('is-hidden', !visible);
    }

    function showLoading(detail) {
      setViewerSurfaceVisible(false);
      hideAll();
      loadingEl.hidden       = false;
      loadingDetail.textContent = detail || '';
      setStatus(detail || 'Loading…');
    }

    function showError(title, message, detail) {
      setViewerSurfaceVisible(false);
      hideAll();
      errorEl.hidden          = false;
      errorTitle.textContent  = title   || 'Viewer error';
      errorMessage.textContent = message || 'An unexpected error occurred.';
      errorDetail.textContent  = detail  || '';
      setStatus('⚠ ' + (title || 'Error'));
    }

    function showEmpty(message, preview, title) {
      setViewerSurfaceVisible(false);
      hideAll();
      emptyEl.hidden = false;
      if (emptyTitleEl) emptyTitleEl.textContent = title || 'No drawable objects yet';
      if (safePreviewEl) {
        safePreviewEl.textContent = preview || '';
        safePreviewEl.hidden = !preview;
      }
      setStatus(title || 'No drawable objects');
    }

    function setStatus(text) {
      statusEl.textContent = text || '';
    }

    function clearKeyboardShortcuts() {
      if (keydownHandler) {
        window.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
      }
    }

    function isEditableShortcutTarget(target) {
      if (!(target instanceof Element)) {
        return false;
      }
      return Boolean(
        target.closest('input, select, textarea, [contenteditable="true"], [role="textbox"]') ||
          target.closest('[contenteditable]')?.isContentEditable
      );
    }

    function installKeyboardShortcuts(viewer) {
      clearKeyboardShortcuts();
      keydownHandler = (ev) => {
        if (isEditableShortcutTarget(ev.target)) {
          return;
        }
        if (ev.key === 'f' || ev.key === 'F') {
          viewer.fitToScreen?.();
          localState = { ...localState, zoom: 1 };
          updateZoomLevel();
          postViewerState();
        }
        if (ev.key === '+' || ev.key === '=') {
          viewer.zoomIn?.();
          localState = { ...localState, zoom: Number((localState.zoom + 0.1).toFixed(2)) };
          updateZoomLevel();
          postViewerState();
        }
        if (ev.key === '-') {
          viewer.zoomOut?.();
          localState = { ...localState, zoom: Number(Math.max(0.1, localState.zoom - 0.1).toFixed(2)) };
          updateZoomLevel();
          postViewerState();
        }
        if (ev.key === 'r' || ev.key === 'R') {
          vscode.postMessage({ type: 'requestRefresh' });
        }
      };
      window.addEventListener('keydown', keydownHandler);
    }
  })();`;
}
