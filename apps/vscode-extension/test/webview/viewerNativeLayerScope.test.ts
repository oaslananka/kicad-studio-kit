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
        window.postMessage(
          {
            type: 'refresh',
            payload: {
              fileName: 'sample.kicad_pcb',
              base64,
              metadata: layers,
              partialPreview: preview
            }
          },
          '*'
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
    window.postMessage(
      {
        type: 'nativeInnerLayerSvg',
        payload: {
          requestId: request?.payload?.requestId,
          svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path d="M0 0 L100 100"/></svg>'
        }
      },
      '*'
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
