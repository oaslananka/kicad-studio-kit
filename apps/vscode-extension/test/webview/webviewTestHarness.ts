import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { Page } from '@playwright/test';

type ViewerHtmlFactory =
  typeof import('../../src/providers/viewerHtml').createKiCanvasViewerHtml;
type ViewerHtmlOptions = Parameters<ViewerHtmlFactory>[0];
type ModuleLoader = typeof import('node:module') & {
  _load: (
    request: string,
    parent: NodeJS.Module | undefined,
    isMain: boolean
  ) => unknown;
};

const testRequire = createRequire(__filename);
const fallbackSvgByPage = new WeakMap<Page, string | undefined>();
let viewerHtmlFactory: ViewerHtmlFactory | undefined;

export async function setViewerContent(
  page: Page,
  options: Partial<ViewerHtmlOptions>,
  mockOptions: { surface: 'canvas' | 'none' } = { surface: 'canvas' }
): Promise<void> {
  await page.goto('about:blank');
  await setWebviewContent(page, createViewerHtml(options, mockOptions));
}

export async function setWebviewContent(
  page: Page,
  html: string
): Promise<void> {
  await page.setContent(
    withVsCodeApiPrelude(html, fallbackSvgByPage.get(page)),
    { waitUntil: 'load' }
  );
}

export async function installVsCodeApiMock(
  page: Page,
  fallbackSvg?: string
): Promise<void> {
  fallbackSvgByPage.set(page, fallbackSvg);
}

export function createViewerHtml(
  options: Partial<ViewerHtmlOptions>,
  mockOptions: { surface: 'canvas' | 'none' }
): string {
  return loadViewerHtmlFactory()({
    title: 'Viewer',
    fileName: 'sample.kicad_sch',
    fileType: 'schematic',
    status: 'Opening interactive renderer...',
    cspSource: 'data:',
    kicanvasUri: dataUri(
      'text/javascript',
      createKiCanvasMockScript(mockOptions)
    ),
    viewerCssUri: dataUri('text/css', readAsset('media/kicanvas/viewer.css')),
    base64: '',
    disabledReason: '',
    ...options
  });
}

export async function viewerBounds(page: Page): Promise<{
  mount: { width: number; height: number };
  embed: { width: number; height: number };
}> {
  return page.evaluate(() => {
    const mount = document.getElementById('viewer-mount');
    const embed = document.querySelector('kicanvas-embed');
    if (!mount || !embed) {
      throw new Error('Viewer mount or embed was not rendered.');
    }
    const mountRect = mount.getBoundingClientRect();
    const embedRect = embed.getBoundingClientRect();
    return {
      mount: { width: mountRect.width, height: mountRect.height },
      embed: { width: embedRect.width, height: embedRect.height }
    };
  });
}

export async function readLastMessageType(
  page: Page
): Promise<string | undefined> {
  const messages = await readMessages(page);
  return messages.at(-1)?.type;
}

export async function hasMessageType(
  page: Page,
  type: string
): Promise<boolean> {
  return (await countMessages(page, type)) > 0;
}

export async function countMessages(page: Page, type: string): Promise<number> {
  const messages = await readMessages(page);
  return messages.filter((message) => message.type === type).length;
}

export async function readMessages(
  page: Page
): Promise<Array<{ type?: string }>> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __vscodeMessages?: Array<{ type?: string }>;
        }
      ).__vscodeMessages ?? []
  );
}

export function createBomHtml(): string {
  return readAsset('media/viewer/bom.html')
    .replaceAll('{{scriptNonce}}', 'test-nonce')
    .replaceAll('{{cspSource}}', 'data:')
    .replaceAll(
      '{{bomCssUri}}',
      dataUri('text/css', readAsset('media/styles/bom.css'))
    )
    .replaceAll(
      '{{scriptUri}}',
      dataUri('text/javascript', readAsset('media/viewer/bom.js'))
    );
}

export function createNetlistHtml(): string {
  return readAsset('media/viewer/netlist.html')
    .replaceAll('{{scriptNonce}}', 'test-nonce')
    .replaceAll('{{cspSource}}', 'data:')
    .replaceAll(
      '{{bomCssUri}}',
      dataUri('text/css', readAsset('media/styles/bom.css'))
    )
    .replaceAll(
      '{{scriptUri}}',
      dataUri('text/javascript', readAsset('media/viewer/netlist.js'))
    );
}

export function readFixtureBase64(relativePath: string): string {
  return Buffer.from(
    readAsset(path.join('test/fixtures', relativePath))
  ).toString('base64');
}

