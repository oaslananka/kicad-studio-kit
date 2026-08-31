(function () {
  const vscode = acquireVsCodeApi();
  const rowsEl = document.getElementById('netlist-rows');
  const summaryText = document.getElementById('summary-text');
  const errorCard = document.getElementById('error-card');
  const errorMessage = document.getElementById('error-message');
  const emptyState = document.getElementById('netlist-empty');
  const emptyMessage = document.getElementById('netlist-empty-message');
  const emptyAction = document.getElementById('netlist-empty-action');
  const tableWrapper = document.getElementById('table-wrapper');

  const ERROR_PREFIXES = ['Could not', 'kicad-cli is not'];

  function isErrorStatus(status) {
    return ERROR_PREFIXES.some((prefix) => status.startsWith(prefix));
  }

  emptyAction.addEventListener('click', () => {
    if (emptyAction.dataset.action === 'openReviewTasks') {
      vscode.postMessage({ type: 'openReviewTasks' });
    }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'setNetlist') {
      const nets = message.payload.nets || [];
      const status = message.payload.status || '';
      const action = message.payload.action || '';

      if (nets.length === 0 && status && isErrorStatus(status)) {
        summaryText.textContent = '';
        errorMessage.textContent = status;
        errorCard.classList.add('visible');
        emptyState.hidden = true;
        tableWrapper.classList.add('hidden');
        rowsEl.replaceChildren();
        return;
      }

      errorCard.classList.remove('visible');
      if (nets.length === 0) {
        summaryText.textContent = 'Netlist unavailable';
        emptyMessage.textContent =
          status || 'Open a schematic before inspecting the netlist.';
        emptyAction.hidden = action !== 'openReviewTasks';
        emptyAction.dataset.action = action;
        emptyState.hidden = false;
        tableWrapper.classList.add('hidden');
        rowsEl.replaceChildren();
        return;
      }

      emptyState.hidden = true;
      emptyAction.hidden = true;
      emptyAction.dataset.action = '';
      tableWrapper.classList.remove('hidden');
      summaryText.textContent = status || `${nets.length} net entries`;

      const fragment = document.createDocumentFragment();
      for (const net of nets) {
        const row = document.createElement('tr');
        const netName = document.createElement('td');
        const nodes = document.createElement('td');
        netName.textContent = net.netName || '';
        nodes.textContent =
          (net.nodes || [])
            .map((node) => `${node.reference}:${node.pin}`)
            .join(', ') || '—';
        row.append(netName, nodes);
        fragment.appendChild(row);
      }
      rowsEl.replaceChildren(fragment);
    }
  });
})();
