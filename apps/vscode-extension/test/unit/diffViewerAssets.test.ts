import * as fs from 'node:fs';
import * as path from 'node:path';

describe('diff viewer assets', () => {
  const root = process.cwd();

  it('creates KiCanvas elements after the bundle has registered custom elements', () => {
    const html = fs.readFileSync(
      path.join(root, 'media', 'viewer', 'diff.html'),
      'utf8'
    );
    const script = fs.readFileSync(
      path.join(root, 'media', 'viewer', 'diff.js'),
      'utf8'
    );

    expect(html).not.toContain('<kicanvas-embed');
    expect(script).toContain("document.createElement('kicanvas-embed')");
    expect(script).toContain("document.createElement('kicanvas-source')");
    expect(script).not.toContain("setAttribute('src'");
  });

  it('allows KiCanvas blob/worker resources in the diff webview CSP', () => {
    const html = fs.readFileSync(
      path.join(root, 'media', 'viewer', 'diff.html'),
      'utf8'
    );

    expect(html).toContain(
      "script-src 'nonce-{{scriptNonce}}' {{cspSource}} blob:;"
    );
    expect(html).toContain('style-src {{cspSource}};');
    expect(html).toContain('worker-src {{cspSource}} blob:;');
    expect(html).toContain('connect-src {{cspSource}} blob: data:;');
    expect(html).toContain('img-src {{cspSource}} data: blob:;');
    expect(html).toContain(
      '<script nonce="{{scriptNonce}}" src="{{kicanvasUri}}"></script>'
    );
    expect(html).toContain(
      '<script nonce="{{scriptNonce}}" src="{{scriptUri}}"></script>'
    );
    expect(html).not.toContain('unsafe-inline');
    expect(html).not.toContain('unsafe-eval');
  });

  it('includes visual overlay hooks for changed schematic and PCB objects', () => {
    const script = fs.readFileSync(
      path.join(root, 'media', 'viewer', 'diff.js'),
      'utf8'
    );

    expect(script).toContain('function renderComponentOverlays');
    expect(script).toContain("overlay.className = 'diff-component-overlay'");
    expect(script).toContain('payload.components || []');
  });

  it('keeps viewer webview templates free of unsafe CSP directives', () => {
    // pcb.html and schematic.html are generated dynamically by viewerHtml.ts,
    // not static template files — only sidebar view templates are checked here.
    for (const fileName of ['bom.html', 'netlist.html']) {
      const html = fs.readFileSync(
        path.join(root, 'media', 'viewer', fileName),
        'utf8'
      );

      expect(html).not.toContain('unsafe-inline');
      expect(html).not.toContain('unsafe-eval');
      expect(html).toContain("script-src 'nonce-{{scriptNonce}}'");
      for (const scriptTag of findOpeningTags(html, 'script')) {
        expect(scriptTag).toContain('nonce="{{scriptNonce}}"');
      }
    }
  });

  it('renders BOM and netlist rows without innerHTML string templates', () => {
    const bomScript = fs.readFileSync(
      path.join(root, 'media', 'viewer', 'bom.js'),
      'utf8'
    );
    const netlistScript = fs.readFileSync(
      path.join(root, 'media', 'viewer', 'netlist.js'),
      'utf8'
    );

    expect(bomScript).toContain('rowsEl.replaceChildren');
    expect(netlistScript).toContain('rowsEl.replaceChildren');
    expect(bomScript).not.toContain('rowsEl.innerHTML');
    expect(netlistScript).not.toContain('rowsEl.innerHTML');
  });

  it('escapes raw chat messages before assigning them to innerHTML', () => {
    const markdownScript = fs.readFileSync(
      path.join(root, 'media', 'vendor', 'chat-markdown.js'),
      'utf8'
    );

    expect(markdownScript).toContain('function sanitizeHtml(value)');
    expect(markdownScript).toContain('return escapeHtml(value);');
    expect(markdownScript).not.toContain('replace(/<script');
  });
});

function findOpeningTags(html: string, tagName: string): string[] {
  const tags: string[] = [];
  const lowerHtml = html.toLowerCase();
  const lowerTag = `<${tagName.toLowerCase()}`;
  let searchFrom = 0;
  while (searchFrom < html.length) {
    const start = lowerHtml.indexOf(lowerTag, searchFrom);
    if (start === -1) {
      break;
    }
    const end = html.indexOf('>', start);
    if (end === -1) {
      break;
    }
    tags.push(html.slice(start, end + 1));
    searchFrom = end + 1;
  }
  return tags;
}
