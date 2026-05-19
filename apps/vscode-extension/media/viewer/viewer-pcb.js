/* global acquireVsCodeApi, atob, customElements, document, window */

(function () {
  const vscode = acquireVsCodeApi();
  const loading = document.getElementById('loading-overlay');
  const errorOverlay = document.getElementById('error-overlay');
  const errorMessage = document.getElementById('error-message');
  const errorDetails = document.getElementById('error-details');
  const diagnosticBanner = document.getElementById('diagnostic-banner');
  const layerList = document.getElementById('layer-list');
  const statusText = document.getElementById('status-text');
  const layerStatus = document.getElementById('layer-status');
  const inspector = document.getElementById('component-info');
  const sourcePreview = document.getElementById('source-preview');
  let viewer = document.getElementById('viewer');
  let loadWatcher;
  let loadTimeout;
  let lastText = '';
  let lastFileName = '';

  function clearLoadWatcher() {
    if (loadWatcher) {
      window.clearInterval(loadWatcher);
      loadWatcher = undefined;
    }
    if (loadTimeout) {
      window.clearTimeout(loadTimeout);
      loadTimeout = undefined;
    }
  }

  function hideError() {
    errorOverlay.style.display = 'none';
    errorMessage.textContent = '';
    errorDetails.textContent = '';
  }

  function showError(text) {
    clearLoadWatcher();
    loading.style.display = 'none';
    errorOverlay.style.display = 'grid';
    errorMessage.textContent = text;
    errorDetails.textContent = lastText
      ? `File: ${lastFileName}\n\nPreview:\n${lastText.slice(0, 4000)}`
      : 'No source preview is available yet.';
    statusText.textContent = text;
    diagnosticBanner.textContent = text;
  }

  function currentViewer() {
    return viewer;
  }

  function renderLayers(layers) {
    layerList.replaceChildren();
    for (const layer of layers) {
      const row = document.createElement('label');
      row.className = 'layer-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = layer.enabled === true;
      input.disabled = layer.supported === false;

      const color = document.createElement('span');
      color.className = 'layer-color';
      color.style.backgroundColor = normalizeColor(layer.color);

      const name = document.createElement('span');
      name.textContent = String(layer.name ?? '');

      row.append(input, color, name);
      layerList.appendChild(row);
    }
  }

  function watchViewerState(fileName) {
    clearLoadWatcher();
    statusText.textContent = `Loading ${fileName}...`;
    loadTimeout = window.setTimeout(() => {
      showError(
        `Timed out while rendering ${fileName}. Try Developer: Reload Window and reopen the file. If the problem continues, inspect Help > Toggle Developer Tools > Console.`
      );
    }, 12000);
    loadWatcher = window.setInterval(() => {
      if (!viewer || !document.body.contains(viewer)) {
        clearLoadWatcher();
        return;
      }

      if (viewer.loaded === true) {
        clearLoadWatcher();
        loading.style.display = 'none';
        hideError();
        statusText.textContent = `Viewer ready: ${fileName}`;
        diagnosticBanner.textContent = `Viewer ready: ${fileName}`;
        vscode.postMessage({ type: 'ready' });
        return;
      }

      if (viewer.loading === true) {
        statusText.textContent = `Rendering ${fileName}...`;
        diagnosticBanner.textContent = `Rendering ${fileName}...`;
      }
    }, 150);
  }

  function createViewerElement(text, fileName) {
    if (
      !customElements.get('kicanvas-embed') ||
      !customElements.get('kicanvas-source')
    ) {
      showError(
        'KiCanvas did not initialize inside the webview. Reload the window and reopen the board. If it still fails, open Help > Toggle Developer Tools and check the Console.'
      );
      return;
    }

    const nextViewer = document.createElement('kicanvas-embed');
    nextViewer.id = 'viewer';
    nextViewer.setAttribute('controls', 'full');
    nextViewer.setAttribute('controlslist', 'zoom pan select');
    nextViewer.setAttribute('theme', 'kicad');

    const source = document.createElement('kicanvas-source');
    source.setAttribute('name', fileName);
    source.setAttribute('type', 'board');
    source.textContent = text;
    nextViewer.appendChild(source);

    viewer.replaceWith(nextViewer);
    viewer = nextViewer;
    watchViewerState(fileName);
  }

  function setViewerSource(base64Text, fileName) {
    if (!base64Text) {
      statusText.textContent = `Interactive payload for ${fileName} was not embedded.`;
      diagnosticBanner.textContent = `Interactive payload for ${fileName} is not embedded.`;
      return;
    }
    try {
      loading.style.display = 'grid';
      hideError();
      const text = atob(base64Text);
      lastText = text;
      lastFileName = fileName;
      createViewerElement(text, fileName);
      statusText.textContent = `Loaded ${Math.round(text.length / 1024)} KB`;
      diagnosticBanner.textContent = `Source received: ${fileName}`;
      if (sourcePreview && !sourcePreview.textContent.trim()) {
        sourcePreview.textContent = text.slice(0, 12000);
      }
    } catch (error) {
      showError(
        error instanceof Error ? error.message : 'Failed to decode PCB data.'
      );
    }
  }

  function renderSummary(summary) {
    if (!Array.isArray(summary) || !summary.length) {
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of summary) {
      const row = document.createElement('div');
      row.className = 'property-item';
      const label = document.createElement('strong');
      label.textContent = String(item.label ?? '');
      const value = document.createElement('span');
      value.textContent = String(item.value ?? '');
      row.append(label, value);
      fragment.appendChild(row);
    }
    inspector.replaceChildren(fragment);
  }

  function loadInitialPayload() {
    const payloadEl = document.getElementById('initial-payload');
    if (!payloadEl?.textContent) {
      diagnosticBanner.textContent =
        'Initial payload was not embedded. Waiting for extension message.';
      return;
    }

    try {
      const payload = JSON.parse(payloadEl.textContent);
      renderSummary(payload.summary);
      renderLayers(payload.layers || []);
      if (
        sourcePreview &&
        typeof payload.preview === 'string' &&
        !sourcePreview.textContent.trim()
      ) {
        sourcePreview.textContent = payload.preview;
      }
      if (payload.base64 && payload.fileName) {
        setViewerSource(payload.base64, payload.fileName);
      } else if (payload.fileName) {
        statusText.textContent = `Interactive payload for ${payload.fileName} is not embedded.`;
        diagnosticBanner.textContent = `Interactive payload for ${payload.fileName} is not embedded.`;
      }
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : 'Failed to parse initial viewer payload.'
      );
    }
  }

  function normalizeColor(value) {
    const color = String(value ?? '').trim();
    return /^#[0-9a-f]{3,8}$/i.test(color) ? color : 'transparent';
  }

  document
    .getElementById('btn-zoom-fit')
    .addEventListener('click', () => currentViewer()?.fitToScreen?.());
  document
    .getElementById('btn-zoom-in')
    .addEventListener('click', () => currentViewer()?.zoomIn?.());
  document
    .getElementById('btn-zoom-out')
    .addEventListener('click', () => currentViewer()?.zoomOut?.());
  document
    .getElementById('btn-grid')
    .addEventListener('click', () => currentViewer()?.toggleGrid?.());
  document.getElementById('btn-theme').addEventListener('click', () => {
    layerStatus.textContent =
      'KiCanvas theme toggling is currently handled by the embedded viewer theme.';
  });
  document.getElementById('btn-open-kicad').addEventListener('click', () => {
    vscode.postMessage({ type: 'openInKiCad' });
  });
  for (const button of document.querySelectorAll('[data-preset]')) {
    button.addEventListener('click', () => {
      layerStatus.textContent = `Preset ${button.dataset.preset} selected. Layer toggling depends on bundled KiCanvas support.`;
    });
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'load' || message.type === 'refresh') {
      renderSummary(message.payload.summary || []);
      if (sourcePreview && typeof message.payload.preview === 'string') {
        sourcePreview.textContent = message.payload.preview;
      }
      setViewerSource(message.payload.base64, message.payload.fileName);
      renderLayers(message.payload.layers || []);
    }
    if (message.type === 'showMessage') {
      statusText.textContent = message.payload.text || '';
    }
    if (message.type === 'error') {
      showError(message.payload.text || 'Unknown viewer error.');
    }
  });

  window.addEventListener('error', (event) => {
    showError(`Viewer script error: ${event.message}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason ?? 'Unknown promise rejection');
    showError(`Viewer runtime error: ${reason}`);
  });

  loadInitialPayload();
})();
