import * as vscode from 'vscode';

export const WEBVIEW_MESSAGES = [
  'KiCad Studio Settings',
  'KiCad CLI',
  'Detect kicad-cli',
  'kicad-cli path',
  'Auto-detect',
  'KiCad application path',
  'AI',
  'Test connection',
  'Set API key',
  'Clear API key',
  'Provider',
  'Disabled',
  'Local OpenAI-compatible',
  'Codex (VS Code)',
  'Model',
  'Provider default',
  'Local endpoint',
  'OpenAI API mode',
  'Responses',
  'Chat Completions',
  'Response language',
  'English',
  'Turkish',
  'German',
  'Chinese (Simplified)',
  'Japanese',
  'French',
  'Spanish',
  'Korean',
  'Portuguese (Brazil)',
  'Allow language model tools',
  'MCP',
  'Open integration docs',
  'Endpoint',
  'Profile',
  'Timeout (seconds)',
  'Auto-detect kicad-mcp-pro',
  'Push active KiCad context',
  'Allow legacy SSE fallback',
  'Viewer',
  'Viewer theme',
  'Dark',
  'Light',
  'Large file threshold bytes',
  'Auto-refresh viewers on save',
  'Sync viewer with VS Code theme',
  'Enable PCB layer panel',
  'Enable viewer snapshot export',
  'Secrets',
  'Clear all stored secrets',
  'Octopart/Nexar key',
  'Component Search',
  'KiCad Component Details',
  'Inline part lookup',
  'Search components',
  'Search',
  'Part number, value, or footprint',
  'Provider status',
  'Provider warnings',
  'Missing API keys are non-blocking provider warnings.',
  'Set Octopart/Nexar API Key',
  'Set AI API Key',
  'Local KiCad libraries',
  'Octopart/Nexar',
  'AI matching',
  'Indexed',
  'Indexes on first local fallback',
  'Unavailable',
  'Enabled',
  'API key stored',
  'API key needed',
  'Octopart/Nexar API key is missing; LCSC and local library searches still work.',
  'AI API key is missing; AI matching stays disabled without blocking search.',
  'LCSC search is disabled in settings; local and configured providers still work.',
  'Recommended parts',
  'Recent searches',
  'Results',
  'No matching components yet.',
  'Searching providers...',
  'Availability',
  'Footprint match',
  'Datasheet',
  'Confidence',
  'Available',
  'Not provided',
  'Stock not reported',
  'No availability data',
  'Not reported',
  'High',
  'Medium',
  'Low',
  '{count} in stock',
  'Install PCM Library',
  'AI API key is stored in SecretStorage.',
  'No AI API key is stored.',
  'Octopart/Nexar key is stored in SecretStorage.',
  'No Octopart/Nexar key is stored.',
  'No kicad-cli detection result yet.',
  'AI key stored',
  'AI key missing',
  'CLI not detected',
  'KiCad Design Intent',
  'Design intent form',
  'Power tree references',
  'Comma-separated component references that form the power delivery network.',
  'Connector references',
  'External interface connectors on this board.',
  'Decoupling pairs',
  'Format: IC_ref:cap_ref,cap_ref — associates bypass caps with their ICs.',
  'Analog / digital partitioning',
  'Describe the ground plane split and analog/digital boundary rules.',
  'Sensor cluster references',
  'Components that must be placed close together as a functional cluster.',
  'RF keepouts',
  'Areas where copper pours and vias are restricted to avoid RF interference.',
  'Fabrication profile',
  'Generic',
  'Target fab house — affects layer naming and DRC rule defaults.',
  'Additional notes',
  'Save Design Intent',
  'MCP request failed.',
  'KiCad DRC Rule Editor',
  'Name',
  'Condition',
  'Constraint',
  'Save Rule',
  'Delete Rule',
  'Library:',
  'Description:',
  'No description',
  'Keywords:',
  'None',
  'Value:',
  'Unknown',
  'Footprint filters:',
  'Tags:',
  'Footprint preview',
  'SVG preview unavailable. Showing metadata-only fallback.',
  'Part',
  'Details',
  'Manufacturer:',
  'Source:',
  'Open Datasheet',
  'Copy MPN',
  'Offers',
  'Interactive BOM',
  'KiCad Studio Interactive BOM',
  'Filter BOM rows',
  'Filter by reference, value, footprint, or MPN',
  'Reference',
  'Qty',
  'Value',
  'Footprint',
  'MPN',
  'Manufacturer',
  'LCSC',
  'Description',
  'BOM Diff',
  'Variant BOM Diff',
  'No component-level BOM differences were found.',
  'Reload viewer',
  'Reload Viewer',
  'Open in KiCad',
  'Export PNG',
  'Export SVG',
  'KiCad 10 hop-over overlay',
  'Loading file...',
  'Loading KiCanvas renderer…',
  'Preparing PCB viewer…',
  'Preparing schematic viewer…',
  'Viewer error',
  'An unexpected error occurred.',
  'Error detail',
  'No drawable objects yet',
  'This PCB file does not contain any footprints, tracks, zones, or graphics that KiCanvas can render.',
  'This schematic file does not contain any symbols, wires, labels, or other drawable objects yet.',
  'Add components in KiCad, save the file, and the viewer will refresh automatically.',
  'File source preview (first 3000 chars)',
  'Viewer side panel',
  'Viewer tools',
  'Viewer Tools',
  'Fit',
  'Zoom out viewer',
  'Current zoom',
  'Zoom in viewer',
  'Sheet',
  'Sheet selector',
  'Board',
  'Root sheet',
  'Grid',
  'Find reference',
  'Find',
  'Export',
  'PNG',
  'SVG',
  'Panel',
  'Hide Panel',
  'Show viewer side panel',
  'Hide viewer side panel',
  'All',
  'Copper Only',
  'No lasso area selected.',
  'Layer Visibility',
  'Tuning Profiles',
  'Viewer Notes',
  'KiCad Studio could not open',
  'What happened:',
  'the viewer failed while preparing the custom editor.',
  'How to fix:',
  'reload the window and reopen the file. If the error persists, this message will help diagnose the issue quickly.',
  'Refresh',
  'Loading diff…',
  'KiCad AI Chat',
  'Ready',
  'Chat controls',
  'AI provider',
  'Model override',
  'Open KiCad Studio settings',
  'Open settings',
  'Export chat transcript',
  'Export chat',
  'Clear chat',
  'Clear',
  'Cancel',
  'Ask about DRC/ERC issues, component choices, manufacturing risk, or the active KiCad file.',
  'Attach context',
  'Hide context',
  'Extra context',
  'Additional context for the next turn',
  'Prompt',
  'Ask about your KiCad design...',
  'Send',
  'Copied message.',
  'Thinking…',
  'Tool calls handled',
  'Suggested MCP tool calls',
  'tool',
  'Apply',
  'Apply suggested MCP tool calls',
  'Ignore',
  'Mark suggested MCP tool calls as handled',
  'Copy',
  'Copy message',
  'Edit',
  'Edit this prompt',
  'Mark helpful',
  'Mark not helpful',
  'Reaction saved.',
  'You',
  'User',
  'Assistant',
  'Transcript copied.'
] as const;

