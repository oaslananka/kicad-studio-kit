import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import {
  createViewerHtml,
  dataUri,
  installVsCodeApiMock,
  readAsset,
  readFixtureBase64,
  withVsCodeApiPrelude
} from './webviewTestHarness';

test('real KiCanvas renders an eight-layer PCB and changes its pixels when isolated', async ({
  page
}) => {
  await installVsCodeApiMock(page);
  const layers = [
    'F.Cu',
    ...Array.from({ length: 6 }, (_, index) => `In${index + 1}.Cu`),
    'B.Cu',
    'Edge.Cuts'
  ].map((name) => ({ name, kind: 'signal', visible: true }));
  const html = createViewerHtml(
    {
      fileName: 'multilayer_traces.kicad_pcb',
      fileType: 'board',
      base64: readFixtureBase64('kicad10/multilayer_traces.kicad_pcb'),
      metadata: { layers },
      restoreState: {
        zoom: 1,
        grid: false,
        theme: 'kicad',
        toolsPanelCollapsed: false
      },
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
    'Interactive renderer loaded: multilayer_traces.kicad_pcb',
    { timeout: 30000 }
  );
  const surfaceLayout = await page.evaluate(() => {
    const embed = document.querySelector('kicanvas-embed') as HTMLElement;
    const find = (root: any, selector: string): any => {
      if (!root) return null;
      if (root.matches?.(selector)) return root;
      if (root.shadowRoot) {
        const found = find(root.shadowRoot, selector);
        if (found) return found;
      }
      for (const element of root.children || []) {
        const found = find(element, selector);
        if (found) return found;
      }
      return null;
    };
    const board = find(embed, 'kc-board-viewer') as HTMLElement;
    const canvas = find(embed, 'canvas') as HTMLCanvasElement;
    return {
      embedBackground: getComputedStyle(embed).backgroundColor,
      boardHeight: board?.clientHeight,
      canvasWidth: canvas?.clientWidth,
      canvasHeight: canvas?.clientHeight,
      embedWidth: embed.clientWidth,
      embedHeight: embed.clientHeight
    };
  });
  expect(surfaceLayout.embedBackground).not.toBe('rgb(0, 255, 255)');
  expect(surfaceLayout.boardHeight).toBeGreaterThan(
    surfaceLayout.embedHeight * 0.8
  );
  expect(surfaceLayout.canvasWidth).toBeGreaterThan(
    surfaceLayout.embedWidth * 0.8
  );
  expect(surfaceLayout.canvasHeight).toBeGreaterThan(
    surfaceLayout.embedHeight * 0.8
  );
  await expect(
    page.locator('.layer-swatch[data-color-source="renderer"]')
  ).toHaveCount(9);

  const colors = await page
    .locator('.layer-swatch')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).style.backgroundColor)
    );
  expect(new Set(colors.slice(0, 8)).size).toBeGreaterThanOrEqual(4);

  const canvas = page.locator('#viewer-mount');
  const before = PNG.sync.read(await canvas.screenshot());
  await page.getByRole('button', { name: 'Focus In3.Cu' }).click();
  await page.getByRole('button', { name: 'Solo', exact: true }).click();
  await expect(page.locator('#layer-count')).toHaveText('1/9 visible');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  const after = PNG.sync.read(await canvas.screenshot());
  expect(before.width).toBe(after.width);
  expect(before.height).toBe(after.height);
  let changedPixels = 0;
  for (let index = 0; index < before.data.length; index += 4) {
    if (
      Math.abs(before.data[index]! - after.data[index]!) > 14 ||
      Math.abs(before.data[index + 1]! - after.data[index + 1]!) > 14 ||
      Math.abs(before.data[index + 2]! - after.data[index + 2]!) > 14
    ) {
      changedPixels++;
    }
  }
  expect(changedPixels).toBeGreaterThan(300);
});

