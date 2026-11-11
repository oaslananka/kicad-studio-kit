export function createViewerControllerFallbackScript(): string {
  return String.raw`    function updateSelectionSummary() {
      if (!localState.selectedArea) {
        selectionSummaryEl.textContent = 'No lasso area selected.';
        return;
      }
      const area = localState.selectedArea;
      selectionSummaryEl.textContent =
        'Selected area: (' + area.x1 + ', ' + area.y1 + ') → (' + area.x2 + ', ' + area.y2 + ')';
    }

    function exportPng() {
      const canvas = findRenderSurfaces(viewerMount).find((entry) => entry instanceof HTMLCanvasElement);
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
      const embed = viewerMount.querySelector('kicanvas-embed');
      if (embed) {
        const renderer = getKiCanvasViewer(embed);
        let fitted = false;
        try {
          if (payload.fileType === 'board' &&
              renderer?.layers?.by_name?.('Edge.Cuts')?.bbox?.w > 0 &&
              typeof renderer.zoom_to_board === 'function') {
            renderer.zoom_to_board();
            renderer.draw?.();
            fitted = true;
          } else if (typeof renderer?.zoom_to_page === 'function') {
            renderer.zoom_to_page();
            fitted = true;
          } else if (typeof embed.fitToScreen === 'function') {
            // Older embeds and deterministic test doubles expose this helper.
            embed.fitToScreen();
            fitted = true;
          }
        } catch {
          setStatus('Fit is unavailable for the current PCB geometry.');
          return;
        }
        if (!fitted) {
          setStatus('Fit is unavailable in this renderer.');
          return;
        }
        const cameraZoom = renderer?.viewport?.camera?.zoom;
        if (Number.isFinite(cameraZoom) && cameraZoom > 0) fittedCameraZoom = cameraZoom;
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
      const embed = viewerMount.querySelector('kicanvas-embed');
      if (embed) {
        const renderer = getKiCanvasViewer(embed);
        const camera = renderer?.viewport?.camera;
        if (Number.isFinite(camera?.zoom) && camera.zoom > 0 &&
            typeof renderer.draw === 'function') {
          const currentZoom = camera.zoom;
          const factor = direction > 0 ? 1.2 : 1 / 1.2;
          const nextZoom = Math.min(2000, Math.max(0.01, currentZoom * factor));
          if (nextZoom === currentZoom) return;
          try {
            camera.zoom = nextZoom;
            renderer.draw();
          } catch {
            camera.zoom = currentZoom;
            setStatus('Zoom is unavailable in this renderer.');
            return;
          }
          if (!fittedCameraZoom) fittedCameraZoom = currentZoom;
          localState = {
            ...localState,
            zoom: Number((nextZoom / fittedCameraZoom).toFixed(2))
          };
        } else if (direction > 0 && typeof embed.zoomIn === 'function') {
          embed.zoomIn();
          localState = { ...localState, zoom: Number((localState.zoom + 0.1).toFixed(2)) };
        } else if (direction < 0 && typeof embed.zoomOut === 'function') {
          embed.zoomOut();
          localState = { ...localState, zoom: Number(Math.max(0.1, localState.zoom - 0.1).toFixed(2)) };
        } else {
          setStatus('Zoom is unavailable in this renderer.');
          return;
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

    async function trySvgFallback(reason, generation = viewerGeneration) {
      showLoading('Interactive renderer stayed blank. Requesting SVG fallback…');
      const svgText = await requestSvgFallback(reason);
      if (!svgText || generation !== viewerGeneration) {
        return false;
      }
      showSvgFallback(svgText);
      rendererInitializing = false;
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

    function showSvgFallback(svgText, originalRegion) {
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
      fallbackOriginalRegion = originalRegion || null;
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
        fitSvgFallback(true, true);
      });
      setViewerSurfaceVisible(true);
      hideAll();
      clearKeyboardShortcuts();
    }

    function pageFallbackFitScale() {
      const availableWidth = Math.max(1, fallbackSvgWrapper.clientWidth - 40);
      const availableHeight = Math.max(1, fallbackSvgWrapper.clientHeight - 40);
      return Math.min(
        availableWidth / fallbackSvgSize.width,
        availableHeight / fallbackSvgSize.height
      );
    }

    function getSchematicFocusBounds() {
      if (payload.fileType !== 'schematic' || !fallbackSvgElement || !fallbackSvgSize) return null;
      // The schematic coordinate model is only shared with KiCad CLI's native
      // Eeschema SVG. Do not crop arbitrary/custom SVG fallbacks with unrelated units.
      if (!fallbackSvgElement.querySelector('desc')?.textContent?.includes('Image generated by Eeschema-SVG')) return null;
      const focus = payload.schematicFocus;
      const page = parseSvgViewBox(fallbackSvgElement.getAttribute('viewBox')) || {
        minX: 0, minY: 0, width: fallbackSvgSize.width, height: fallbackSvgSize.height
      };
      if (!focus || ![focus.minX, focus.minY, focus.width, focus.height].every(Number.isFinite)) {
        return null;
      }
      if (focus.width <= 0 || focus.height <= 0 ||
          focus.width >= page.width * 0.85 || focus.height >= page.height * 0.85 ||
          focus.minX < page.minX - 2 || focus.minY < page.minY - 2 ||
          focus.minX + focus.width > page.minX + page.width + 2 ||
          focus.minY + focus.height > page.minY + page.height + 2) {
        return null;
      }
      return { focus, page };
    }

    function getOriginalBoardFocusBounds() {
      if (payload.fileType !== 'board' || !fallbackSvgElement || !fallbackOriginalRegion) return null;
      // KiCad page-size-mode 0 uses absolute PCB millimetres. Never infer a
      // spatial mapping from the fitted (mode 2) plot or arbitrary SVG.
      if (!fallbackSvgElement.querySelector('desc')?.textContent?.includes('Image generated by PCBNEW')) return null;
      const viewBox = parseSvgViewBox(fallbackSvgElement.getAttribute('viewBox'));
      const widthMm = fallbackSvgElement.getAttribute('width');
      const heightMm = fallbackSvgElement.getAttribute('height');
      if (!viewBox || !/^\d+(?:\.\d+)?mm$/.test(widthMm || '') ||
          !/^\d+(?:\.\d+)?mm$/.test(heightMm || '') ||
          Math.abs(Number.parseFloat(widthMm) - viewBox.width) > 1 ||
          Math.abs(Number.parseFloat(heightMm) - viewBox.height) > 1 ||
          Math.abs(viewBox.minX) > 0.01 || Math.abs(viewBox.minY) > 0.01) return null;
      const region = fallbackOriginalRegion;
      const values = [region.minX, region.maxX, region.minY, region.maxY];
      if (!values.every(Number.isFinite) || region.maxX <= region.minX ||
          region.maxY <= region.minY || region.minX < 0 || region.minY < 0 ||
          region.maxX > viewBox.width || region.maxY > viewBox.height) return null;
      const margin = Math.max(1, Math.min(region.maxX - region.minX,
        region.maxY - region.minY) * 0.05);
      const minX = Math.max(0, region.minX - margin);
      const minY = Math.max(0, region.minY - margin);
      const width = Math.min(viewBox.width, region.maxX + margin) - minX;
      const height = Math.min(viewBox.height, region.maxY + margin) - minY;
      if (width <= 0 || height <= 0 ||
          width > viewBox.width * 0.85 || height > viewBox.height * 0.85) return null;
      return { focus: { minX, minY, width, height }, page: viewBox };
    }

    function fitSvgFallback(resetScroll, preferContent) {
      if (!fallbackSvgElement || !fallbackSvgWrapper || !fallbackSvgSize) return;
      fallbackSvgFitScale = pageFallbackFitScale();
      const target = preferContent
        ? (getOriginalBoardFocusBounds() || getSchematicFocusBounds()) : null;
      const focusedScale = target ? Math.min(
        (fallbackSvgWrapper.clientWidth - 40) / target.focus.width,
        (fallbackSvgWrapper.clientHeight - 40) / target.focus.height,
        fallbackSvgFitScale * 4
      ) : fallbackSvgFitScale;
      fallbackAutoFocus = Boolean(target && focusedScale >= fallbackSvgFitScale * 1.15);
      fallbackSvgScale = fallbackAutoFocus ? focusedScale : fallbackSvgFitScale;
      fallbackUserZoomed = false;
      applyFallbackSvgScale(resetScroll !== false);
      if (fallbackAutoFocus && resetScroll !== false && target) {
        const renderedWidth = fallbackSvgSize.width * fallbackSvgScale;
        const renderedHeight = fallbackSvgSize.height * fallbackSvgScale;
        const stageOffsetX = Math.max(0, (fallbackSvgStage.clientWidth - renderedWidth) / 2);
        const stageOffsetY = Math.max(0, (fallbackSvgStage.clientHeight - renderedHeight) / 2);
        fallbackSvgWrapper.scrollLeft = clamp(
          stageOffsetX + (target.focus.minX + target.focus.width / 2 - target.page.minX) * fallbackSvgScale - fallbackSvgWrapper.clientWidth / 2,
          0, Math.max(0, fallbackSvgWrapper.scrollWidth - fallbackSvgWrapper.clientWidth)
        );
        fallbackSvgWrapper.scrollTop = clamp(
          stageOffsetY + (target.focus.minY + target.focus.height / 2 - target.page.minY) * fallbackSvgScale - fallbackSvgWrapper.clientHeight / 2,
          0, Math.max(0, fallbackSvgWrapper.scrollHeight - fallbackSvgWrapper.clientHeight)
        );
      }
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
        .split(/[\s,]+/)
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
        if (!fallbackUserZoomed) {
          fitSvgFallback(true, fallbackAutoFocus);
          return;
        }
        // Resizing a split editor must not reset the user's zoom or viewport.
        const priorScale = fallbackSvgScale;
        const focusX = (fallbackSvgWrapper.scrollLeft + fallbackSvgWrapper.clientWidth / 2) / priorScale;
        const focusY = (fallbackSvgWrapper.scrollTop + fallbackSvgWrapper.clientHeight / 2) / priorScale;
        fallbackSvgFitScale = pageFallbackFitScale();
        fallbackSvgScale = clamp(priorScale,
          Math.max(fallbackSvgFitScale * 0.5, 0.05), getFallbackMaxZoomScale());
        applyFallbackSvgScale(false);
        fallbackSvgWrapper.scrollLeft = clamp(
          focusX * fallbackSvgScale - fallbackSvgWrapper.clientWidth / 2,
          0, Math.max(0, fallbackSvgWrapper.scrollWidth - fallbackSvgWrapper.clientWidth)
        );
        fallbackSvgWrapper.scrollTop = clamp(
          focusY * fallbackSvgScale - fallbackSvgWrapper.clientHeight / 2,
          0, Math.max(0, fallbackSvgWrapper.scrollHeight - fallbackSvgWrapper.clientHeight)
        );
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
      fallbackUserZoomed = true;
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

    function showEmpty(message, preview, title, isOversizedPcb = false) {
      setViewerSurfaceVisible(false);
      hideAll();
      emptyEl.hidden = false;
      if (emptyTitleEl) emptyTitleEl.textContent = title || 'No drawable objects yet';
      if (emptyExplanationEl) {
        emptyExplanationEl.textContent = isOversizedPcb
          ? message
          : defaultEmptyExplanation;
      }
      if (emptyGuidanceEl) {
        emptyGuidanceEl.textContent = isOversizedPcb
          ? 'Your board is not empty. Preview a small, incomplete read-only region, or open the full design in KiCad. Partial previews must not be used for DRC, export, or manufacturing.'
          : defaultEmptyGuidance;
      }
      if (largePcbActionsEl) largePcbActionsEl.hidden = !isOversizedPcb;
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
        if (ev.key === 'f' || ev.key === 'F') fitCurrentViewer();
        if (ev.key === '+' || ev.key === '=') zoomCurrentViewer(1);
        if (ev.key === '-') zoomCurrentViewer(-1);
        if (ev.key === 'r' || ev.key === 'R') {
          vscode.postMessage({ type: 'requestRefresh' });
        }
      };
      window.addEventListener('keydown', keydownHandler);
    }
  })();`;
}
