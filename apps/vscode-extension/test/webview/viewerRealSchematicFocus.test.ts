import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createViewerHtml,
  dataUri,
  installVsCodeApiMock,
  readAsset,
  withVsCodeApiPrelude
} from './webviewTestHarness';

interface SchematicCamera {
  app: boolean;
  width: number;
  height: number;
  selected?: { x: number; y: number; w: number; h: number };
  camera?: { x: number; y: number; w: number; h: number };
}

test('real bundled KiCanvas renders a KiCad 10 schematic and focuses a verified symbol', async ({
  page
}) => {
  await installVsCodeApiMock(page);
  const fixture = path.resolve(
    __dirname,
    '../../../../examples/led-basic/KICAD_TEST.kicad_sch'
  );
  const source = fs.readFileSync(fixture);
  const html = createViewerHtml(
    {
      fileName: 'KICAD_TEST.kicad_sch',
      fileType: 'schematic',
      base64: source.toString('base64'),
      metadata: { references: ['J1', 'R1', 'D1'] },
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
  await page.goto('https://studio-test.example/viewer');
  await expect(page.locator('#viewer-status')).toHaveText(
    'Interactive renderer loaded: KICAD_TEST.kicad_sch',
    { timeout: 30000 }
  );

  const camera = (): Promise<SchematicCamera> =>
    page.evaluate(() => {
      const embed = document.querySelector('kicanvas-embed') as any;
      const app = embed?.shadowRoot?.querySelector('kc-schematic-app') as any;
      const renderer = app?.viewer;
      const surface = app?.shadowRoot
        ?.querySelector('kc-schematic-viewer')
        ?.shadowRoot?.querySelector('canvas') as HTMLCanvasElement | undefined;
      const selected = renderer?.selected;
      const bbox = renderer?.viewport?.camera?.bbox;
      return {
        app: Boolean(app),
        width: surface?.clientWidth ?? 0,
        height: surface?.clientHeight ?? 0,
        ...(selected && {
          selected: {
            x: selected.x,
            y: selected.y,
            w: selected.w,
            h: selected.h
          }
        }),
        ...(bbox && {
          camera: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h }
        })
      };
    });
  const initial = await camera();
  expect(initial.app).toBe(true);
  expect(initial.width).toBeGreaterThan(800);
  expect(initial.height).toBeGreaterThan(400);
  expect(initial.camera).toBeDefined();

  const input = page.locator('#reference-search');
  await input.fill('UNKNOWN999');
  await page.locator('#reference-search-btn').click();
  await expect(page.locator('#viewer-status')).toContainText(
    'Reference UNKNOWN999 was not found in this schematic.'
  );
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  expect((await camera()).camera).toEqual(initial.camera);

  await input.fill('r1');
  await page.locator('#reference-search-btn').click();
  await expect(page.locator('#viewer-status')).toHaveText(
    'Focused schematic reference: R1'
  );
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('kicanvas-embed')).toHaveAttribute(
    'selected-reference',
    'R1'
  );
  const focused = await camera();
  expect(focused.selected).toBeDefined();
  expect(focused.camera).toBeDefined();
  expect(focused.camera).not.toEqual(initial.camera);
  expect(focused.camera!.w).toBeLessThan(initial.camera!.w);
  expect(focused.camera!.x).toBeLessThanOrEqual(focused.selected!.x);
  expect(focused.camera!.y).toBeLessThanOrEqual(focused.selected!.y);
  expect(focused.camera!.x + focused.camera!.w).toBeGreaterThanOrEqual(
    focused.selected!.x + focused.selected!.w
  );
  expect(focused.camera!.y + focused.camera!.h).toBeGreaterThanOrEqual(
    focused.selected!.y + focused.selected!.h
  );
  console.log('REAL_SCHEMATIC_KICANVAS_OBJECT_CAMERA_FOCUS=PASS');
});
