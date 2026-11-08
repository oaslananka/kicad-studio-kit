import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';
import {
  rebuildAccumulatedPcbPreview,
  selectBoundedPcbPreview
} from '../../src/providers/viewer/densePcbPreview';

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
test('Windows genuine 12-layer PCB displays two distinct cursor pages in native KiCanvas', async () => {
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
  const generated = path.join(base, 'VME-source-page-01.kicad_pcb');
  const generatedSecond = path.join(base, 'VME-source-page-02.kicad_pcb');
  const generatedCombined = path.join(base, 'VME-source-pages-01-02.kicad_pcb');
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
    const second = selectBoundedPcbPreview(source, {
      viewport: { minX: 125, minY: 195, maxX: 215, maxY: 290 },
      maxBytes: 2 * 1024 * 1024,
      cursor: sample.nextCursor,
      continuationToken: sample.continuationToken
    });
    expect(sample.madeProgress).toBe(true);
    expect(sample.hasNextPage).toBe(true);
    expect(second.madeProgress).toBe(true);
    expect(second.nextCursor['footprint']).toBeGreaterThan(
      sample.nextCursor['footprint']
    );
    expect(second.nextCursor['segment']).toBeGreaterThan(
      sample.nextCursor['segment']
    );
    expect(second.nextCursor['via']).toBeGreaterThan(sample.nextCursor['via']);
    const uuidsOnPage = (value: string) =>
      new Set(
        [...value.matchAll(/\(uuid\s+"([^"]+)"\)/g)]
          .map((match) => match[1])
          .filter((id): id is string => id !== undefined)
      );
    const firstUuids = uuidsOnPage(sample.text);
    const secondUuids = uuidsOnPage(second.text);
    expect(firstUuids.size).toBeGreaterThan(30);
    expect(secondUuids.size).toBeGreaterThan(30);
    expect([...firstUuids].filter((id) => secondUuids.has(id)).length).toBe(0);
    const combined = rebuildAccumulatedPcbPreview(source, second);
    const combinedUuids = uuidsOnPage(combined.text);
    expect(combined.complete).toBe(false);
    expect(combined.warning).toContain('PARTIAL PREVIEW');
    expect(combinedUuids.size).toBe(firstUuids.size + secondUuids.size);
    expect([...firstUuids].every((id) => combinedUuids.has(id))).toBe(true);
    expect([...secondUuids].every((id) => combinedUuids.has(id))).toBe(true);
    expect(combined.included['segment']).toBe(800);
    expect(combined.included['via']).toBe(200);
    fs.writeFileSync(generatedCombined, combined.text, 'utf8');
    fs.writeFileSync(generated, sample.text, 'utf8');
    fs.writeFileSync(generatedSecond, second.text, 'utf8');
    console.log(
      'VME_CURSOR_PAGE2=' +
        JSON.stringify(second.nextCursor) +
        ' REMAINING_AFTER_PAGE2=' +
        JSON.stringify(second.remainingAfterPage)
    );
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

    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(path.basename(generatedSecond));
    await expect(picker).toContainText(path.basename(generatedSecond), {
      timeout: 30_000
    });
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(
      path.basename(generatedSecond)
    );
    let secondViewer: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const frame of session!.page.frames()) {
            // The main VS Code frame has no viewer h1: do not invoke an
            // implicit 30-second Playwright wait on its missing element.
            if (!(await frame.locator('#viewer-engine-badge').count()))
              continue;
            const title = await frame
              .locator('h1')
              .first()
              .textContent({ timeout: 1000 })
              .catch(() => '');
            if (!title?.includes(path.basename(generatedSecond))) continue;
            secondViewer = frame;
            return true;
          }
          return false;
        },
        { timeout: 35_000 }
      )
      .toBe(true);
    if (!secondViewer) throw new Error('Second page viewer never mounted.');
    await expect(secondViewer.locator('#viewer-engine-badge')).toHaveText(
      'KiCanvas',
      {
        timeout: 35_000
      }
    );
    await expect(secondViewer.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded',
      { timeout: 35_000 }
    );
    console.log(
      'VME_TWO_CURSOR_PAGES_INTERACTIVE=PASS_INCOMPLETE_SEPARATE_PAGES'
    );

    // Both page payloads appear together in ONE incomplete KiCanvas board.
    // This is a bounded snapshot, not a seamless live overlay or full PCB.
    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(path.basename(generatedCombined));
    await expect(picker).toContainText(path.basename(generatedCombined), {
      timeout: 30_000
    });
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(
      path.basename(generatedCombined)
    );
    let combinedViewer: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const frame of session!.page.frames()) {
            if (!(await frame.locator('#viewer-engine-badge').count()))
              continue;
            const title = await frame
              .locator('h1')
              .first()
              .textContent({ timeout: 1000 })
              .catch(() => '');
            if (title?.includes(path.basename(generatedCombined))) {
              combinedViewer = frame;
              return true;
            }
          }
          return false;
        },
        { timeout: 35_000 }
      )
      .toBe(true);
    if (!combinedViewer)
      throw new Error('Accumulated preview viewer did not mount.');
    await expect(combinedViewer.locator('#viewer-engine-badge')).toHaveText(
      'KiCanvas',
      { timeout: 35_000 }
    );
    await expect(combinedViewer.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded',
      { timeout: 35_000 }
    );
    console.log('VME_ACCUMULATED_TWO_PAGES_SAME_CANVAS=PASS_PARTIAL_SNAPSHOT');

    expect(
      createHash('sha256').update(fs.readFileSync(vendorBoard)).digest('hex')
    ).toBe(originalHash);
    await test.info().attach('vme-bounded-two-cursor-pages', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session?.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
});
