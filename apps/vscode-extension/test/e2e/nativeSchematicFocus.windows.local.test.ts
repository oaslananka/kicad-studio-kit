import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const sourceDir = path.resolve(__dirname, '../../../../examples/led-basic');
const filename = 'KICAD_TEST.kicad_sch';

test('native VS Code focuses an actual KiCad 10 symbol in the interactive schematic canvas', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1',
    'Opt-in physical Windows extension host and KiCad 10 schematic acceptance'
  );
  test.setTimeout(170_000);
  const original = path.join(sourceDir, filename);
  const initialHash = createHash('sha256')
    .update(fs.readFileSync(original))
    .digest('hex');
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: sourceDir
  });
  try {
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60_000
    });
    const source = session.page
      .locator('.explorer-folders-view')
      .getByText(filename, { exact: true });
    await expect(source).toBeVisible();
    await source.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(filename);
    let frame: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const candidate of session.page.frames()) {
            if (await candidate.locator('#reference-search').count()) {
              frame = candidate;
              return true;
            }
          }
          return false;
        },
        { timeout: 50_000 }
      )
      .toBe(true);
    if (!frame) throw new Error('KiCad schematic custom editor not mounted');
    await expect(frame.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded: KICAD_TEST.kicad_sch',
      { timeout: 70_000 }
    );
    const rendererState = () =>
      frame!.evaluate(() => {
        const embed = document.querySelector('kicanvas-embed') as any;
        const viewer =
          embed?.shadowRoot?.querySelector('kc-schematic-app')?.viewer;
        const box = viewer?.viewport?.camera?.bbox;
        const selection = viewer?.selected;
        const canvas = embed?.shadowRoot
          ?.querySelector('kc-schematic-app')
          ?.shadowRoot?.querySelector('kc-schematic-viewer')
          ?.shadowRoot?.querySelector('canvas');
        return {
          width: canvas?.clientWidth ?? 0,
          height: canvas?.clientHeight ?? 0,
          bounds: box ? { x: box.x, y: box.y, w: box.w, h: box.h } : null,
          selected: selection
            ? {
                x: selection.x,
                y: selection.y,
                w: selection.w,
                h: selection.h
              }
            : null
        };
      });
    const before = await rendererState();
    expect(before.width).toBeGreaterThan(250);
    expect(before.height).toBeGreaterThan(150);
    await frame.locator('#reference-search').fill('r1');
    await frame.locator('#reference-search-btn').click();
    await expect(frame.locator('#viewer-status')).toHaveText(
      'Focused schematic reference: R1'
    );
    const after = await rendererState();
    expect(after.selected).not.toBeNull();
    expect(after.bounds).not.toBeNull();
    expect(after.bounds).not.toEqual(before.bounds);
    expect(after.bounds!.w).toBeLessThan(before.bounds!.w);
    console.log('NATIVE_WINDOWS_SCHEMATIC_CAMERA_FOCUS=PASS');
    const finalHash = createHash('sha256')
      .update(fs.readFileSync(path.join(session.workspacePath, filename)))
      .digest('hex');
    expect(finalHash).toEqual(initialHash);
  } finally {
    await session.close();
  }
});
