/* global acquireVsCodeApi, atob, customElements, document, TextDecoder, window */
(function () {
  const vscode = acquireVsCodeApi();
  const leftContainer = document.getElementById('viewer-left-container');
  const rightContainer = document.getElementById('viewer-right-container');
  const viewerGrid = document.getElementById('diff-viewer-grid');
  const statusText = document.getElementById('status-text');
  const diffList = document.getElementById('diff-list');
  const errorOverlay = document.getElementById('error-overlay');
  const errorMessage = document.getElementById('error-message');
  const errorDetails = document.getElementById('error-details');

  let leftViewer;
  let rightViewer;

  function decodeBase64Utf8(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  }

  async function waitForKiCanvas() {
    await waitForDefinition('kicanvas-embed', 8000);
    await waitForDefinition('kicanvas-source', 8000);
  }

  function waitForDefinition(tagName, timeoutMs) {
    return Promise.race([
      customElements.whenDefined(tagName),
      new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(
            new Error(
              `${tagName} was not registered by KiCanvas within ${timeoutMs / 1000}s.`
            )
          );
        }, timeoutMs);
      })
    ]);
  }

  function showError(title, details) {
    errorOverlay.hidden = false;
    errorMessage.textContent = title;
    errorDetails.textContent = details || '';
    statusText.textContent = title;
  }

  function hideError() {
    errorOverlay.hidden = true;
    errorMessage.textContent = '';
    errorDetails.textContent = '';
  }

  function setEmpty(container, text) {
    container.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'diff-empty-state';
    empty.textContent = text;
    container.appendChild(empty);
  }

  async function renderKiCanvas(container, base64, fileName, fileType, label) {
    if (!base64) {
      setEmpty(container, `${label} has no file content for this revision.`);
      return undefined;
    }

    const sourceText = decodeBase64Utf8(base64).trimStart();
    if (!sourceText) {
      setEmpty(container, `${label} is empty in this revision.`);
      return undefined;
    }

    await waitForKiCanvas();

    const viewer = document.createElement('kicanvas-embed');
    viewer.setAttribute('controls', 'basic');
    viewer.setAttribute('controlslist', 'zoom pan select');
    // Use 'light' for schematics so the diff panels have a neutral white
    // background instead of the cyan eeschema background from the 'kicad' theme.
    // PCB files keep 'kicad' which gives the expected dark board surface.
    viewer.setAttribute('theme', fileType === 'board' ? 'kicad' : 'light');

    const source = document.createElement('kicanvas-source');
    source.setAttribute('name', fileName);
    source.setAttribute('type', fileType === 'board' ? 'board' : 'schematic');
    source.textContent = sourceText;
    viewer.appendChild(source);

    container.replaceChildren(viewer);
    return viewer;
  }

  function waitForViewer(viewer, label) {
    if (!viewer) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        window.clearInterval(poll);
        statusText.textContent = `${label} is still rendering. Use Developer Tools if it remains blank.`;
        resolve();
      }, 15000);

      const poll = window.setInterval(() => {
        if (viewer.loaded === true || viewer.getAttribute('loaded') !== null) {
          window.clearTimeout(timeout);
          window.clearInterval(poll);
          viewer.fitToScreen?.();
          resolve();
        }
      }, 150);
    });
  }

  const DIFF_TYPE_PREFIX = { added: '+', removed: '−', changed: '~' };

  function renderDiffList(components) {
    const fragment = document.createDocumentFragment();
    for (const component of components || []) {
      const reference = component.reference || component.uuid || '?';
      const type = component.type || 'changed';
      const prefix = DIFF_TYPE_PREFIX[type] ?? '~';

      const button = document.createElement('button');
      button.className = 'layer-item';
      button.dataset.reference = reference;
      button.setAttribute('aria-label', `${type} component: ${reference}`);

      const badge = document.createElement('span');
      badge.className = 'badge';
      // Text prefix ensures the type is conveyed without relying on color alone.
      badge.textContent = `${prefix} ${type}`;

      const label = document.createElement('strong');
      label.textContent = reference;

      button.append(badge, label);
      button.addEventListener('click', () => {
        vscode.postMessage({
          type: 'navigate',
          payload: { reference }
        });
      });
      fragment.appendChild(button);
    }
    diffList.replaceChildren(fragment);
  }

  function renderComponentOverlays(container, components, side) {
    container
      .querySelectorAll('.diff-component-overlay')
      .forEach((overlay) => overlay.remove());
    const overlayRoot = document.createElement('div');
    overlayRoot.className = 'diff-component-overlays';
    for (const component of components || []) {
      const overlay = document.createElement('button');
      overlay.className = 'diff-component-overlay';
      overlay.dataset.reference = component.reference || component.uuid || '';
      overlay.dataset.type = component.type || 'changed';
      overlay.textContent = `${component.type || 'changed'} ${component.reference || component.uuid || 'object'}`;
      overlay.addEventListener('click', () => {
        vscode.postMessage({
          type: 'navigate',
          payload: {
            reference: component.reference || component.uuid || '',
            side
          }
        });
      });
      overlayRoot.appendChild(overlay);
    }
    container.appendChild(overlayRoot);
  }

  async function setDiff(payload) {
    hideError();
    viewerGrid.classList.remove('left-empty', 'right-empty');
    statusText.textContent = 'Rendering diff…';
    renderDiffList(payload.components || []);
    setEmpty(leftContainer, 'Rendering HEAD…');
    setEmpty(rightContainer, 'Rendering Working Tree…');

    try {
      const fileType =
        payload.fileType ||
        (String(payload.fileName || '').endsWith('.kicad_pcb')
          ? 'board'
          : 'schematic');
      const beforeIsEmpty =
        !payload.beforeBase64 ||
        !decodeBase64Utf8(payload.beforeBase64).trimStart();
      const afterIsEmpty =
        !payload.afterBase64 ||
        !decodeBase64Utf8(payload.afterBase64).trimStart();
      viewerGrid.classList.toggle('left-empty', beforeIsEmpty && !afterIsEmpty);
      viewerGrid.classList.toggle(
        'right-empty',
        afterIsEmpty && !beforeIsEmpty
      );
      leftViewer = await renderKiCanvas(
        leftContainer,
        payload.beforeBase64,
        `HEAD:${payload.fileName || 'diff.kicad'}`,
        fileType,
        'HEAD'
      );
      rightViewer = await renderKiCanvas(
        rightContainer,
        payload.afterBase64,
        `Working Tree:${payload.fileName || 'diff.kicad'}`,
        fileType,
        'Working Tree'
      );
      await Promise.all([
        waitForViewer(leftViewer, 'HEAD'),
        waitForViewer(rightViewer, 'Working Tree')
      ]);
      renderComponentOverlays(
        leftContainer,
        payload.components || [],
        'before'
      );
      renderComponentOverlays(
        rightContainer,
        payload.components || [],
        'after'
      );
      statusText.textContent = payload.summary || 'Diff rendered.';
    } catch (error) {
      showError(
        'Could not render KiCad diff.',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'loading') {
      hideError();
      statusText.textContent = 'Loading diff…';
      diffList.innerHTML = '';
      setEmpty(leftContainer, 'Waiting for HEAD version…');
      setEmpty(rightContainer, 'Waiting for working tree version…');
    }
    if (message.type === 'setDiff') {
      void setDiff(message.payload || {});
    }
    if (message.type === 'error') {
      showError('Could not load diff.', message.payload?.message || '');
    }
  });

  window.addEventListener('error', (event) => {
    showError('Diff viewer script error.', event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason || 'Unknown error');

    // Guard: KiCanvas lib_symbols.by_name() fails when symbols are absent
    if (reason.includes('by_name') || reason.includes('lib_symbols')) {
      showError(
        'Diff viewer could not resolve library symbols.',
        'One or both revisions may have missing or incompatible lib_symbols data. ' +
          'This can happen when comparing versions with different KiCad formats or ' +
          'when the schematic has unresolved library references.\n\nOriginal: ' +
          reason
      );
      event.preventDefault();
      return;
    }

    showError('Diff viewer runtime error.', reason);
  });
})();
