import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  createViewerHtml,
  dataUri,
  installVsCodeApiMock,
  readAsset,
  readMessages,
  withVsCodeApiPrelude
} from './webviewTestHarness';

async function startSchematic(
  page: Page,
  sheets: Array<{ id: string; name: string; file: string }> = []
) {
  await installVsCodeApiMock(page);
  const fixture = path.resolve(
    __dirname,
    '../../../../examples/led-basic/KICAD_TEST.kicad_sch'
  );
  const html = createViewerHtml(
    {
      fileName: 'KICAD_TEST.kicad_sch',
      fileType: 'schematic',
      base64: fs.readFileSync(fixture).toString('base64'),
      metadata: { references: ['J1', 'R1', 'D1'], sheets },
      kicanvasUri: dataUri(
        'text/javascript',
        readAsset('media/kicanvas/kicanvas.js')
      )
    },
    { surface: 'canvas' }
  );
  await page.route('https://studio-test.example/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: withVsCodeApiPrelude(html)
    })
  );
  await page.goto('https://studio-test.example/schematic');
  await expect(page.locator('#viewer-status')).toHaveText(
    'Interactive renderer loaded: KICAD_TEST.kicad_sch',
    { timeout: 30000 }
  );
}

async function rendererState(page: Page) {
  return page.evaluate(() => {
    const embed = document.querySelector('kicanvas-embed') as any;
    const app = embed?.shadowRoot?.querySelector('kc-schematic-app') as any;
    const host = app?.shadowRoot?.querySelector('kc-schematic-viewer') as any;
    const renderer = app?.viewer;
    return {
      cameraZoom: renderer?.viewport?.camera?.zoom as number,
      cameraCenter: {
        x: renderer?.viewport?.camera?.center?.x as number,
        y: renderer?.viewport?.camera?.center?.y as number
      },
      theme: host?.theme as string,
      background: renderer?.theme?.background?.to_css?.() as string,
      zoomText: document.getElementById('zoom-level')?.textContent,
      overlayOpacity: Number(
        getComputedStyle(document.getElementById('viewer-mount')!, '::before')
          .opacity
      ),
      spacing: Number.parseFloat(
        document
          .getElementById('viewer-mount')
          ?.style.getPropertyValue('--schematic-grid-step') || '0'
      ),
      gridVisible: document.body.classList.contains('grid-visible')
    };
  });
}

