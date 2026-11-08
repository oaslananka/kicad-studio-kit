import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';
import { selectBoundedPcbPreview } from '../../src/providers/viewer/densePcbPreview';

const vendorBoard = path.join(
  process.env.ProgramFiles ?? String.raw`C:\Program Files`,
  'KiCad',
  '10.0',
  'share',
  'kicad',
  'demos',
  'vme-wren',
  'vme-wren.kicad_pcb'
);

// A genuine-source viewport selection (not full-board geometry) is exercised
// in the actual VS Code custom viewer below. Do not treat this as DRC evidence.
test('Windows genuine 12-layer PCB bounded source subset reaches interactive KiCanvas', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(vendorBoard),
    'Opt-in local Windows with the installed KiCad 10 VME Wren source'
  );
  test.setTimeout(110_000);

  const originalHash = createHash('sha256')
    .update(fs.readFileSync(vendorBoard))
    .digest('hex');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-vme-subset-'));
  const generated = path.join(base, 'VME-source-subset.kicad_pcb');
  const started = Date.now();
  let session: Awaited<ReturnType<typeof launchVsCodeWithFixtures>> | undefined;

  try {
    const source = fs.readFileSync(vendorBoard, 'utf8');
    const sample = selectBoundedPcbPreview(source, {
      viewport: { minX: 125, minY: 195, maxX: 215, maxY: 290 },
      maxBytes: 2 * 1024 * 1024
    });
    expect(sample.complete).toBe(false);
    expect(sample.warning).toContain('PARTIAL PREVIEW');
    expect(sample.included['footprint']).toBeGreaterThan(0);
    expect(sample.included['segment']).toBeGreaterThan(0);
    expect(sample.included['via']).toBeGreaterThan(0);
    expect(sample.included['net']).toBeGreaterThan(1000);
    expect(sample.viewportTruncated).toBe(true);
    expect(sample.omittedInViewport['segment']).toBeGreaterThan(0);
    fs.writeFileSync(generated, sample.text, 'utf8');
    console.log(
      'VME_EXACT_SOURCE_SUBSET_PREP_MS=' +
        (Date.now() - started) +
        ' ORIGINAL_BYTES=' +
        fs.statSync(vendorBoard).size +
        ' SUBSET_BYTES=' +
        fs.statSync(generated).size +
        ' OBJECTS=' +
        JSON.stringify(sample.included) +
        ' OMITTED=' +
        JSON.stringify(sample.omitted) +
        ' IN_VIEW=' +
        JSON.stringify(sample.eligibleInViewport) +
        ' MISSED_IN_VIEW=' +
        JSON.stringify(sample.omittedInViewport)
    );
    expect(fs.statSync(generated).size).toBeLessThan(6 * 1024 * 1024);
    session = await launchVsCodeWithFixtures({ workspaceSourcePath: base });
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 30000
    });
    const picker = session.page.locator('.quick-input-widget');
    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(path.basename(generated));
    await expect(picker).toContainText(path.basename(generated), {
      timeout: 30000
    });
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(
      path.basename(generated)
    );

    let viewer: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const frame of session!.page.frames()) {
            if (await frame.locator('#viewer-engine-badge').count()) {
              viewer = frame;
              return true;
            }
          }
          return false;
        },
        { timeout: 35_000 }
      )
      .toBe(true);
    if (!viewer) throw new Error('Partial KiCad viewer never mounted.');
    await expect(viewer.locator('#viewer-engine-badge')).toHaveText(
      'KiCanvas',
      {
        timeout: 35000
      }
    );
    await expect(viewer.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded',
      { timeout: 35000 }
    );
    console.log('VME_BOUNDED_SUBSET_RENDER_MS=' + (Date.now() - started));
    console.log('VME_BOUNDED_SUBSET_INTERACTIVE=PASS_PARTIAL_NOT_FULL_BOARD');
    expect(
      createHash('sha256').update(fs.readFileSync(vendorBoard)).digest('hex')
    ).toBe(originalHash);
    await test.info().attach('vme-bounded-subset', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session?.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
});
