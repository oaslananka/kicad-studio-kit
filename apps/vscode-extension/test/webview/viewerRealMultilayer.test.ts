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

  // The real copper inspection affordance must be a discoverable action,
  // not a control inserted into the explanatory layer-hint sentence.
  const copperActions = page.getByRole('group', {
    name: 'Copper layer inspection'
  });
  await expect(
    copperActions.getByRole('button', { name: 'Inspect native layer' })
  ).toBeVisible();
  await expect(page.locator('#layer-hint button')).toHaveCount(0);
  const actionLayout = await page.evaluate(() => {
    const hint = document.querySelector('#layer-hint')!.getBoundingClientRect();
    const actions = document
      .querySelector('#layer-inspection-actions')!
      .getBoundingClientRect();
    const side = document
      .querySelector('#layers-section')!
      .getBoundingClientRect();
    return {
      hintBottom: hint.bottom,
      actionsTop: actions.top,
      actionsRight: actions.right,
      sideRight: side.right
    };
  });
  expect(actionLayout.actionsTop).toBeGreaterThanOrEqual(
    actionLayout.hintBottom
  );
  expect(actionLayout.actionsRight).toBeLessThanOrEqual(
    actionLayout.sideRight + 1
  );

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

  // The actual shipped KiCanvas embed has no fitToScreen/zoomIn/zoomOut API.
  // Verify that toolbar + keyboard commands change its real camera instead of
  // merely updating the percentage label on our wrapper.
  const cameraZoom = () =>
    page.evaluate(() => {
      const embed = document.querySelector('kicanvas-embed') as any;
      const renderer =
        embed?.viewer ||
        embed?.shadowRoot?.querySelector('kc-board-app')?.viewer;
      return renderer?.viewport?.camera?.zoom as number;
    });
  const fitted = await cameraZoom();
  expect(fitted).toBeGreaterThan(0);
  await page.locator('#zoom-in-btn').click();
  expect(await cameraZoom()).toBeCloseTo(fitted * 1.2, 4);
  await expect(page.locator('#zoom-level')).toHaveText('120%');
  await page.locator('#zoom-out-btn').click();
  expect(await cameraZoom()).toBeCloseTo(fitted, 4);
  await expect(page.locator('#zoom-level')).toHaveText('100%');
  await page.locator('#zoom-in-btn').focus();
  await page.keyboard.press('+');
  expect(await cameraZoom()).toBeCloseTo(fitted * 1.2, 4);
  await page.keyboard.press('f');
  expect(await cameraZoom()).toBeCloseTo(fitted, 4);
  await expect(page.locator('#zoom-level')).toHaveText('100%');

  await expect(page.locator('#layer-hint')).toContainText('Solo: In3.Cu');
  await page.locator('#zone-fills-btn').click();
  await expect(page.locator('#zone-fills-btn')).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  expect(
    await page.evaluate(() => {
      const embed = document.querySelector('kicanvas-embed') as any;
      const renderer =
        embed?.viewer ||
        embed?.shadowRoot?.querySelector('kc-board-app')?.viewer;
      return [...renderer.layers.zone_layers()].every(
        (layer: any) => layer.opacity === 0
      );
    })
  ).toBe(true);
  await page.locator('#zone-fills-btn').click();
  await expect(page.locator('#zone-fills-btn')).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  const actualGridOpacity = () =>
    page.evaluate(() => {
      const embed = document.querySelector('kicanvas-embed') as any;
      const renderer =
        embed?.viewer ||
        embed?.shadowRoot?.querySelector('kc-board-app')?.viewer;
      return renderer.layers.by_name(':Grid').opacity as number;
    });
  expect(await actualGridOpacity()).toBe(0);
  await page.locator('#grid-toggle').click();
  expect(await actualGridOpacity()).toBe(1);
  await page.locator('#grid-toggle').click();
  expect(await actualGridOpacity()).toBe(0);

  const actualTheme = () =>
    page.evaluate(() => {
      const embed = document.querySelector('kicanvas-embed') as any;
      const app = embed?.shadowRoot?.querySelector('kc-board-app');
      const canvas = app?.shadowRoot
        ?.querySelector('kc-board-viewer')
        ?.shadowRoot?.querySelector('canvas');
      const host = canvas?.getRootNode()?.host;
      return {
        theme: host?.theme as string | undefined,
        background: host?.viewer?.theme?.background?.to_css?.() as
          string | undefined
      };
    });
  const dark = await actualTheme();
  await page.locator('#theme-toggle').click();
  const light = await actualTheme();
  expect(light.theme).toBe('light');
  expect(light.background).not.toEqual(dark.background);
  await page.locator('#theme-toggle').click();
  expect((await actualTheme()).theme).toBe('kicad');
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
      window.location.origin
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

// This exercises the real bundled KiCanvas API; the DOM mock deliberately
// cannot prove that a footprint was selected and the camera changed.
test('real KiCanvas reference search focuses a valid footprint and rejects unknown names', async ({
  page
}) => {
  await installVsCodeApiMock(page);
  const html = createViewerHtml(
    {
      fileName: 'sample.kicad_pcb',
      fileType: 'board',
      base64: readFixtureBase64('sample.kicad_pcb'),
      metadata: {
        layers: ['F.Cu', 'B.Cu', 'Edge.Cuts'].map((name) => ({
          name,
          visible: true,
          kind: name.endsWith('.Cu') ? 'signal' : 'user'
        }))
      },
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
  await page.goto('https://studio-test.example/real-reference');
  await expect(page.locator('#viewer-status')).toHaveText(
    'Interactive renderer loaded: sample.kicad_pcb',
    { timeout: 30000 }
  );
  const camera = () =>
    page.evaluate(() => {
      const embed = document.querySelector('kicanvas-embed') as any;
      const renderer =
        embed?.viewer ||
        embed?.shadowRoot?.querySelector('kc-board-app')?.viewer;
      return {
        x: renderer.viewport.camera.center.x as number,
        y: renderer.viewport.camera.center.y as number,
        zoom: renderer.viewport.camera.zoom as number
      };
    });
  const before = await camera();
  await page.locator('#reference-search').fill('MISSING');
  await page.locator('#reference-search-btn').click();
  await expect(page.locator('#reference-search')).toHaveAttribute(
    'aria-invalid',
    'true'
  );
  await expect(page.locator('#viewer-status')).toContainText('not found');
  expect(await camera()).toEqual(before);

  await page.locator('#reference-search').fill('R1');
  await page.locator('#reference-search-btn').click();
  await expect(page.locator('#reference-search')).not.toHaveAttribute(
    'aria-invalid',
    'true'
  );
  await expect(page.locator('#viewer-status')).toContainText(
    'Focused reference: R1'
  );
  await expect(page.locator('kicanvas-embed')).toHaveAttribute(
    'selected-reference',
    'R1'
  );
  const after = await camera();
  expect(
    after.x !== before.x || after.y !== before.y || after.zoom !== before.zoom
  ).toBe(true);
});