test('native KiCanvas schematic Fit/zoom/grid/theme change rendered camera and pixels', async ({
  page
}) => {
  await startSchematic(page);
  const initial = await rendererState(page);
  expect(initial.cameraZoom).toBeGreaterThan(0);
  expect(initial.background).toBe('rgba(245, 244, 239, 1)');
  await expect(page.locator('#theme-toggle')).toHaveText('Light');

  await page.locator('#zoom-in-btn').click();
  const enlarged = await rendererState(page);
  expect(enlarged.cameraZoom).toBeGreaterThan(initial.cameraZoom * 1.15);
  expect(enlarged.zoomText).toBe('120%');

  await page.locator('#zoom-out-btn').click();
  const reduced = await rendererState(page);
  expect(reduced.cameraZoom).toBeCloseTo(initial.cameraZoom, 4);
  expect(reduced.zoomText).toBe('100%');

  await page.locator('#zoom-in-btn').click();
  await page.locator('#fit-btn').click();
  const fitted = await rendererState(page);
  expect(fitted.cameraZoom).toBeCloseTo(initial.cameraZoom, 4);
  expect(fitted.zoomText).toBe('100%');
  await expect(page.locator('#viewer-status')).not.toContainText('unavailable');

  await page.locator('#grid-toggle').click();
  await expect(page.locator('#grid-toggle')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect
    .poll(async () => (await rendererState(page)).overlayOpacity)
    .toBeGreaterThan(0.45);
  const gridded = await rendererState(page);
  expect(gridded.gridVisible).toBe(true);
  expect(gridded.spacing).toBeGreaterThan(9);
  expect(gridded.spacing).toBeLessThan(200);
  await page.locator('#zoom-in-btn').click();
  expect((await rendererState(page)).spacing).toBeGreaterThan(gridded.spacing);
  await page.locator('#grid-toggle').click();
  expect((await rendererState(page)).gridVisible).toBe(false);

  const beforeTheme = createHash('sha256')
    .update(await page.locator('#viewer-mount').screenshot())
    .digest('hex');
  await page.locator('#theme-toggle').click();
  await expect(page.locator('#theme-toggle')).toHaveText('Dark');
  const dark = await rendererState(page);
  expect(dark.theme).toBe('light');
  expect(dark.background).toBe('rgba(19, 18, 24, 1)');
  const afterTheme = createHash('sha256')
    .update(await page.locator('#viewer-mount').screenshot())
    .digest('hex');
  expect(afterTheme).not.toBe(beforeTheme);
  await page.locator('#theme-toggle').click();
  expect((await rendererState(page)).background).toBe(initial.background);

  await page.locator('#reference-search').fill('R1');
  await page.locator('#reference-search-btn').click();
  await expect(page.locator('#viewer-status')).toContainText(
    'Focused schematic reference: R1'
  );
  const selected = await rendererState(page);
  expect(selected.cameraZoom).toBeGreaterThan(0);

  await page.locator('#side-panel-toggle').click();
  await expect(page.locator('body')).not.toHaveClass(/tools-collapsed/);
  await page.locator('#side-panel-toggle').click();
  await expect(page.locator('body')).toHaveClass(/tools-collapsed/);
  await page.locator('#viewer-toolbar-toggle').click();
  await expect(page.locator('#viewer-toolbar')).toBeHidden();
  await page.locator('#viewer-toolbar-toggle').click();
  await expect(page.locator('#viewer-toolbar')).toBeVisible();

  await page.locator('#export-menu-toggle').click();
  await page.locator('#export-png-btn').click();
  await expect
    .poll(async () =>
      (await readMessages(page)).some((m) => m.type === 'exportPng')
    )
    .toBe(true);
  const messages: any[] = await readMessages(page);
  expect(
    messages.find((m) => m.type === 'exportPng')?.payload?.dataUrl
  ).toMatch(/^data:image\/png;base64,/);
  await page.locator('#export-menu-toggle').click();
  await page.locator('#export-svg-btn').click();
  expect((await readMessages(page)).some((m) => m.type === 'exportSvg')).toBe(
    true
  );
  await page.locator('#open-kicad-btn').click();
  expect((await readMessages(page)).some((m) => m.type === 'openInKiCad')).toBe(
    true
  );
  await page.locator('#reload-btn').click();
  await expect(page.locator('#viewer-status')).toHaveText(
    'Interactive renderer loaded: KICAD_TEST.kicad_sch',
    { timeout: 30000 }
  );
});

test('schematic child selection requests real file opening; board-like fake sheet attribute is never used', async ({
  page
}) => {
  await startSchematic(page, [
    { id: 'child', name: 'Power', file: 'power.kicad_sch' }
  ]);
  const picker = page.locator('#sheet-select');
  await expect(picker).toBeEnabled();
  await expect(picker.locator('option')).toHaveText(['Root sheet', 'Power']);
  await picker.selectOption('child');
  await expect(picker).toHaveValue('root');
  await expect(page.locator('kicanvas-embed')).not.toHaveAttribute('sheet');
  const message: any = (await readMessages(page)).find(
    (m) => m.type === 'openSchematicSheet'
  );
  expect(message?.payload).toEqual({ id: 'child' });
  await page.evaluate(() =>
    window.postMessage(
      {
        type: 'sheetOpenResult',
        payload: { ok: false, message: 'Sheet is missing' }
      },
      window.location.origin
    )
  );
  await expect(page.locator('#viewer-status')).toHaveText('Sheet is missing');
});

test('single-sheet schematic presents a disabled sheet chooser rather than fake navigation', async ({
  page
}) => {
  await startSchematic(page);
  await expect(page.locator('#sheet-select')).toBeDisabled();
  await expect(page.locator('#sheet-select option')).toHaveText('Root sheet');
});
