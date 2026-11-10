import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

// Explicit local-only acceptance against an unmodified installed KiCad 10
// 12-layer dense engineering board. No manufacturer/cloud interaction.
const demoDir =
  process.platform === 'linux'
    ? '/usr/share/kicad/demos/vme-wren'
    : path.join(
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

test('real KiCad 10 dense PCB keeps partial previews and original copper plots distinct', async () => {
  const optedIn =
    (process.platform === 'win32' &&
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE === '1') ||
    (process.platform === 'linux' &&
      process.env.KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE === '1');
  // Deliberately opt-in: hosted CI has no genuine installed KiCad 10 VME
  // Wren board or native desktop. A skip is not an A2 acceptance PASS.
  test.skip(
    !optedIn || !fs.existsSync(path.join(demoDir, boardName)),
    'Local Windows/Linux native KiCad 10 acceptance only'
  );
  // Full native source plotting is an explicit slower user action on a
  // large PCB, distinct from the fast bounded page-level inspection.
  test.setTimeout(345_000);

  const original = path.join(demoDir, boardName);
  const expectedHash = sha256(original);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demoDir
  });
  try {
    const workspaceBoard = path.join(session.workspacePath, boardName);
    expect(sha256(workspaceBoard)).toBe(expectedHash);
    // The real user opens the board first. KiCad Studio's custom-editor
    // activation may not be complete when a large workspace first appears.
    const picker = session.page.locator('.quick-input-widget');
    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(boardName);
    await expect(picker).toContainText(boardName, { timeout: 30_000 });
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(boardName);
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60_000
    });

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
    const partial = viewer.locator('#partial-preview-section');
    // A persisted workspace may already have the tools expanded.
    // Blindly clicking the toggle would close the user's ready panel.
    if (!(await partial.isVisible())) {
      await viewer.locator('#side-panel-toggle').click();
    }
    await expect(partial).toBeVisible();
    await viewer.locator('#partial-x-min').fill('125');
    await viewer.locator('#partial-x-max').fill('425');
    await viewer.locator('#partial-y-min').fill('195');
    await viewer.locator('#partial-y-max').fill('290');
    // Invalid region fails quickly without touching or rendering the huge PCB.
    await viewer.locator('#partial-start-btn').click();
    await expect(viewer.locator('#partial-preview-status')).toContainText(
      'no larger than 250 x 250 mm',
      { timeout: 12_000 }
    );
    await expect(viewer.locator('#viewer-engine-badge')).toHaveText(
      'Metadata only'
    );
    await expect(viewer.locator('#partial-preview-banner')).toBeHidden();
    await viewer.locator('#partial-x-max').fill('215');
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
    const remainingSegments = async (): Promise<number> => {
      const message = await viewer!
        .locator('#partial-preview-status')
        .textContent();
      const count = /Not loaded in this region:\s*(\d+) segments/.exec(
        message ?? ''
      )?.[1];
      // The status briefly switches to a loading message between pages.
      // Poll until the next genuine omission count becomes available.
      return count === undefined ? Number.POSITIVE_INFINITY : Number(count);
    };
    const omittedBefore = await remainingSegments();
    await expect(viewer.locator('#partial-preview-status')).toContainText(
      /[0-9]+ copper arcs/
    );
    await expect(viewer.locator('#partial-preview-status')).toContainText(
      'Net continuity unverified'
    );
    expect(Number.isFinite(omittedBefore)).toBe(true);
    expect(omittedBefore).toBeGreaterThan(0);
    await expect(viewer.locator('#export-png-btn')).toBeDisabled();
    await expect(viewer.locator('#export-svg-btn')).toBeDisabled();
    await expect(viewer.locator('#reference-search')).toBeDisabled();
    await expect(viewer.locator('#net-search')).toBeDisabled();
    // A PARTIAL snapshot has no zone objects; it must never offer a
    // seemingly functional Show/Hide fills button.
    const zoneToggle = viewer.locator('#zone-fills-btn');
    await expect(zoneToggle).toBeDisabled();
    await expect(zoneToggle).toHaveText('Zone fills unavailable');
    await expect(viewer.locator('#partial-next-btn')).toBeEnabled();

    await viewer.locator('#partial-next-btn').click();
    await expect
      .poll(remainingSegments, { timeout: 45_000 })
      .toBeLessThan(omittedBefore);
    await expect(viewer.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded',
      { timeout: 45_000 }
    );
    await expect(viewer.locator('#partial-preview-banner')).toBeVisible();
    await expect(viewer.locator('#partial-preview-banner')).toContainText(
      'Use Open in KiCad above to inspect the original board'
    );
    const fullBoardAction = viewer.getByRole('button', {
      name: 'Open in KiCad',
      exact: true
    });
    await expect(fullBoardAction).toBeVisible();
    await expect(fullBoardAction).toBeEnabled();
    // Do not launch a separate 71-MB KiCad GUI from the acceptance runner:
    // real host route uses document.uri; the webview action contract tests
    // the actual outbound message without touching the source file.
    await expect(viewer.locator('#partial-preview-status')).toContainText(
      /[0-9]+ copper arcs/
    );
    await expect(viewer.locator('#partial-preview-status')).toContainText(
      'Net continuity unverified'
    );
    await expect(zoneToggle).toBeDisabled();
    await expect(zoneToggle).toHaveText('Zone fills unavailable');
    // Real large-board custom editor: the native KiCad inspector must plot
    // ONLY the accumulated bounded geometry, never launch a full-board export
    // because a PARTIAL page happened to be in front of the user.
    await viewer.getByRole('button', { name: 'Focus In2.Cu' }).click();
    // Verified independently against installed pcbnew's real zone outlines:
    // 8 In2.Cu zone definitions, 6 source outlines intersect this viewport.
    // Of those, only four cached KiCad fills overlap this region; the
    // source outline count must NEVER be presented as filled copper.
    await expect(viewer.locator('#layer-hint')).toContainText(
      '8/128 omitted source zones declare In2.Cu; 6 source zone outlines overlap this region'
    );
    await expect(viewer.locator('#layer-hint')).toContainText(
      'Actual zone fills and electrical connectivity are unverified.'
    );
    const nativeLayer = viewer.getByRole('button', {
      name: 'Inspect partial layer'
    });
    await expect(nativeLayer).toBeVisible();
    await nativeLayer.click();
    await expect(viewer.locator('#viewer-status')).toContainText(
      'Native KiCad In2.Cu PARTIAL plot',
      { timeout: 60000 }
    );
    await expect(viewer.locator('#svg-fallback-view')).toBeVisible();
    await expect(viewer.locator('#partial-preview-banner')).toBeVisible();
    const genuineShapes = await viewer
      .locator('#svg-fallback-view svg circle, #svg-fallback-view svg path')
      .count();
    console.log('NATIVE_VME_BOUNDED_NATIVE_IN2_SHAPES=' + genuineShapes);
    expect(genuineShapes).toBeGreaterThan(0);
    // A separate explicit click uses the *full original* board for a
    // native In2.Cu plot; it must not silently replace the partial page.
    const originalLayer = viewer.getByRole('button', {
      name: 'Inspect original layer'
    });
    await expect(originalLayer).toBeVisible();
    await originalLayer.click();
    await expect(viewer.locator('#viewer-status')).toContainText(
      'Native KiCad In2.Cu FULL ORIGINAL BOARD plot',
      { timeout: 90_000 }
    );
    const allSourceShapes = await viewer
      .locator('#svg-fallback-view svg circle, #svg-fallback-view svg path')
      .count();
    console.log('NATIVE_VME_FULL_ORIGINAL_IN2_SHAPES=' + allSourceShapes);
    expect(allSourceShapes).toBeGreaterThan(genuineShapes);
    expect(allSourceShapes).toBeGreaterThan(1_000);
    await expect(viewer.locator('#partial-preview-banner')).toBeVisible();
    await expect(viewer.locator('#viewer-status')).toContainText(
      'not DRC or net-continuity validation'
    );
    // Outer copper must use the same explicit, user-triggered FULL
    // ORIGINAL path. No automatic full-board plot may replace PARTIAL.
    for (const outer of ['B.Cu', 'F.Cu']) {
      // The single-layer native SVG disables KiCanvas layer controls.
      // The visible Reload Viewer action restores the interactive selector
      // before the user explicitly requests a different source layer.
      await viewer.getByRole('button', { name: 'Reload viewer' }).click();
      // Reload enables layer controls before its asynchronous KiCanvas
      // preparation completes. Only focus after the original layer viewer
      // is actually ready, or the restoreState pass can reset selection.
      await expect(viewer.locator('#viewer-status')).toContainText(
        'Interactive renderer loaded',
        { timeout: 45_000 }
      );
      const focus = viewer.getByRole('button', { name: 'Focus ' + outer });
      await expect(focus).toBeEnabled({ timeout: 30_000 });
      await focus.click();
      await expect(focus).toHaveAttribute('aria-pressed', 'true');
      await expect(viewer.locator('#layer-hint')).toContainText(
        'Focused: ' + outer
      );
      const inspectOriginal = viewer.getByRole('button', {
        name: 'Inspect original layer'
      });
      await expect(inspectOriginal).toBeVisible();
      await expect(inspectOriginal).toBeEnabled();
      await inspectOriginal.click();
      await expect(viewer.locator('#viewer-status')).toContainText(
        'Native KiCad ' + outer + ' FULL ORIGINAL BOARD plot',
        { timeout: 90_000 }
      );
      const nativeOuterShapes = await viewer
        .locator('#svg-fallback-view svg circle, #svg-fallback-view svg path')
        .count();
      console.log(
        'NATIVE_VME_FULL_ORIGINAL_' + outer + '_SHAPES=' + nativeOuterShapes
      );
      expect(nativeOuterShapes).toBeGreaterThan(1_000);
      await expect(viewer.locator('#partial-preview-banner')).toBeVisible();
      await expect(viewer.locator('#viewer-status')).toContainText(
        'not DRC or net-continuity validation'
      );
      expect(sha256(original)).toBe(expectedHash);
      expect(sha256(workspaceBoard)).toBe(expectedHash);
    }
    expect(sha256(original)).toBe(expectedHash);
    expect(sha256(workspaceBoard)).toBe(expectedHash);
    console.log('NATIVE_VME_OPT_IN_PARTIAL_UI_TWO_PAGES=PASS_READ_ONLY');
    await test.info().attach('native-vme-opt-in-partial-preview', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});
