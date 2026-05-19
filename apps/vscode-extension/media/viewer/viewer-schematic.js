/* global acquireVsCodeApi, atob, customElements, document, window */

(function () {
  const vscode = acquireVsCodeApi();
  const loading = document.getElementById('loading-overlay');
  const errorOverlay = document.getElementById('error-overlay');
  const errorMessage = document.getElementById('error-message');
  const errorDetails = document.getElementById('error-details');
  const diagnosticBanner = document.getElementById('diagnostic-banner');
  const statusText = document.getElementById('status-text');
  const infoPanel = document.getElementById('component-info');
  const sourcePreview = document.getElementById('source-preview');
  let viewer = document.getElementById('viewer');
  let state = vscode.getState() || { grid: true, theme: 'dark' };
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

  function createViewerElement(text, fileName, type) {
    if (
      !customElements.get('kicanvas-embed') ||
      !customElements.get('kicanvas-source')
    ) {
      showError(
        'KiCanvas did not initialize inside the webview. Reload the window and reopen the file. If it still fails, open Help > Toggle Developer Tools and check the Console.'
      );
      return;
    }

    const nextViewer = document.createElement('kicanvas-embed');
    nextViewer.id = 'viewer';
    nextViewer.setAttribute('controls', 'full');
    nextViewer.setAttribute('controlslist', 'zoom pan select');
    nextViewer.setAttribute(
      'theme',
      state.theme === 'light' ? 'kicad' : 'kicad'
    );

    const source = document.createElement('kicanvas-source');
    source.setAttribute('name', fileName);
    source.setAttribute('type', type);
    source.textContent = text;
    nextViewer.appendChild(source);

    viewer.replaceWith(nextViewer);
    viewer = nextViewer;
    watchViewerState(fileName);
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
      createViewerElement(text, fileName, 'schematic');
      if (sourcePreview && !sourcePreview.textContent.trim()) {
        sourcePreview.textContent = text.slice(0, 12000);
      }
      diagnosticBanner.textContent = `Source received: ${fileName}`;
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : 'Failed to decode schematic data.'
      );
    }
  }

  function currentViewer() {
    return viewer;
  }

  function bindButtons() {
    document
      .getElementById('btn-zoom-fit')
      .addEventListener('click', () => currentViewer()?.fitToScreen?.());
    document
      .getElementById('btn-zoom-in')
      .addEventListener('click', () => currentViewer()?.zoomIn?.());
    document
      .getElementById('btn-zoom-out')
      .addEventListener('click', () => currentViewer()?.zoomOut?.());
    document.getElementById('btn-grid').addEventListener('click', () => {
      state.grid = !state.grid;
      currentViewer()?.toggleGrid?.();
      vscode.setState(state);
    });
    document.getElementById('btn-theme').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      vscode.setState(state);
      statusText.textContent = `Theme hint set to ${state.theme}.`;
    });
    document.getElementById('btn-open-kicad').addEventListener('click', () => {
      vscode.postMessage({ type: 'openInKiCad' });
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'f' || event.key === 'F')
        currentViewer()?.fitToScreen?.();
      if (event.key === '+' || event.key === '=') currentViewer()?.zoomIn?.();
      if (event.key === '-') currentViewer()?.zoomOut?.();
      if (event.key === 'g' || event.key === 'G')
        currentViewer()?.toggleGrid?.();
    });
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
    infoPanel.replaceChildren(fragment);
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

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'load' || message.type === 'refresh') {
      renderSummary(message.payload.summary || []);
      if (sourcePreview && typeof message.payload.preview === 'string') {
        sourcePreview.textContent = message.payload.preview;
      }
      setViewerSource(message.payload.base64, message.payload.fileName);
    }
    if (message.type === 'highlight' && message.payload.reference) {
      const row = document.createElement('div');
      row.className = 'property-item';
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Reference';
      const reference = document.createElement('strong');
      reference.textContent = String(message.payload.reference);
      row.append(badge, reference);
      infoPanel.replaceChildren(row);
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

  bindButtons();
  loadInitialPayload();
})();
