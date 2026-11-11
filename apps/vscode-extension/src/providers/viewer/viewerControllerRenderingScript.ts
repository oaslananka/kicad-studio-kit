export function createViewerControllerRenderingScript(): string {
  return String.raw`    function waitForDefinition(tagName, timeoutMs) {
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

    // KiCanvas paints inside several nested open shadow roots. A normal
    // querySelectorAll() cannot see those canvases, even when rendering works.
    function findRenderSurfaces(root) {
      const found = [];
      const stack = [root];
      let scanned = 0;
      while (stack.length && scanned < 1800) {
        const node = stack.pop();
        scanned++;
        if (node instanceof HTMLCanvasElement || node instanceof SVGSVGElement) {
          found.push(node);
        }
        if (node.shadowRoot) {
          stack.push(...Array.from(node.shadowRoot.children));
        }
        stack.push(...Array.from(node.children || []));
      }
      return found;
    }

    function waitForRenderableSurface(container, timeoutMs) {
      return new Promise((resolve) => {
        const startedAt = Date.now();
        const pickSurface = () => {
          const surfaces = findRenderSurfaces(container);
          const canvases = surfaces
            .filter((entry) => entry instanceof HTMLCanvasElement && entry.width > 0 && entry.height > 0)
            .sort((left, right) => (right.width * right.height) - (left.width * left.height));
          if (canvases[0]) {
            return canvases[0];
          }
          return surfaces.find(
            (entry) => entry instanceof SVGSVGElement && entry.clientWidth > 0 && entry.clientHeight > 0
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
      if (fileType !== 'board') return text;
      text = normalizeKiCad10NamedNets(text);
      if (new RegExp('[(]\\s*layers\\b').test(text)) return text;

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

    async function prepareKiCanvasText(base64, fileType, generation) {
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
        // Cancellation must not trigger a second, synchronous decode of the
        // superseded buffer on the UI thread.
        if (generation !== viewerGeneration) return null;
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
          'const normalizeKiCad10NamedNets = (' +
          normalizeKiCad10NamedNets.toString() +
          ');(' + createKiCanvasPreparationWorker.toString() + ')();';
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
          if (cancelPendingPreparation === abort) cancelPendingPreparation = null;
        }

        function abort() {
          cleanup();
          reject(new Error('Viewer preparation superseded.'));
        }
        cancelPendingPreparation = abort;

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
        if (fileType !== 'board') return text;
      text = normalizeKiCad10NamedNets(text);
      if (new RegExp('[(]\\s*layers\\b').test(text)) return text;

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

    async function inspectNativeCopperLayer(layer, button, scope = 'partial') {
      if (!/^(?:F|B|In\d+)\.Cu$/.test(layer) || button.disabled) return;
      const fullOriginal = scope === 'original';
      button.disabled = true;
      button.textContent = 'Rendering KiCad layer...';
      setStatus('Preparing the native KiCad ' + layer +
        (fullOriginal ? ' full original board' : '') + ' copper plot...');
      const requestId = 'native-inner-' + Date.now() + '-' + Math.random().toString(16).slice(2);
      const sourceRevision = displayedSourceRevision;
      let boardPageCoordinates = false;
      const svg = await new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
          cleanup();
          resolve(undefined);
        }, 90000);
        function cleanup() {
          window.clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
        }
        function handleMessage(event) {
          const response = event.data || {};
          if (
            response.type !== 'nativeInnerLayerSvg' &&
            response.type !== 'nativeInnerLayerUnavailable'
          ) return;
          if (response.payload?.requestId !== requestId) return;
          cleanup();
          boardPageCoordinates = response.payload?.boardPageCoordinates === true;
          resolve(response.type === 'nativeInnerLayerSvg' ? response.payload?.svg : undefined);
        }
        window.addEventListener('message', handleMessage);
        vscode.postMessage({
          type: 'requestNativeInnerLayer',
          payload: { requestId, layer, ...(fullOriginal ? { scope: 'original' } : {}) }
        });
      });
      if (!button.isConnected || sourceRevision !== displayedSourceRevision ||
          partialBusy) return;
      button.disabled = false;
      button.textContent = fullOriginal
        ? 'Inspect original layer'
        : payload.partialPreview
          ? 'Inspect partial layer'
          : 'Inspect native layer';
      if (!svg) {
        setStatus('Native KiCad layer plot unavailable. Open the original board in KiCad to inspect copper.');
        return;
      }
      try {
        showSvgFallback(svg, fullOriginal && boardPageCoordinates
          ? payload.partialPreview?.viewport : undefined);
        if (payload.partialPreview && partialBanner) {
          partialBanner.textContent = fullOriginal
            ? 'FULL ORIGINAL ' + layer + ' — This read-only native KiCad plot shows the original board. ' +
              'The interactive preview remains partial and omits zone fills, pads and other geometry. ' +
              'This plot is not DRC or net-continuity validation. ' +
              'Use Reload viewer to return to the partial preview.'
            : partialPreviewBannerText;
        }
        setEngineState('cli-svg-fallback', 'Native KiCad ' + layer + ' plot');
        const sourceRegionFocus = fullOriginal && boardPageCoordinates
          ? getOriginalBoardFocusBounds() : null;
        setStatus(
          'Native KiCad ' + layer +
          (fullOriginal ? ' FULL ORIGINAL BOARD' : payload.partialPreview ? ' PARTIAL' : '') +
          ' plot (read-only' +
          (sourceRegionFocus ? ', focused on selected source area'
            : fullOriginal && boardPageCoordinates
              ? ', selected area not aligned to KiCad page; inspect in KiCad' : '') +
          ', not DRC or net-continuity validation; use Reload to return to KiCanvas).'
        );
      } catch {
        setStatus('Native layer plot could not be displayed. Open the original board in KiCad.');
      }
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
      if (payload.partialPreview) {
        setStatus('Reference search is not authoritative in a partial preview. Open in KiCad.');
        return;
      }
      const reference = String(referenceSearchInput.value || '').trim();
      if (!reference) {
        setStatus('Enter a component reference to find.');
        return;
      }
      // The schematic renderer's select API does not confirm that the
      // reference exists or that its camera moved. Resolve against actual
      // placed symbols in this source before updating persisted selection.
      // Avoid claiming exact graphical focus until native navigation proves it.
      let matchedSchematicReference = null;
      if (payload.fileType === 'schematic') {
        const references = payload.metadata?.references;
        if (!Array.isArray(references)) {
          referenceSearchInput.setAttribute('aria-invalid', 'true');
          setStatus('Reference lookup is unavailable for this schematic. Open in KiCad to locate the object.');
          return;
        }
        matchedSchematicReference = references.find(
          (candidate) => typeof candidate === 'string' &&
            candidate.toLowerCase() === reference.toLowerCase()
        );
        if (!matchedSchematicReference) {
          referenceSearchInput.setAttribute('aria-invalid', 'true');
          setStatus('Reference ' + reference + ' was not found in this schematic.');
          return;
        }
      }
      const embed = viewerMount.querySelector('kicanvas-embed');
      if (payload.fileType === 'schematic' && !embed) {
        referenceSearchInput.removeAttribute('aria-invalid');
        setStatus(
          'Reference ' + matchedSchematicReference +
            ' found in source; visual focus is unavailable in SVG fallback. Open in KiCad to locate it.'
        );
        return;
      }
      const renderer = payload.fileType === 'schematic'
        ? embed?.shadowRoot?.querySelector('kc-schematic-app')?.viewer || embed?.viewer
        : getKiCanvasViewer(embed);
      if (payload.fileType === 'schematic') {
        const symbol = renderer?.schematic?.find_symbol?.(matchedSchematicReference);
        if (!symbol || typeof renderer?.select !== 'function' ||
            typeof renderer?.zoom_to_selection !== 'function') {
          referenceSearchInput.removeAttribute('aria-invalid');
          setStatus('Reference ' + matchedSchematicReference +
            ' found in source; graphical focus is unavailable in this renderer. Open in KiCad to locate it.');
          return;
        }
        try {
          renderer.select(symbol);
          const selection = renderer.selected;
          if (!selection || !Number.isFinite(selection.x) ||
              !Number.isFinite(selection.y) ||
              !Number.isFinite(selection.w) || !Number.isFinite(selection.h) ||
              selection.w <= 0 || selection.h <= 0) {
            throw new Error('The renderer did not select a drawable symbol.');
          }
          renderer.zoom_to_selection();
          const box = renderer.viewport?.camera?.bbox;
          if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) ||
              !Number.isFinite(box.w) || !Number.isFinite(box.h) ||
              box.x > selection.x || box.y > selection.y ||
              box.x + box.w < selection.x + selection.w ||
              box.y + box.h < selection.y + selection.h) {
            throw new Error('The renderer did not focus the selected symbol.');
          }
          const cameraZoom = renderer.viewport?.camera?.zoom;
          if (Number.isFinite(cameraZoom) && fittedCameraZoom > 0) {
            localState = { ...localState, zoom: Number((cameraZoom / fittedCameraZoom).toFixed(2)) };
            updateZoomLevel();
          }
        } catch {
          setStatus('Reference ' + matchedSchematicReference +
            ' found in source; graphical focus failed in this renderer. Open in KiCad to locate it.');
          return;
        }
      }
      if (payload.fileType === 'board' && renderer?.board?.find_footprint) {
        if (!renderer.board.find_footprint(reference)) {
          referenceSearchInput.setAttribute('aria-invalid', 'true');
          setStatus('Reference ' + reference + ' was not found in this PCB.');
          return;
        }
        try {
          renderer.select(reference);
          if (typeof renderer.zoom_to_selection !== 'function') {
            throw new Error('Selection zoom is unavailable.');
          }
          renderer.zoom_to_selection();
          const cameraZoom = renderer.viewport?.camera?.zoom;
          if (Number.isFinite(cameraZoom) && fittedCameraZoom > 0) {
            localState = {
              ...localState,
              zoom: Number((cameraZoom / fittedCameraZoom).toFixed(2))
            };
            updateZoomLevel();
          }
        } catch {
          setStatus('Unable to focus reference ' + reference + ' in this renderer.');
          return;
        }
      } else if (payload.fileType === 'board') {
        setStatus('PCB reference search is unavailable in this renderer.');
        return;
      }
      referenceSearchInput.removeAttribute('aria-invalid');
      const selectedReference = matchedSchematicReference || reference;
      if (payload.fileType === 'board') embed?.setAttribute('selected-reference', selectedReference);
      localState = { ...localState, selectedReference };
      if (payload.fileType !== 'board') applyViewerSelectionState(embed);
      postViewerState();
      setStatus(payload.fileType === 'schematic'
        ? 'Focused schematic reference: ' + selectedReference
        : 'Focused reference: ' + selectedReference);
      vscode.postMessage({ type: 'componentSelected', payload: { reference: selectedReference } });
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
      if (!viewer) return;
      // Legacy/test embeds support attributes. The bundled KiCanvas does not
      // implement show-grid; its board renderer exposes grid_opacity.
      if (localState.grid) {
        viewer.setAttribute('show-grid', 'true');
        viewer.setAttribute('grid', 'true');
      } else {
        viewer.removeAttribute('show-grid');
        viewer.removeAttribute('grid');
      }
      try {
        const renderer = getKiCanvasViewer(viewer);
        if (renderer && 'grid_opacity' in renderer) {
          renderer.grid_opacity = localState.grid ? 1 : 0;
        }
      } catch {
        // Keep fallback rendering available if KiCanvas changes its internals.
      }
    }

    function applyRendererTheme(embed, theme) {
      try {
        // The published embed's theme attribute is not forwarded to its nested
        // kc-board-viewer. Update the actual drawing host and repaint safely.
        const surface = findRenderSurfaces(embed).find(
          (entry) => entry instanceof HTMLCanvasElement
        );
        const renderHost = surface?.getRootNode()?.host;
        if (renderHost?.tagName?.toLowerCase() !== 'kc-board-viewer') return;
        if (renderHost.theme === theme && renderHost.viewer?.loaded) return;
        renderHost.theme = theme;
        if (renderHost.viewer?.loaded && typeof renderHost.update_theme === 'function') {
          renderHost.update_theme();
          renderHost.viewer.paint?.();
          renderHost.viewer.draw?.();
        }
      } catch {
        // Theme changes must never break the board viewer or its file data.
      }
    }

`;
}
