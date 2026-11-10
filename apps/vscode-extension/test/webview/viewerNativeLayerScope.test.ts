import { expect, test } from '@playwright/test';
import {
  installVsCodeApiMock,
  readFixtureBase64,
  setViewerContent
} from './webviewTestHarness';

const boardBase64 = readFixtureBase64('sample.kicad_pcb');
const metadata = {
  layers: [
    { name: 'F.Cu', kind: 'signal', visible: true },
    { name: 'B.Cu', kind: 'signal', visible: true }
  ]
};
const partialPreview = {
  warning: 'PARTIAL: source zones omitted',
  viewport: { minX: 0, maxX: 20, minY: 0, maxY: 20 },
  included: { segment: 3 },
  remaining: { segment: 5 },
  omittedSourceZones: 128,
  omittedZonesByLayer: { 'F.Cu': 8 },
  omittedZoneOutlinesInViewportByLayer: { 'F.Cu': 6 },
  unclassifiedZoneOutlinesByLayer: {},
  hasNextPage: true
};

// This fast webview contract runs on CI without pretending a mocked plot
// proves the real KiCad CLI or engineering acceptance.
test('labels the displayed original-layer plot and restores the partial preview warning', async ({
  page
}) => {
  await installVsCodeApiMock(page);
  await setViewerContent(page, {
    fileType: 'board',
    fileName: 'sample.kicad_pcb',
    base64: boardBase64,
    metadata
  });
  const refresh = () =>
    page.evaluate(
      ({ base64, layers, preview }) =>
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'refresh',
              payload: {
                fileName: 'sample.kicad_pcb',
                base64,
                metadata: layers,
                partialPreview: preview
              }
            }
          })
        ),
      { base64: boardBase64, layers: metadata, preview: partialPreview }
    );

  await refresh();
  await expect(page.locator('#partial-preview-banner')).toContainText(
    'PARTIAL PREVIEW'
  );
  await page.locator('#side-panel-toggle').click();
  const original = page.getByRole('button', { name: 'Inspect original layer' });
  await expect(original).toBeVisible();
  await original.click();
  await page.waitForFunction(() =>
    (
      window as Window & {
        __vscodeMessages?: Array<{ type?: string }>;
      }
    ).__vscodeMessages?.some(
      (message) => message.type === 'requestNativeInnerLayer'
    )
  );
  await page.evaluate(() => {
    const messages =
      (
        window as Window & {
          __vscodeMessages?: Array<{
            type?: string;
            payload?: { requestId?: string };
          }>;
        }
      ).__vscodeMessages ?? [];
    const request = messages.findLast(
      (message) => message.type === 'requestNativeInnerLayer'
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'nativeInnerLayerSvg',
          payload: {
            requestId: request?.payload?.requestId,
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path d="M0 0 L100 100"/></svg>'
          }
        }
      })
    );
  });
  await expect(page.locator('#svg-fallback-view')).toBeVisible();
  await expect(page.locator('#partial-preview-banner')).toContainText(
    'FULL ORIGINAL F.Cu'
  );
  await expect(page.locator('#partial-preview-banner')).toContainText(
    'interactive preview remains partial'
  );
  await expect(page.locator('#partial-preview-banner')).toContainText(
    'not DRC or net-continuity validation'
  );
  await refresh();
  await expect(page.locator('#partial-preview-banner')).toContainText(
    'PARTIAL PREVIEW'
  );
  await expect(page.locator('#partial-preview-banner')).not.toContainText(
    'FULL ORIGINAL'
  );
});

// This validates the actual source-page coordinate handoff, not inferred copper connectivity.
test('focuses the authentic original copper plot on its selected source region', async ({
  page
}) => {
  await installVsCodeApiMock(page);
  await setViewerContent(page, {
    fileType: 'board',
    fileName: 'sample.kicad_pcb',
    base64: boardBase64,
    metadata
  });
  await page.evaluate(
    ({ base64, layers, preview }) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'refresh',
            payload: {
              fileName: 'sample.kicad_pcb',
              base64,
              metadata: layers,
              partialPreview: preview
            }
          }
        })
      );
    },
    {
      base64: boardBase64,
      layers: metadata,
      preview: {
        ...partialPreview,
        viewport: { minX: 120, maxX: 180, minY: 180, maxY: 240 }
      }
    }
  );
  await page.locator('#side-panel-toggle').click();
  await page.getByRole('button', { name: 'Inspect original layer' }).click();
  await page.waitForFunction(() =>
    (
      window as Window & { __vscodeMessages?: Array<{ type?: string }> }
    ).__vscodeMessages?.some((m) => m.type === 'requestNativeInnerLayer')
  );
  await page.evaluate(() => {
    const msgs =
      (
        window as Window & {
          __vscodeMessages?: Array<{
            type?: string;
            payload?: { requestId?: string };
          }>;
        }
      ).__vscodeMessages ?? [];
    const msg = msgs.findLast((m) => m.type === 'requestNativeInnerLayer');
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'nativeInnerLayerSvg',
          payload: {
            requestId: msg?.payload?.requestId,
            boardPageCoordinates: true,
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="420mm" viewBox="0 0 297 420"><desc>Image generated by PCBNEW</desc><path d="M120 180 L180 240"/></svg>'
          }
        }
      })
    );
  });
  await expect(page.locator('#svg-fallback-view')).toBeVisible();
  await expect
    .poll(async () =>
      page.locator('#svg-fallback-view').evaluate((el) => el.scrollTop)
    )
    .toBeGreaterThan(100);
  await expect(page.locator('#partial-preview-banner')).toContainText(
    'FULL ORIGINAL'
  );
  await expect(page.locator('#partial-preview-banner')).toContainText(
    'not DRC'
  );
  await expect(page.locator('#viewer-status')).toContainText(
    'focused on selected source area'
  );

  // With no host-attested page-coordinate marker, do NOT apply source mm
  // coordinates to a fitted/translated KiCad SVG even when it looks valid.
  await page.getByRole('button', { name: 'Reload viewer' }).click();
  await expect(page.locator('#partial-preview-banner')).toContainText(
    'PARTIAL PREVIEW'
  );
  const originalAgain = page.getByRole('button', {
    name: 'Inspect original layer'
  });
  await expect(originalAgain).toBeVisible();
  await originalAgain.click();
  await page.evaluate(() => {
    const messages =
      (
        window as Window & {
          __vscodeMessages?: Array<{
            type?: string;
            payload?: { requestId?: string };
          }>;
        }
      ).__vscodeMessages ?? [];
    const request = messages.findLast(
      (m) => m.type === 'requestNativeInnerLayer'
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'nativeInnerLayerSvg',
          payload: {
            requestId: request?.payload?.requestId,
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="420mm" viewBox="0 0 297 420"><desc>Image generated by PCBNEW</desc><path d="M120 180 L180 240"/></svg>'
          }
        }
      })
    );
  });
  await expect(page.locator('#svg-fallback-view')).toBeVisible();
  await expect(page.locator('#viewer-status')).not.toContainText(
    'focused on selected source area'
  );
  await expect(page.locator('#svg-fallback-view')).toHaveJSProperty(
    'scrollTop',
    0
  );
});