export function readAsset(relativePath: string): string {
  return fs.readFileSync(path.join(extensionRoot(), relativePath), 'utf8');
}

export function dataUri(mime: string, content: string): string {
  return `data:${mime};base64,${Buffer.from(content).toString('base64')}`;
}

export function extensionRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

function loadViewerHtmlFactory(): ViewerHtmlFactory {
  if (viewerHtmlFactory) {
    return viewerHtmlFactory;
  }

  const moduleLoader = testRequire('node:module') as ModuleLoader;
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function patchedLoad(
    request: string,
    parent: NodeJS.Module | undefined,
    isMain: boolean
  ) {
    if (request === 'vscode') {
      return {
        env: { language: 'en' },
        l10n: { t: (message: string) => message },
        Uri: {
          joinPath: (...segments: unknown[]) => ({
            toString: () => segments.map((segment) => String(segment)).join('/')
          })
        }
      };
    }
    return Reflect.apply(originalLoad, moduleLoader, [request, parent, isMain]);
  };
  try {
    viewerHtmlFactory = (
      testRequire('../../src/providers/viewerHtml') as {
        createKiCanvasViewerHtml: ViewerHtmlFactory;
      }
    ).createKiCanvasViewerHtml;
    return viewerHtmlFactory;
  } finally {
    moduleLoader._load = originalLoad;
  }
}

function withVsCodeApiPrelude(html: string, fallbackSvg?: string): string {
  const encodedFallback = Buffer.from(fallbackSvg ?? '').toString('base64');
  const prelude = /* html */ `<script>
    (() => {
      const svgFallbackText = atob(${JSON.stringify(encodedFallback)});
      const messages = [];
      Object.assign(window, {
        __vscodeMessages: messages,
        acquireVsCodeApi: () => ({
          getState: () => undefined,
          setState: (state) => {
            Object.assign(window, { __vscodeState: state });
          },
          postMessage: (message) => {
            messages.push(message);
            if (
              message?.type === 'requestSvgFallback' &&
              svgFallbackText &&
              message?.payload?.requestId
            ) {
              window.setTimeout(() => {
                window.postMessage(
                  {
                    type: 'svgFallback',
                    payload: {
                      requestId: message.payload.requestId,
                      svg: svgFallbackText
                    }
                  },
                  '*'
                );
              }, 0);
            }
          }
        }),
        kicadStudioL10n: {
          t: (message) => message
        }
      });
    })();
  </script>`;
  return html.replace('<head>', `<head>${prelude}`);
}

function createKiCanvasMockScript(options: {
  surface: 'canvas' | 'none';
}): string {
  return `
    (() => {
      window.__kicadMock = {
        fit: 0,
        zoomIn: 0,
        zoomOut: 0,
        selectedReference: ''
      };

      class KiCanvasSourceMock extends HTMLElement {}

      class KiCanvasEmbedMock extends HTMLElement {
        constructor() {
          super();
          this.viewer = {
            select: (reference) => {
              window.__kicadMock.selectedReference = reference;
            },
            layers: {
              in_order: () => []
            },
            draw: () => undefined
          };
        }

        connectedCallback() {
          this.loaded = true;
          this.setAttribute('loaded', '');
          if (${JSON.stringify(options.surface)} === 'none') {
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = 1200;
          canvas.height = 800;
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          const context = canvas.getContext('2d');
          context.fillStyle = '#0f172a';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#22c55e';
          context.fillRect(48, 48, 420, 280);
          context.fillStyle = '#f59e0b';
          context.fillRect(560, 120, 280, 420);
          context.strokeStyle = '#38bdf8';
          context.lineWidth = 12;
          context.beginPath();
          context.moveTo(80, 700);
          context.lineTo(1120, 120);
          context.stroke();
          this.appendChild(canvas);
        }

        fitToScreen() {
          window.__kicadMock.fit += 1;
          this.setAttribute('fit-count', String(window.__kicadMock.fit));
        }

        zoomIn() {
          window.__kicadMock.zoomIn += 1;
          this.setAttribute('zoom-in-count', String(window.__kicadMock.zoomIn));
        }

        zoomOut() {
          window.__kicadMock.zoomOut += 1;
          this.setAttribute(
            'zoom-out-count',
            String(window.__kicadMock.zoomOut)
          );
        }
      }

      customElements.define('kicanvas-source', KiCanvasSourceMock);
      customElements.define('kicanvas-embed', KiCanvasEmbedMock);
    })();
  `;
}
