import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

// Explicit local-only acceptance against an unmodified installed KiCad 10
// 12-layer dense engineering board. No manufacturer/cloud interaction.
const demoDir = path.join(
  process.env.ProgramFiles ?? String.raw`C:\Program Files`,
  'KiCad',
  '10.0',
  'share',
  'kicad',
  'demos',
  'vme-wren'
);
const boardName = 'vme-wren.kicad_pcb';
function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('Windows actual dense PCB allows opt-in incomplete region pages without source changes', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(path.join(demoDir, boardName)),
    'Local Windows native KiCad 10 acceptance only'
  );
  test.setTimeout(110_000);

  const original = path.join(demoDir, boardName);
  const expectedHash = sha256(original);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demoDir
  });
  try {
    const workspaceBoard = path.join(session.workspacePath, boardName);
    expect(sha256(workspaceBoard)).toBe(expectedHash);
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 30_000
    });
    const picker = session.page.locator('.quick-input-widget');
    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(boardName);
    await expect(picker).toContainText(boardName, { timeout: 30_000 });
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(boardName);

    let viewer: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const frame of session.page.frames()) {
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
    if (!viewer)
      throw new Error('Dense board native custom editor did not mount.');
    await expect(viewer.locator('#viewer-engine-badge')).toHaveText(
      'Metadata only'
    );
    await expect(viewer.locator('#partial-preview-banner')).toBeHidden();
    await viewer.locator('#side-panel-toggle').click();
    const partial = viewer.locator('#partial-preview-section');
    await expect(partial).toBeVisible();
    await viewer.locator('#partial-x-min').fill('125');
    await viewer.locator('#partial-x-max').fill('215');
    await viewer.locator('#partial-y-min').fill('195');
    await viewer.locator('#partial-y-max').fill('290');
    await viewer.locator('#partial-start-btn').click();

    await expect(viewer.locator('#partial-preview-banner')).toBeVisible({
      timeout: 45_000
    });
    await expect(viewer.locator('#viewer-engine-badge')).toHaveText(
      'KiCanvas',
      {
        timeout: 45_000
      }
    );
    await expect(viewer.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded',
      { timeout: 45_000 }
    );
    await expect(viewer.locator('#partial-preview-status')).toContainText(
      '10544 segments',
      { timeout: 20_000 }
    );
    await expect(viewer.locator('#export-png-btn')).toBeDisabled();
    await expect(viewer.locator('#export-svg-btn')).toBeDisabled();
    await expect(viewer.locator('#reference-search')).toBeDisabled();
    await expect(viewer.locator('#net-search')).toBeDisabled();
    await expect(viewer.locator('#partial-next-btn')).toBeEnabled();

    await viewer.locator('#partial-next-btn').click();
    await expect(viewer.locator('#partial-preview-status')).toContainText(
      '10144 segments',
      { timeout: 45_000 }
    );
    await expect(viewer.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded',
      { timeout: 45_000 }
    );
    await expect(viewer.locator('#partial-preview-banner')).toBeVisible();
    expect(sha256(original)).toBe(expectedHash);
    expect(sha256(workspaceBoard)).toBe(expectedHash);
    console.log('WINDOWS_VME_OPT_IN_PARTIAL_UI_TWO_PAGES=PASS_READ_ONLY');
    await test.info().attach('windows-vme-opt-in-partial-preview', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});