export type WebviewMessage = (typeof WEBVIEW_MESSAGES)[number];

export function webviewLocale(): string {
  return (vscode.env.language || 'en').replace('_', '-');
}

export function buildWebviewMessageMap(
  translate: (message: string) => string = (message) => vscode.l10n.t(message)
): Record<WebviewMessage, string> {
  return Object.fromEntries(
    WEBVIEW_MESSAGES.map((message) => [message, translate(message)])
  ) as Record<WebviewMessage, string>;
}

export function buildPseudoLocaleMessageMap(): Record<WebviewMessage, string> {
  return buildWebviewMessageMap(pseudoLocalize);
}

export function localizeWebviewMessage(message: WebviewMessage): string {
  return vscode.l10n.t(message);
}

export function injectWebviewLocalization(html: string, nonce: string): string {
  const messagesJson = JSON.stringify(buildWebviewMessageMap()).replace(
    /</gu,
    '\\u003c'
  );
  const attrsJson = JSON.stringify([
    'aria-label',
    'placeholder',
    'title',
    'alt'
  ]);
  const script = `<script nonce="${escapeAttribute(nonce)}">
(() => {
  const messages = ${messagesJson};
  const localizableAttributes = ${attrsJson};
  const translate = (value) => {
    const trimmed = String(value || '').trim();
    return trimmed ? messages[trimmed] || trimmed : String(value || '');
  };
  const apply = () => {
    if (!document.body) {
      return;
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    for (const node of textNodes) {
      const raw = node.nodeValue || '';
      const trimmed = raw.trim();
      const translated = translate(trimmed);
      if (trimmed && translated !== trimmed) {
        node.nodeValue = raw.replace(trimmed, translated);
      }
    }
    for (const element of document.querySelectorAll('*')) {
      for (const attr of localizableAttributes) {
        if (element.hasAttribute(attr)) {
          const current = element.getAttribute(attr) || '';
          const translated = translate(current);
          if (translated !== current) {
            element.setAttribute(attr, translated);
          }
        }
      }
    }
  };
  globalThis.kicadStudioL10n = { messages, t: translate, apply };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();
</script>`;
  const localizedHtml = html.replace(
    /<html lang="en"/iu,
    `<html lang="${escapeAttribute(webviewLocale())}"`
  );
  return /<body\b[^>]*>/iu.test(localizedHtml)
    ? localizedHtml.replace(/(<body\b[^>]*>)/iu, `$1\n${script}`)
    : `${localizedHtml}${script}`;
}

export function pseudoLocalize(message: string): string {
  const expanded = message.replace(/[A-Za-z]/gu, (letter) => {
    const pseudo = PSEUDO_ALPHABET[letter];
    return pseudo ?? letter;
  });
  return `[!! ${expanded} !!]`;
}

const PSEUDO_ALPHABET: Record<string, string> = {
  A: 'Å',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'Ë',
  F: 'Ƒ',
  G: 'Ğ',
  H: 'Ħ',
  I: 'Ï',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ŀ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ö',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ŧ',
  U: 'Ü',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ÿ',
  Z: 'Ž',
  a: 'å',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'ë',
  f: 'ƒ',
  g: 'ğ',
  h: 'ħ',
  i: 'ï',
  j: 'ĵ',
  k: 'ķ',
  l: 'ŀ',
  m: 'ṁ',
  n: 'ñ',
  o: 'ö',
  p: 'þ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ŧ',
  u: 'ü',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ÿ',
  z: 'ž'
};

function escapeAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;');
}
