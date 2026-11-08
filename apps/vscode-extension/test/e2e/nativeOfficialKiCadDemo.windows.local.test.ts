import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const boardName = 'RoyalBlue54L-Feather.kicad_pcb';
const demoDir =
  process.env.KICADSTUDIO_LOCAL_DEMOS_ROOT ??
  path.join(
    process.env.ProgramFiles ?? String.raw`C:\Program Files`,
    'KiCad',
    '10.0',
    'share',
    'kicad',
    'demos',
    'royalblue54L_feather'
  );

function sha256(fileName: string): string {
  return createHash('sha256').update(fs.readFileSync(fileName)).digest('hex');
}

test('Windows authentic KiCad 10 eight-copper-layer board renders, inspects, and preserves source', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(path.join(demoDir, boardName)),
    'Only on opted-in local Windows with the official KiCad 10 RoyalBlue54L demo'
  );
  test.setTimeout(150_000);

  const sourcePath = path.join(demoDir, boardName);
  const initialSourceHash = sha256(sourcePath);
  // The KiCad demo is a real board, not the synthetic multilayer fixture.
  // Verify its copper stackup and populated topology from source KiCad data.
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const copperLayers =
    sourceText.match(/^\s*\(\d+\s+"(?:F|B|In\d+)\.Cu"\s+signal\)/gm) ?? [];
  const footprintCount = (sourceText.match(/^\s*\(footprint\s/gm) ?? []).length;
  const viaCount = (sourceText.match(/^\s*\(via\s/gm) ?? []).length;
  expect(copperLayers).toHaveLength(8);
  expect(footprintCount).toBeGreaterThan(50);
  expect(viaCount).toBeGreaterThan(100);
  console.log(
    `WINDOWS_OFFICIAL_KICAD_DEMO_TOPOLOGY COPPER=${copperLayers.length} FOOTPRINTS=${footprintCount} VIAS=${viaCount}`
  );
  const start = Date.now();
  const mark = (phase: string) =>
    console.log(
      `WINDOWS_OFFICIAL_KICAD_DEMO ${phase} +${Date.now() - start}ms`
    );

  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demoDir
  });
  mark('VS_CODE_LAUNCHED');
  const copiedPath = path.join(session.workspacePath, boardName);

  try {
    expect(sha256(copiedPath)).toBe(initialSourceHash);
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 30000
    });
    mark('EXTENSION_ACTIVATED');

    const board = session.page
      .locator('.explorer-folders-view')
      .getByText(boardName, { exact: true });
    await expect(board).toBeVisible();
    await board.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(boardName);
    mark('BOARD_TAB_OPENED');

    let viewer: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const f of session.page.frames()) {
            if (await f.locator('#viewer-engine-badge').count()) {
              viewer = f;
              return true;
            }
          }
          return false;
        },
        { timeout: 45000 }
      )
      .toBe(true);
    if (!viewer) throw new Error('Official KiCad demo viewer did not mount.');
    await expect(viewer.locator('#viewer-engine-badge')).toHaveText(
      'KiCanvas',
      {
        timeout: 45000
      }
    );
    await expect(viewer.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded',
      { timeout: 90000 }
    );
    mark('INTERACTIVE_KICANVAS_READY');

    await viewer.locator('#side-panel-toggle').click();
    await expect(viewer.locator('#layers-section')).toBeVisible();
    const copper = viewer.locator(
      '.layer-swatch[data-color-source="renderer"]'
    );
    const layerCount = await copper.count();
    expect(layerCount).toBeGreaterThanOrEqual(8);
    await expect(
      viewer.getByRole('button', { name: 'Focus In3.Cu' })
    ).toBeVisible();

    await expect(viewer.locator('#net-count')).toContainText('nets');
    const netCountLabel =
      (await viewer.locator('#net-count').textContent()) ?? '';
    const netCount = Number.parseInt(netCountLabel, 10);
    expect(netCount).toBeGreaterThan(20);
    console.log(
      `WINDOWS_OFFICIAL_KICAD_DEMO_LAYER_SWATCHES=${layerCount} NETS=${netCount}`
    );

    await viewer.locator('#net-search').fill('GND');
    await viewer.locator('#net-highlight-btn').click();
    await expect(viewer.locator('#net-feedback')).toContainText('GND');
    await viewer.locator('#net-clear-btn').click();
    await expect(viewer.locator('#net-feedback')).toContainText(
      'Net highlight cleared'
    );

    await viewer.getByRole('button', { name: 'Focus In3.Cu' }).click();
    await viewer.locator('#layer-solo-btn').click();
    await expect(viewer.locator('#layer-count')).toContainText('1/');
    await viewer.locator('#all-layers-btn').click();
    await expect(viewer.locator('#layer-solo-btn')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    mark('NET_AND_LAYER_INTERACTIONS_PASSED');

    expect(sha256(copiedPath)).toBe(initialSourceHash);
    expect(sha256(sourcePath)).toBe(initialSourceHash);
    await test.info().attach('native-official-eight-layer-demo', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
    mark('SCREENSHOT_AND_HASHES_VERIFIED');
    console.log('WINDOWS_OFFICIAL_KICAD_REAL_EIGHT_LAYER=PASS');
  } finally {
    await session.close();
    mark('SESSION_CLOSED');
  }
});
