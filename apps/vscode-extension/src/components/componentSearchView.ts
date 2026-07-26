import type { ComponentSearchResult } from '../types';
import { injectWebviewLocalization } from '../webviewI18n';

type ProviderStatus = 'ready' | 'warning' | 'disabled';

export interface ComponentSearchProviderChip {
  id: 'local' | 'lcsc' | 'octopart' | 'ai';
  label: string;
  status: ProviderStatus;
  detail: string;
}

export interface ComponentSearchRecommendation {
  label: string;
  query: string;
  detail?: string | undefined;
}

export interface ComponentSearchViewResult {
  result: ComponentSearchResult;
  availability: string;
  footprintMatch: string;
  datasheet: string;
  confidence: string;
}

export interface ComponentSearchViewState {
  nonce: string;
  cspSource: string;
  query: string;
  loading: boolean;
  providers: ComponentSearchProviderChip[];
  warnings: string[];
  recentSearches: string[];
  recommendations: ComponentSearchRecommendation[];
  results: ComponentSearchViewResult[];
  projectName?: string | undefined;
  error?: string | undefined;
}

export interface ComponentSearchProjectContext {
  activeFile?: string | undefined;
  selectedReference?: string | undefined;
  projectName?: string | undefined;
}

export function buildComponentSearchViewHtml(
  state: ComponentSearchViewState
): string {
  const query = state.query ?? '';
  const providerChips = state.providers
    .map(
      (provider) => `<span class="provider provider-${escapeHtml(
        provider.status
      )}" data-provider-id="${escapeHtml(provider.id)}">
        <span class="provider-label">${escapeHtml(provider.label)}</span>
        <span class="provider-detail">${escapeHtml(provider.detail)}</span>
      </span>`
    )
    .join('');
  const warnings = state.warnings.length
    ? `<section class="warnings" role="status" aria-label="Provider warnings">
        <p>Missing API keys are non-blocking provider warnings.</p>
        <ul>
          ${state.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}
        </ul>
        <div class="warning-actions">
          <button type="button" data-command="setup-octopart">Set Octopart/Nexar API Key</button>
          <button type="button" data-command="setup-ai">Set AI API Key</button>
        </div>
      </section>`
    : '';
  const projectContext = state.projectName
    ? `<p class="section-context">${escapeHtml(state.projectName)}</p>`
    : '';
  const recommendations = state.recommendations.length
    ? `<section class="suggestions" aria-label="Recommended parts">
        <h2>Recommended parts</h2>
        ${projectContext}
        <div class="suggestion-list">
          ${state.recommendations
            .map((recommendation) =>
              searchPill(
                recommendation.label,
                recommendation.query,
                recommendation.detail
              )
            )
            .join('')}
        </div>
      </section>`
    : '';
  const recentSearches = state.recentSearches.length
    ? `<section class="suggestions" aria-label="Recent searches">
        <h2>Recent searches</h2>
        <div class="suggestion-list">
          ${state.recentSearches
            .map((query) => searchPill(query, query))
            .join('')}
        </div>
      </section>`
    : '';
  let resultList = '';
  if (state.results.length) {
    resultList = `<section class="results" aria-live="polite">
        <h2>Results</h2>
        <ol>
          ${state.results.map((result, index) => resultRow(result, index)).join('')}
        </ol>
      </section>`;
  } else if (query.length > 0 && !state.loading && !state.error) {
    resultList = `<section class="empty" aria-live="polite">No matching components yet.</section>`;
  }
  const loading = state.loading
    ? '<section class="loading" aria-live="polite">Searching providers...</section>'
    : '';
  const error = state.error
    ? `<section class="error" role="alert">${escapeHtml(state.error)}</section>`
    : '';

  return injectWebviewLocalization(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${state.nonce}'; script-src 'nonce-${state.nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component Search</title>
  <style nonce="${state.nonce}">
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      font: var(--vscode-font-size) var(--vscode-font-family);
    }
    .search-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      align-items: center;
    }
    label.sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    input {
      width: 100%;
      min-width: 0;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 3px;
      padding: 7px 8px;
      font: inherit;
    }
    input:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 2px;
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 0;
      border-radius: 3px;
      padding: 7px 9px;
      font: inherit;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
    .providers,
    .suggestion-list,
    .warning-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .providers { margin: 10px 0; }
    .provider,
    .pill {
      display: inline-flex;
      min-width: 0;
      max-width: 100%;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--vscode-contrastBorder, var(--vscode-panel-border));
      border-radius: 999px;
      padding: 4px 7px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      line-height: 1.25;
    }
    .provider-warning { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground)); }
    .provider-disabled { opacity: 0.72; background: var(--vscode-editorWidget-background); color: var(--vscode-descriptionForeground); }
    .provider-label,
    .provider-detail,
    .pill-label {
      overflow-wrap: anywhere;
    }
    .provider-detail {
      color: inherit;
      opacity: 0.78;
    }
    section { margin-top: 12px; }
    h2 {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
    }
    .section-context {
      margin: -2px 0 8px;
      color: var(--vscode-descriptionForeground);
      overflow-wrap: anywhere;
    }
    .warnings,
    .error,
    .empty,
    .loading {
      border-left: 3px solid var(--vscode-inputValidation-warningBorder, var(--vscode-focusBorder));
      padding: 8px;
      background: var(--vscode-editorWidget-background);
    }
    .warnings p,
    .warnings ul {
      margin: 0 0 8px;
      padding-left: 16px;
    }
    .warnings p { padding-left: 0; }
    .results ol {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .result {
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 8px;
    }
    .result-title {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: flex-start;
    }
    .result-title strong,
    .result-description {
      overflow-wrap: anywhere;
    }
    .source {
      flex: 0 0 auto;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .result-description {
      margin: 4px 0 6px;
      color: var(--vscode-descriptionForeground);
    }
    dl {
      display: grid;
      grid-template-columns: minmax(7.5em, auto) minmax(0, 1fr);
      gap: 4px 8px;
      margin: 0 0 8px;
    }
    dt { color: var(--vscode-descriptionForeground); }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .result-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .pill {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border-color: var(--vscode-textLink-foreground);
      padding: 3px 7px;
    }
  </style>
</head>
<body>
  <form id="component-search-form" class="search-form">
    <label class="sr-only" for="component-search-input">Search components</label>
    <input id="component-search-input" type="search" value="${escapeHtml(query)}" placeholder="Part number, value, or footprint" autocomplete="off">
    <button type="submit">Search</button>
  </form>
  <div class="providers" aria-label="Provider status">${providerChips}</div>
  ${warnings}
  ${recommendations}
  ${recentSearches}
  ${loading}
  ${error}
  ${resultList}
  <script nonce="${state.nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('component-search-input');
    document.getElementById('component-search-form').addEventListener('submit', (event) => {
      event.preventDefault();
      vscode.postMessage({ type: 'search', query: input.value });
    });
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-command]');
      if (!target) {
        return;
      }
      const command = target.getAttribute('data-command');
      const index = Number(target.getAttribute('data-index'));
      const query = target.getAttribute('data-query') || input.value;
      if (command === 'use-query') {
        input.value = query;
        vscode.postMessage({ type: 'use-query', query });
        return;
      }
      vscode.postMessage({
        type: command,
        query,
        index: Number.isFinite(index) ? index : undefined
      });
    });
  </script>
