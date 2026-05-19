(function () {
  const rowsEl = document.getElementById('netlist-rows');
  const summaryText = document.getElementById('summary-text');
  const errorCard = document.getElementById('error-card');
  const errorMessage = document.getElementById('error-message');

  const ERROR_PREFIXES = ['Could not', 'kicad-cli is not'];

  function isErrorStatus(status) {
    return ERROR_PREFIXES.some((prefix) => status.startsWith(prefix));
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'setNetlist') {
      const nets = message.payload.nets || [];
      const status = message.payload.status || '';

      if (nets.length === 0 && status && isErrorStatus(status)) {
        summaryText.textContent = '';
        errorMessage.textContent = status;
        errorCard.classList.add('visible');
        rowsEl.replaceChildren();
        return;
      }

      errorCard.classList.remove('visible');
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
