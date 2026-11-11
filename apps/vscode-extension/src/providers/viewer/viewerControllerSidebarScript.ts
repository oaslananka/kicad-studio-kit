export function createViewerControllerSidebarScript(): string {
  return String.raw`    function createEngineState(kind, reason) {
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
      if (engine.kind !== 'kicanvas') resetNetInspector();
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
      setControlDisabled(exportPngBtn, !engine.capabilities.exportPng || Boolean(payload.partialPreview));
      setControlDisabled(exportSvgBtn, !engine.capabilities.exportSvg || Boolean(payload.partialPreview));
      setControlDisabled(referenceSearchInput, Boolean(payload.partialPreview));
      setControlDisabled(referenceSearchBtn, Boolean(payload.partialPreview));
      setControlDisabled(netSearchEl, Boolean(payload.partialPreview));
      setControlDisabled(netHighlightBtn, Boolean(payload.partialPreview));
      const layerControlsEnabled = Boolean(engine.capabilities.layers);
      setControlDisabled(allLayersBtn, !layerControlsEnabled);
      setControlDisabled(noneLayersBtn, !layerControlsEnabled);
      setControlDisabled(copperLayersBtn, !layerControlsEnabled);
      setControlDisabled(layerNormalBtn, !layerControlsEnabled);
      setControlDisabled(layerDimBtn, !layerControlsEnabled);
      setControlDisabled(layerSoloBtn, !layerControlsEnabled);
      setControlDisabled(zoneFillsBtn, !layerControlsEnabled || Boolean(payload.partialPreview));
      layerListEl.querySelectorAll('input,button').forEach((control) => {
        setControlDisabled(control, !layerControlsEnabled ||
          (localState.layerMode === 'solo' && control.tagName === 'INPUT'));
      });
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
      applyRendererTheme(viewer, localState.theme || payload.theme || 'kicad');
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
      renderSidebar();
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
      layerActionsEl.replaceChildren();
      layerListEl.innerHTML = '';
      tuningListEl.innerHTML = '';
      notesListEl.innerHTML = '';

      const names = new Set(layers.map((layer) => layer.name));
      if (!Array.isArray(localState.activeLayers)) {
        localState.activeLayers = layers.filter((layer) => layer.visible !== false).map((layer) => layer.name);
      } else {
        localState.activeLayers = localState.activeLayers.filter((name) => names.has(name));
      }
      if (!names.has(localState.focusedLayer)) {
        localState.focusedLayer = layers.find((layer) => /\.Cu$/i.test(layer.name))?.name || layers[0]?.name;
      }
      if (!['normal', 'dim', 'solo'].includes(localState.layerMode)) {
        localState.layerMode = 'normal';
      }

      const mode = localState.layerMode;
      for (const [button, value] of [[layerNormalBtn, 'normal'], [layerDimBtn, 'dim'], [layerSoloBtn, 'solo']]) {
        if (!button) continue;
        button.setAttribute('aria-pressed', mode === value ? 'true' : 'false');
        button.classList.toggle('is-active', mode === value);
      }
      const visibleCount = mode === 'solo'
        ? Number(Boolean(localState.focusedLayer))
        : localState.activeLayers.length;
      if (layerCountEl) layerCountEl.textContent = visibleCount + '/' + layers.length + ' visible';
      if (layerHintEl) {
        layerHintEl.textContent = mode === 'solo'
          ? 'Solo: ' + (localState.focusedLayer || 'no layer') +
            '. Zone fills can cover tracks; turn them off to inspect routing.'
          : mode === 'dim'
            ? 'Focused: ' + (localState.focusedLayer || 'no layer') +
              '. Other visible layers are dimmed.'
            : 'Select a layer to focus; the swatches reflect KiCanvas render colors.';
        // Bundled KiCanvas maps source *.Cu through-hole pads to outer
        // :Pads:Front/:Pads:Back only. Do not imply that an empty inner
        // copper layer proves there are no source pad annular rings.
        if (
          payload.fileType === 'board' &&
          /^(?:F|B|In\d+)\.Cu$/i.test(localState.focusedLayer || '')
        ) {
          const isInnerLayer = /^In\d+\.Cu$/.test(localState.focusedLayer || '');
          const partial = payload.partialPreview;
          if (partial) {
            const total = partial.omittedSourceZones;
            const layerCount = partial.omittedZonesByLayer?.[localState.focusedLayer] ?? 0;
            if (Number.isSafeInteger(total) && total > 0 &&
                Number.isSafeInteger(layerCount) && layerCount >= 0) {
              const overlapping = partial.omittedZoneOutlinesInViewportByLayer?.[
                localState.focusedLayer
              ];
              const unknown = partial.unclassifiedZoneOutlinesByLayer?.[
                localState.focusedLayer
              ];
              const regionEvidence = Number.isSafeInteger(overlapping) || (
                partial.omittedZoneOutlinesInViewportByLayer &&
                partial.unclassifiedZoneOutlinesByLayer
              );
              layerHintEl.textContent +=
                ' PARTIAL: ' + layerCount + '/' + total +
                ' omitted source zones declare ' + localState.focusedLayer +
                (regionEvidence
                  ? '; ' + (overlapping ?? 0) + ' source zone outlines overlap this region' +
                    ((unknown ?? 0) > 0
                      ? ', ' + unknown + ' cannot be classified'
                      : '')
                  : ' (not necessarily in this region)') +
                '. Actual zone fills and electrical connectivity are unverified. ';
            }
          }
          const renderer = getKiCanvasViewer(
            viewerMount.querySelector('kicanvas-embed')
          );
          const hasInnerSourcePads = renderer?.board?.footprints?.some(
            (footprint) =>
              footprint.pads?.some(
                (pad) => Array.isArray(pad.layers) && pad.layers.includes('*.Cu')
              )
          );
          if (isInnerLayer && hasInnerSourcePads) {
            layerHintEl.textContent +=
              ' KiCanvas does not draw through-hole pad rings on inner copper. ' +
              'Missing pad graphics here do not prove absent copper. ';
            // Use the existing workspace-trust-gated native command. The
            // compact action is contextual; it never alters the PCB source.
            const verifyInKiCadBtn = document.createElement('button');
            verifyInKiCadBtn.type = 'button';
            verifyInKiCadBtn.id = 'inner-pad-open-kicad-btn';
            verifyInKiCadBtn.className = 'btn';
            verifyInKiCadBtn.textContent = 'Verify in KiCad';
            verifyInKiCadBtn.title =
              'Open this board in KiCad to inspect true inner-copper pad geometry';
            verifyInKiCadBtn.addEventListener('click', openInKiCad);
            layerActionsEl.appendChild(verifyInKiCadBtn);
          }
          // A useful inner copper layer need not contain any through-hole
          // pads. Offer the native source plot for tracks and vias too.
          const inspectBtn = document.createElement('button');
          inspectBtn.type = 'button';
          inspectBtn.id = 'native-copper-layer-btn';
          inspectBtn.className = 'btn';
          inspectBtn.textContent = payload.partialPreview
            ? 'Inspect partial layer'
            : 'Inspect native layer';
          inspectBtn.title = payload.partialPreview
            ? 'Read-only KiCad plot of this bounded, incomplete source preview'
            : 'Read-only plot of this copper layer by your installed KiCad CLI';
          inspectBtn.addEventListener('click', () =>
            inspectNativeCopperLayer(localState.focusedLayer, inspectBtn)
          );
          layerActionsEl.appendChild(inspectBtn);
          if (partial) {
            // The whole original board is a separate, deliberate, slower
            // inspection; never silently substitute it for a bounded page.
            const originalBtn = document.createElement('button');
            originalBtn.type = 'button';
            originalBtn.id = 'native-copper-original-btn';
            originalBtn.className = 'btn';
            originalBtn.textContent = 'Inspect original layer';
            originalBtn.title =
              'Read-only full-board native KiCad plot from a temporary copy of the original PCB; may take longer. Not DRC or net validation.';
            originalBtn.addEventListener('click', () =>
              inspectNativeCopperLayer(localState.focusedLayer, originalBtn, 'original')
            );
            layerActionsEl.appendChild(originalBtn);
          }
        }
      }
      if (zoneFillsBtn) {
        const fillsOmitted = Boolean(payload.partialPreview);
        const zoneFillsVisible = localState.zoneFillsVisible !== false;
        setControlDisabled(
          zoneFillsBtn,
          fillsOmitted || localState.engine?.capabilities?.layers === false
        );
        zoneFillsBtn.setAttribute(
          'aria-pressed',
          !fillsOmitted && zoneFillsVisible ? 'true' : 'false'
        );
        zoneFillsBtn.classList.toggle('is-active', !fillsOmitted && zoneFillsVisible);
        zoneFillsBtn.textContent = fillsOmitted
          ? 'Zone fills unavailable'
          : zoneFillsVisible ? 'Hide zone fills' : 'Show zone fills';
        if (fillsOmitted) {
          zoneFillsBtn.title =
            'All zones are omitted from this PARTIAL source preview. Open the full board in KiCad to inspect actual copper fills.';
        } else {
          zoneFillsBtn.removeAttribute('title');
        }
      }

      for (const layer of layers) {
        const row = document.createElement('div');
        row.className = 'layer-row';
        const checked = localState.activeLayers.includes(layer.name);
        row.classList.toggle('is-focused', layer.name === localState.focusedLayer);
        row.classList.toggle('is-hidden', !checked && mode !== 'solo');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = mode === 'solo' ? layer.name === localState.focusedLayer : checked;
        checkbox.disabled = mode === 'solo' || localState.engine?.capabilities?.layers === false;
        checkbox.setAttribute('aria-label', 'Show ' + layer.name);
        checkbox.addEventListener('change', () => {
          const activeLayers = new Set(localState.activeLayers || []);
          if (checkbox.checked) activeLayers.add(layer.name);
          else activeLayers.delete(layer.name);
          localState.activeLayers = [...activeLayers];
          postViewerState();
          applyLayerVisibility(viewerMount.querySelector('kicanvas-embed'));
          renderSidebar();
        });
        const swatch = document.createElement('span');
        swatch.className = 'layer-swatch';
        swatch.setAttribute('aria-hidden', 'true');
        const color = readRenderedLayerColor(viewerMount.querySelector('kicanvas-embed'), layer.name);
        swatch.dataset.colorSource = color ? 'renderer' : 'unavailable';
        if (color) swatch.style.backgroundColor = color;
        const select = document.createElement('button');
        select.type = 'button';
        select.className = 'layer-select';
        select.disabled = localState.engine?.capabilities?.layers === false;
        select.setAttribute('aria-pressed', layer.name === localState.focusedLayer ? 'true' : 'false');
        select.setAttribute('aria-label', 'Focus ' + layer.name);
        const name = document.createElement('span');
        name.textContent = layer.name;
        const kind = document.createElement('span');
        kind.className = 'layer-kind';
        kind.textContent = layer.kind || '';
        select.append(name, kind);
        select.addEventListener('click', () => {
          localState.focusedLayer = layer.name;
          if (localState.layerMode === 'normal') localState.layerMode = 'dim';
          postViewerState();
          applyLayerVisibility(viewerMount.querySelector('kicanvas-embed'));
          renderSidebar();
        });
        row.append(checkbox, swatch, select);
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

    function hasDrawableBoardOutline(embed) {
      // A declared Edge.Cuts layer does not guarantee any source outline
      // geometry. A bounded partial PCB can retain its layer declaration
      // while intentionally omitting the complete board contour.
      const bounds = getKiCanvasViewer(embed)?.layers?.by_name?.('Edge.Cuts')?.bbox;
      return Number.isFinite(bounds?.w) && Number.isFinite(bounds?.h) &&
        bounds.w > 0 && bounds.h > 0;
    }

    function getKiCanvasViewer(embed) {
      // The shipped KiCanvas exposes its board viewer through the shadow-root
      // app. Keep the mock/older direct shape as a compatibility fallback.
      // Schematic selection resolves its renderer separately only on demand.
      return embed?.viewer || embed?.shadowRoot?.querySelector('kc-board-app')?.viewer;
    }

    function repairSchematicCanvasLayout(embed) {
      if (payload.fileType !== 'schematic') return;
      const app = embed?.shadowRoot?.querySelector('kc-schematic-app');
      const host = app?.shadowRoot?.querySelector('kc-schematic-viewer');
      const canvas = host?.shadowRoot?.querySelector('canvas');
      if (!app || !host || !canvas ||
          !host.viewer?.renderer?.ctx2d ||
          (canvas.clientWidth > 0 && canvas.clientHeight > 0)) {
        return;
      }
      // Restrict changes to the known KiCanvas schematic renderer: do not
      // alter board layouts or inject styles into arbitrary webview content.
      app.style.display = 'block';
      app.style.width = '100%';
      app.style.height = '100%';
      host.style.display = 'flex';
      host.style.flex = '1 1 auto';
      host.style.width = '100%';
      host.style.height = '100%';
      host.style.minHeight = '0';
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      // Let KiCanvas' own resize/render lifecycle paint the new surface.
      // Calling its drawing methods before the renderer initializes can
      // throw while the internal canvas context is not yet available.
    }

    function resetNetInspector() {
      if (!netsSectionEl) return;
      netsSectionEl.hidden = true;
      netCatalog = [];
      netCountEl.textContent = '';
      netSuggestionsEl.replaceChildren();
      setControlDisabled(netSearchEl, true);
      setControlDisabled(netHighlightBtn, true);
      setControlDisabled(netClearBtn, true);
      netFeedbackEl.textContent = 'Available only in the interactive KiCanvas board viewer.';
    }

    function refreshNetSuggestions() {
      if (!netSuggestionsEl || !netSearchEl || !netCatalog.length) return;
      const filter = netSearchEl.value.trim().toLocaleLowerCase();
      const options = netCatalog
        .filter((net) => !filter || net.name.toLocaleLowerCase().includes(filter) || String(net.number).includes(filter))
        .slice(0, 40);
      netSuggestionsEl.replaceChildren();
      for (const net of options) {
        const option = document.createElement('option');
        option.value = net.name;
        option.label = '#' + net.number;
        netSuggestionsEl.appendChild(option);
      }
    }

    function initializeNetInspector(embed) {
      resetNetInspector();
      if (payload.partialPreview) {
        if (netsSectionEl) netsSectionEl.hidden = false;
        if (netCountEl) netCountEl.textContent = 'Partial geometry';
        if (netFeedbackEl) netFeedbackEl.textContent = 'Net tracing is unavailable in a partial preview. Open the complete board in KiCad.';
        return;
      }
      if (payload.fileType !== 'board') return;
      try {
        const viewer = getKiCanvasViewer(embed);
        const nets = viewer?.board?.nets;
        if (typeof viewer?.highlight_net !== 'function' || !Array.isArray(nets)) return;
        netsSectionEl.hidden = false;
        netCatalog = nets
          .filter((net) => Number.isSafeInteger(net?.number) && net.number > 0 && typeof net.name === 'string' && net.name.length > 0)
          .map((net) => ({ number: net.number, name: net.name }));
        netCountEl.textContent = netCatalog.length + (netCatalog.length === 1 ? ' net' : ' nets');
        if (!netCatalog.length) {
          highlightedNetName = '';
          netSearchEl.value = '';
          if (sourceHasNamedNets) {
            netCountEl.textContent = 'Nets unavailable';
            netFeedbackEl.textContent =
              'This PCB contains named nets, but the renderer did not expose them. ' +
              'Reload the viewer; net highlighting is unavailable until they load.';
          } else {
            netFeedbackEl.textContent = 'No named nets found in this board.';
          }
          if (sourceHasNamedNets && netCatalogRetries < 4) {
            // A large document can finish painting before the renderer's
            // async net catalog becomes available. Retry only for the current
            // viewer generation, never select net numbers from an old board.
            netCatalogRetries++;
            const generation = viewerGeneration;
            window.setTimeout(() => {
              if (generation !== viewerGeneration || !embed?.isConnected) return;
              initializeNetInspector(embed);
            }, netCatalogRetries * 350);
          }
          return;
        }
        netCatalogRetries = 0;
        setControlDisabled(netSearchEl, false);
        setControlDisabled(netHighlightBtn, false);
        netSearchEl.value = highlightedNetName;
        refreshNetSuggestions();
        if (highlightedNetName) {
          const previous = netCatalog.find((net) => net.name === highlightedNetName);
          if (previous) {
            viewer.highlight_net(previous.number);
            setControlDisabled(netClearBtn, false);
            setNetFeedback(previous, viewer);
            return;
          }
          // The old net may not exist after a PCB refresh; never select the
          // same numeric ID in a different board by accident.
          highlightedNetName = '';
          netSearchEl.value = '';
        }
        netFeedbackEl.textContent = 'Choose a net to highlight its PCB copper connections.';
      } catch {
        resetNetInspector();
      }
    }

    function setNetFeedback(net, viewer) {
      const segments = Array.isArray(viewer.board?.segments)
        ? viewer.board.segments.filter((item) => item.net === net.number).length : 0;
      const vias = Array.isArray(viewer.board?.vias)
        ? viewer.board.vias.filter((item) => item.net === net.number).length : 0;
      netFeedbackEl.textContent = net.name + ' · ' + segments + ' tracks/arcs · ' + vias + ' vias';
    }

    function highlightSearchedNet() {
      if (payload.partialPreview) return;
      const value = netSearchEl?.value;
      if (!value || !value.trim() || !netCatalog.length) return;
      // Net names are case-sensitive KiCad identifiers. Only accept an exact
      // model match or its numeric ID, never a guessed partial match.
      const net = netCatalog.find((item) => item.name === value) ||
        netCatalog.find((item) => String(item.number) === value.trim());
      if (!net) {
        netFeedbackEl.textContent = 'No exact net match. Select a suggestion or enter a net number.';
        return;
      }
      try {
        const viewer = getKiCanvasViewer(viewerMount.querySelector('kicanvas-embed'));
        if (typeof viewer?.highlight_net !== 'function') throw new Error('Net API unavailable');
        viewer.highlight_net(net.number);
        highlightedNetName = net.name;
        netSearchEl.value = net.name;
        setControlDisabled(netClearBtn, false);
        setNetFeedback(net, viewer);
      } catch {
        netFeedbackEl.textContent = 'Net highlight is unavailable in this renderer.';
        setControlDisabled(netHighlightBtn, true);
      }
    }

    function clearNetHighlight() {
      try {
        const viewer = getKiCanvasViewer(viewerMount.querySelector('kicanvas-embed'));
        if (typeof viewer?.highlight_net !== 'function') return;
        // KiCad net numbers are nonnegative; -1 produces an empty overlay
        // using the bundled KiCanvas painter without touching the source.
        viewer.highlight_net(-1);
        highlightedNetName = '';
        netSearchEl.value = '';
        setControlDisabled(netClearBtn, true);
        refreshNetSuggestions();
        netFeedbackEl.textContent = 'Net highlight cleared.';
      } catch {
        netFeedbackEl.textContent = 'Unable to clear net highlight.';
      }
    }

    function readRenderedLayerColor(viewer, name) {
      try {
        const css = getKiCanvasViewer(viewer)?.layers?.by_name?.(name)?.color?.to_css?.();
        return typeof css === 'string' && /^(?:rgba?\(|#[0-9a-f]{3,8}$)/i.test(css) ? css : '';
      } catch {
        // Color is an optional hint, never an invented representation of the board.
        return '';
      }
    }

    function setLayerMode(mode) {
      if (!['normal', 'dim', 'solo'].includes(mode)) return;
      localState.layerMode = mode;
      applyLayerVisibility(viewerMount.querySelector('kicanvas-embed'));
      renderSidebar();
      postViewerState();
    }

    function setZoneFillsVisible(visible) {
      // The partial source contains zero zones, regardless of saved toggle state.
      if (payload.partialPreview) return;
      localState = { ...localState, zoneFillsVisible: Boolean(visible) };
      applyLayerVisibility(viewerMount.querySelector('kicanvas-embed'));
      renderSidebar();
      postViewerState();
    }

    function applyLayerVisibility(viewer) {
      if (!viewer || !Array.isArray(localState.activeLayers)) return;
      const names = new Set((payload.metadata?.layers || []).map((layer) => layer.name));
      const focus = names.has(localState.focusedLayer) ? localState.focusedLayer : undefined;
      const mode = ['normal', 'dim', 'solo'].includes(localState.layerMode) ? localState.layerMode : 'normal';
      const visible = mode === 'solo' && focus ? [focus] : localState.activeLayers;
      const selected = new Set(visible);
      try {
        viewer.setAttribute('layers', visible.join(','));
      } catch {
        // The optional embed attribute is not part of the stable KiCanvas API.
      }
      try {
        const internalViewer = getKiCanvasViewer(viewer);
        const layerSet = internalViewer?.layers;
        if (!layerSet?.in_order || !layerSet?.highlight) return;
        // Leave synthetic renderer layers (pads, vias, overlays) intact.
        // Only PCB document layers listed by the parser are user-controllable.
        for (const layer of Array.from(layerSet.in_order())) {
          if (names.has(layer.name)) layer.visible = selected.has(layer.name);
        }
        if (mode === 'dim' && focus && selected.has(focus)) {
          layerSet.highlight(layerSet.by_name?.(focus) ?? focus);
        } else if (mode === 'solo' && focus) {
          layerSet.highlight(layerSet.by_name?.(focus) ?? focus);
        } else {
          layerSet.highlight(null);
        }
        if ('zone_opacity' in internalViewer) {
          // KiCanvas exposes zone opacity as a write-only property setter,
          // rather than a set_zone_opacity() function.
          internalViewer.zone_opacity = localState.zoneFillsVisible === false ? 0 : 1;
        } else {
          internalViewer.draw?.();
        }
      } catch {
        // Do not turn a renderer-internal API mismatch into a broken viewer.
      }
    }

    function setAllLayers(visible) {
      const layers = payload.metadata?.layers || [];
      localState = {
        ...localState,
        layerMode: 'normal',
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
        layerMode: 'normal',
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

`;
}