</body>
</html>`,
    state.nonce
  );
}

export function buildComponentDetailsHtml(
  result: ComponentSearchResult,
  options: { nonce: string; cspSource: string }
): string {
  return injectWebviewLocalization(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource} data:; style-src 'nonce-${options.nonce}'; script-src 'nonce-${options.nonce}';">
  <title>KiCad Component Details</title>
  <style nonce="${options.nonce}">
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      padding: 16px;
    }
    button {
      margin-right: 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
    button:focus-visible {
      outline: 2px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 2px;
    }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(result.mpn || result.lcscPartNumber || 'Part')}</h1>
  <p>${escapeHtml(result.description)}</p>
  <p><strong>Manufacturer:</strong> ${escapeHtml(result.manufacturer || 'Unknown')}</p>
  <p><strong>Source:</strong> ${escapeHtml(result.source)}</p>
  <button id="datasheet">Open Datasheet</button>
  <button id="copy">Copy MPN</button>
  ${result.pcmPackageId ? '<button id="pcm-install">Install PCM Library</button>' : ''}
  <h2>Offers</h2>
  <pre>${escapeHtml(JSON.stringify(result.offers, null, 2))}</pre>
  <script nonce="${options.nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('datasheet').addEventListener('click', () => vscode.postMessage({ type: 'datasheet', url: ${JSON.stringify(result.datasheetUrl ?? '')} }));
    document.getElementById('copy').addEventListener('click', () => vscode.postMessage({ type: 'copy-mpn', mpn: ${JSON.stringify(result.mpn)} }));
    document.getElementById('pcm-install')?.addEventListener('click', () => vscode.postMessage({ type: 'pcm-install' }));
  </script>
</body>
</html>`,
    options.nonce
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/"/g, '&quot;')
    .replaceAll("'", '&#39;');
}

function searchPill(
  label: string,
  query: string,
  detail?: string | undefined
): string {
  const title = detail ? ` title="${escapeHtml(detail)}"` : '';
  return `<button type="button" class="pill" data-command="use-query" data-query="${escapeHtml(query)}"${title}>
    <span class="pill-label">${escapeHtml(label)}</span>
  </button>`;
}

function resultRow(result: ComponentSearchViewResult, index: number): string {
  const label =
    result.result.mpn ||
    result.result.lcscPartNumber ||
    result.result.description;
  const datasheetButton = result.result.datasheetUrl
    ? `<button type="button" data-command="datasheet" data-index="${index}">Open Datasheet</button>`
    : '';
  const pcmButton = result.result.pcmPackageId
    ? `<button type="button" data-command="pcm-install" data-index="${index}">Install PCM Library</button>`
    : '';
  return `<li class="result">
    <div class="result-title">
      <strong>${escapeHtml(label)}</strong>
      <span class="source">${escapeHtml(result.result.source)}</span>
    </div>
    <p class="result-description">${escapeHtml(result.result.description)}</p>
    <dl>
      <dt>Manufacturer</dt>
      <dd>${escapeHtml(result.result.manufacturer || 'Unknown')}</dd>
      <dt>Availability</dt>
      <dd>${escapeHtml(result.availability)}</dd>
      <dt>Footprint match</dt>
      <dd>${escapeHtml(result.footprintMatch)}</dd>
      <dt>Datasheet</dt>
      <dd>${escapeHtml(result.datasheet)}</dd>
      <dt>Confidence</dt>
      <dd>${escapeHtml(result.confidence)}</dd>
    </dl>
    <div class="result-actions">
      <button type="button" data-command="open-result" data-index="${index}">Details</button>
      <button type="button" data-command="copy-mpn" data-index="${index}">Copy MPN</button>
      ${datasheetButton}
      ${pcmButton}
    </div>
  </li>`;
}