// Larger boards use the same KiCad file structure as the validated eight-layer
// fixture above. Vary the layer count without introducing extra screenshot goldens.
for (const copperCount of [4, 16, 32]) {
  test(`real KiCanvas exposes all ${copperCount} copper layers for focused inspection`, async ({
    page
  }) => {
    await installVsCodeApiMock(page);
    const names = [
      'F.Cu',
      ...Array.from(
        { length: copperCount - 2 },
        (_, index) => `In${index + 1}.Cu`
      ),
      'B.Cu'
    ];
    const layers = names.map((name) => ({
      name,
      kind: 'signal',
      visible: true
    }));
    const board = [
      '(kicad_pcb',
      '  (version 20250314)',
      '  (generator "kicad")',
      '  (general (thickness 1.6))',
      '  (paper "A4")',
      '  (layers',
      ...names.map(
        (name, index) =>
          `    (${index === copperCount - 1 ? 31 : index} "${name}" signal)`
      ),
      '    (44 "Edge.Cuts" user)',
      '  )',
      '  (net 0 "")',
      '  (net 1 "TEST")',
      ...names.map(
        (name, index) =>
          `  (segment (start 87 ${81 + index * 2}) (end 138 ${81 + index * 2}) (width 1) (layer "${name}") (net 1) (uuid "10000000-2000-4000-8000-${String(index + 1).padStart(12, '0')}"))`
      ),
      ')'
    ].join('\n');
    const html = createViewerHtml(
      {
        fileName: `${copperCount}-layer.kicad_pcb`,
        fileType: 'board',
        base64: Buffer.from(board).toString('base64'),
        metadata: { layers },
        restoreState: {
          zoom: 1,
          grid: false,
          theme: 'kicad',
          toolsPanelCollapsed: false
        },
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
      `Interactive renderer loaded: ${copperCount}-layer.kicad_pcb`,
      { timeout: 30000 }
    );
    await expect(
      page.locator('.layer-swatch[data-color-source="renderer"]')
    ).toHaveCount(copperCount);
    await page
      .getByRole('button', {
        name: `Focus In${Math.floor((copperCount - 2) / 2)}.Cu`
      })
      .click();
    await page.locator('#layer-solo-btn').click();
    await expect(page.locator('#layer-count')).toHaveText(
      `1/${copperCount} visible`
    );
  });
}

test('real KiCanvas highlights named net connections, clears them, and rejects stale net names after refresh', async ({
  page
}) => {
  await installVsCodeApiMock(page);
  const layers = [
    'F.Cu',
    'In1.Cu',
    'In2.Cu',
    'In3.Cu',
    'In4.Cu',
    'In5.Cu',
    'In6.Cu',
    'B.Cu',
    'Edge.Cuts'
  ].map((name) => ({
    name,
    kind: name.endsWith('.Cu') ? 'signal' : 'user',
    visible: true
  }));
  const html = createViewerHtml(
    {
      fileName: 'multilayer_traces.kicad_pcb',
      fileType: 'board',
      base64: readFixtureBase64('kicad10/multilayer_traces.kicad_pcb'),
      metadata: { layers },
      restoreState: {
        zoom: 1,
        grid: false,
        theme: 'kicad',
        toolsPanelCollapsed: false
      },
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
  await page.goto('https://studio-test.example/net-inspection');
  await expect(page.locator('#viewer-status')).toHaveText(
    'Interactive renderer loaded: multilayer_traces.kicad_pcb',
    { timeout: 30000 }
  );
  await expect(page.locator('#nets-section')).toBeVisible();
  await expect(page.locator('#net-count')).toHaveText('1 net');
  await expect(page.locator('#net-suggestions option')).toHaveAttribute(
    'value',
    'TEST'
  );
  await expect(page.locator('#net-search')).toBeEnabled();
  await expect(page.locator('#net-clear-btn')).toBeDisabled();

  const surface = page.locator('#viewer-mount');
  const before = PNG.sync.read(await surface.screenshot());
  await page.locator('#net-search').fill('TEST');
  await page.locator('#net-search').press('Enter');
  await expect(page.locator('#net-feedback')).toContainText(
    'TEST · 8 tracks/arcs · 0 vias'
  );
  await expect(page.locator('#net-clear-btn')).toBeEnabled();
  const highlighted = PNG.sync.read(await surface.screenshot());
  let changed = 0;
  for (let i = 0; i < before.data.length; i += 4) {
    if (
      Math.abs(before.data[i]! - highlighted.data[i]!) > 14 ||
      Math.abs(before.data[i + 1]! - highlighted.data[i + 1]!) > 14 ||
      Math.abs(before.data[i + 2]! - highlighted.data[i + 2]!) > 14
    )
      changed++;
  }
  expect(changed).toBeGreaterThan(150);

  await page.locator('#net-clear-btn').click();
  await expect(page.locator('#net-feedback')).toHaveText(
    'Net highlight cleared.'
  );
  await expect(page.locator('#net-clear-btn')).toBeDisabled();
  const cleared = PNG.sync.read(await surface.screenshot());
  let remaining = 0;
  for (let i = 0; i < before.data.length; i += 4) {
    if (
      Math.abs(before.data[i]! - cleared.data[i]!) > 14 ||
      Math.abs(before.data[i + 1]! - cleared.data[i + 1]!) > 14 ||
      Math.abs(before.data[i + 2]! - cleared.data[i + 2]!) > 14
    )
      remaining++;
  }
  expect(remaining).toBeLessThan(150);

  await page.locator('#net-search').fill('TEST');
  await page.locator('#net-highlight-btn').click();
  await expect(page.locator('#net-clear-btn')).toBeEnabled();

  const replacement = [
    '(kicad_pcb',
    ' (version 20250314) (generator "kicad")',
    ' (general (thickness 1.6)) (paper "A4")',
    ' (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))',
    ' (net 0 "") (net 1 "DIFFERENT")',
    ' (segment (start 90 81) (end 140 81) (width 1) (layer "F.Cu") (net 1))',
    ')'
  ].join('\n');
  await page.evaluate((base64) => {
    window.postMessage(
      {
        type: 'refresh',
        payload: { base64, fileName: 'different.kicad_pcb' }
      },
      '*'
    );
  }, Buffer.from(replacement).toString('base64'));
  await expect(page.locator('#viewer-status')).toHaveText(
    'Interactive renderer loaded: different.kicad_pcb',
    { timeout: 30000 }
  );
  await expect(page.locator('#net-count')).toHaveText('1 net');
  await expect(page.locator('#net-search')).toHaveValue('');
  await expect(page.locator('#net-clear-btn')).toBeDisabled();
  await page.locator('#net-search').fill('TEST');
  await page.locator('#net-highlight-btn').click();
  await expect(page.locator('#net-feedback')).toContainText(
    'No exact net match'
  );
});
