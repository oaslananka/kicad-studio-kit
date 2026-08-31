(function () {
  const vscode = acquireVsCodeApi();
  const search = document.getElementById('search');
  const toggleDnp = document.getElementById('toggle-dnp');
  const rowsEl = document.getElementById('bom-rows');
  const summaryText = document.getElementById('summary-text');
  const loadingRow = document.getElementById('loading-row');
  const emptyState = document.getElementById('bom-empty');
  const emptyMessage = document.getElementById('bom-empty-message');
  const emptyAction = document.getElementById('bom-empty-action');
  const tableWrapper = document.getElementById('table-wrapper');
  const exportCsv = document.getElementById('btn-export-csv');
  const exportXlsx = document.getElementById('btn-export-xlsx');
  const headers = [...document.querySelectorAll('th[data-key]')];

  function setLoading(loading, message = 'Loading BOM...') {
    loadingRow.classList.toggle('visible', loading);
    loadingRow.setAttribute('aria-busy', loading ? 'true' : 'false');
    if (loading) {
      summaryText.textContent = message;
      emptyState.classList.remove('visible');
      tableWrapper.classList.add('hidden');
    }
    syncExportState(loading);
  }
  let entries = [];
  let sortKey = 'references';
  let sortDir = 1;
  let isLoading = false;

  function syncExportState(loading = isLoading) {
    const disabled = loading || entries.length === 0;
    syncExportButton(exportCsv, disabled, 'Export BOM as CSV');
    syncExportButton(exportXlsx, disabled, 'Export BOM as XLSX');
  }

  function syncExportButton(button, disabled, enabledTitle) {
    button.disabled = disabled;
    if (disabled) {
      button.title = 'Export is available after BOM rows are loaded.';
      button.setAttribute('aria-describedby', 'bom-export-disabled-reason');
    } else {
      button.title = enabledTitle;
      button.removeAttribute('aria-describedby');
    }
  }

  function showEmpty(message, action) {
    rowsEl.replaceChildren();
    emptyMessage.textContent = message;
    emptyAction.hidden = !action;
    emptyAction.dataset.action = action || '';
    emptyState.classList.add('visible');
    tableWrapper.classList.add('hidden');
    syncExportState(false);
  }

  function showTable() {
    emptyAction.hidden = true;
    emptyAction.dataset.action = '';
    emptyState.classList.remove('visible');
    tableWrapper.classList.remove('hidden');
    syncExportState(false);
  }

  function rowMatches(entry, query) {
    const text = [
      entry.references.join(' '),
      entry.value,
      entry.footprint,
      entry.mpn,
      entry.manufacturer,
      entry.description
    ]
      .join(' ')
      .toLowerCase();
    return text.includes(query);
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const hideDnp = toggleDnp.checked;
    const filtered = entries
      .filter((entry) => !hideDnp || !entry.dnp)
      .filter((entry) => rowMatches(entry, query))
      .sort((left, right) => {
        const a =
          sortKey === 'references' ? left.references.join(',') : left[sortKey];
        const b =
          sortKey === 'references'
            ? right.references.join(',')
            : right[sortKey];
        return (
          String(a).localeCompare(String(b), undefined, { numeric: true }) *
          sortDir
        );
      });

    const fragment = document.createDocumentFragment();
    for (const entry of filtered) {
      fragment.appendChild(createRow(entry));
    }
    rowsEl.replaceChildren(fragment);

    for (const row of rowsEl.querySelectorAll('tr')) {
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      row.setAttribute(
        'aria-label',
        `Select component ${row.dataset.reference || ''}`
      );

      const selectRow = () => {
        vscode.postMessage({
          type: 'rowSelected',
          payload: { reference: row.dataset.reference }
        });
      };

      row.addEventListener('click', selectRow);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectRow();
        }
      });
    }
  }

  function createRow(entry) {
    const row = document.createElement('tr');
    row.dataset.reference = entry.references[0] || '';
    appendTextCell(row, entry.references.join(', '));
    appendTextCell(row, entry.quantity);
    appendTextCell(row, entry.value);
    appendTextCell(row, entry.footprint);
    appendTextCell(row, entry.mpn, true);
    appendTextCell(row, entry.manufacturer, true);
    appendLcscCell(row, entry.lcsc);
    appendTextCell(row, entry.description, true);
    return row;
  }

  function appendTextCell(row, value, mutedWhenEmpty) {
    const cell = document.createElement('td');
    const text = String(value ?? '');
    if (mutedWhenEmpty && !text) {
      const muted = document.createElement('span');
      muted.className = 'muted';
      muted.textContent = '—';
      cell.appendChild(muted);
    } else {
      cell.textContent = text;
    }
    row.appendChild(cell);
  }

  function appendLcscCell(row, value) {
    const cell = document.createElement('td');
    if (value) {
      const link = document.createElement('a');
      link.className = 'chip-link';
      link.href = `https://www.lcsc.com/search?q=${encodeURIComponent(value)}`;
      link.textContent = value;
      cell.appendChild(link);
    } else {
      const muted = document.createElement('span');
      muted.className = 'muted';
      muted.textContent = '—';
      cell.appendChild(muted);
    }
    row.appendChild(cell);
  }

  headers.forEach((header) => {
    header.addEventListener('click', () => {
      const nextKey = header.dataset.key;
      if (sortKey === nextKey) {
        sortDir *= -1;
      } else {
        sortKey = nextKey;
        sortDir = 1;
      }
      render();
    });
  });

  search.addEventListener('input', render);
  toggleDnp.addEventListener('change', render);
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (exportCsv.disabled) return;
    vscode.postMessage({ type: 'exportCsv' });
  });
  document.getElementById('btn-export-xlsx').addEventListener('click', () => {
    if (exportXlsx.disabled) return;
    vscode.postMessage({ type: 'exportXlsx' });
  });
  emptyAction.addEventListener('click', () => {
    if (emptyAction.dataset.action === 'openReviewTasks') {
      vscode.postMessage({ type: 'openReviewTasks' });
    }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'setStatus') {
      const payload = message.payload || {};
      if (payload.status === 'loading') {
        isLoading = true;
        setLoading(true);
      } else {
        isLoading = false;
        setLoading(false);
        const text = payload.text || 'No schematic opened.';
        summaryText.textContent = text;
        showEmpty(text, payload.action);
      }
    }
    if (message.type === 'setData') {
      isLoading = false;
      setLoading(false);
      entries = message.payload.entries || [];
      const summary = message.payload.summary || {
        totalComponents: 0,
        uniqueValues: 0
      };
      if (entries.length === 0) {
        summaryText.textContent = 'No components found.';
        showEmpty('No components found in the active schematic.');
      } else {
        summaryText.textContent = `${summary.totalComponents} components · ${summary.uniqueValues} unique rows`;
        showTable();
      }
      render();
    }
    if (message.type === 'highlight') {
      const target = rowsEl.querySelector(
        `[data-reference="${message.payload.reference}"]`
      );
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
})();
